import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { OAuth2Client } from "google-auth-library";
import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../../shared/errors/app-error";
import { deriveHandleBase, generateUniqueHandle } from "../../shared/utils/handle";
import { classifyAccountType } from "../../shared/utils/account-type";
import { trackEvent } from "../../shared/services/event-log.service";
import { EventContext } from "../../shared/utils/event-context";
import { toSafeUser, type SafeUser } from "./auth.service";

const googleClient = new OAuth2Client(env.googleClientId);

// Campos que compõem o SafeUser devolvido ao cliente. Fonte única de verdade:
// o mapper `toSafeUser` do auth.service. Os SELECTs do Google precisam ficar
// alinhados a isto — foi a divergência (faltava avatarUrl e o tier/privacidade
// aqui) que sumia a foto e o badge PRO ao logar via Google.
export const SAFE_USER_SELECT = {
  id: true,
  name: true,
  handle: true,
  email: true,
  role: true,
  sex: true,
  availableDaysPerWeek: true,
  birthDate: true,
  heightCm: true,
  weightKg: true,
  experienceLevel: true,
  primaryGoal: true,
  plan: true,
  planExpiresAt: true,
  acceptedTermsAt: true,
  acceptedTermsVersion: true,
  onboardingCompletedAt: true,
  isPrivate: true,
  showFollowLists: true,
  avatarUrl: true
} as const;

type AuthTokens = {
  token: string;
  accessToken: string;
  refreshToken: string;
};

type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function createAccessToken(payload: { sub: string; role: "USER" | "COACH" | "ADMIN"; email: string }): string {
  const options: jwt.SignOptions = {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
    issuer: env.jwtIssuer,
    audience: env.jwtAudience
  };

  return jwt.sign(
    {
      ...payload,
      tokenType: "access"
    },
    env.jwtSecret,
    options
  );
}

function createRefreshToken(userId: string): string {
  const options: jwt.SignOptions = {
    expiresIn: env.jwtRefreshExpiresIn as jwt.SignOptions["expiresIn"],
    issuer: env.jwtIssuer,
    audience: env.jwtAudience
  };

  return jwt.sign(
    {
      sub: userId,
      tokenType: "refresh",
      jti: randomUUID()
    },
    env.jwtRefreshSecret,
    options
  );
}

function decodeExpirationDate(token: string): Date | null {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  if (!decoded?.exp) {
    return null;
  }

  return new Date(decoded.exp * 1000);
}

async function persistRefreshToken(userId: string, refreshToken: string): Promise<void> {
  await prisma.authProvider.upsert({
    where: {
      userId_provider: {
        userId,
        provider: "EMAIL_PASSWORD"
      }
    },
    update: {
      providerUserId: userId,
      refreshTokenHash: hashToken(refreshToken),
      tokenExpiresAt: decodeExpirationDate(refreshToken),
      revokedAt: null,
      lastUsedAt: new Date()
    },
    create: {
      userId,
      provider: "EMAIL_PASSWORD",
      providerUserId: userId,
      refreshTokenHash: hashToken(refreshToken),
      tokenExpiresAt: decodeExpirationDate(refreshToken),
      lastUsedAt: new Date()
    }
  });
}

async function issueTokenPair(user: { id: string; role: "USER" | "COACH" | "ADMIN"; email: string }) {
  const accessToken = createAccessToken({ sub: user.id, role: user.role, email: user.email });
  const refreshToken = createRefreshToken(user.id);

  await persistRefreshToken(user.id, refreshToken);

  return {
    token: accessToken,
    accessToken,
    refreshToken
  } as AuthTokens;
}

async function exchangeCodeForTokens(code: string): Promise<{ idToken: string }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleCallbackUrl,
      grant_type: "authorization_code"
    })
  });

  if (!response.ok) {
    throw new AppError("Failed to exchange Google authorization code", {
      statusCode: 401,
      code: "GOOGLE_CODE_EXCHANGE_FAILED"
    });
  }

  const data = (await response.json()) as { id_token?: string };
  if (!data.id_token) {
    throw new AppError("Missing Google id_token", {
      statusCode: 401,
      code: "GOOGLE_ID_TOKEN_MISSING"
    });
  }

  return { idToken: data.id_token };
}

async function verifyGoogleIdentity(idToken: string): Promise<GoogleProfile> {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: env.googleClientId
  });

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new AppError("Invalid Google identity payload", {
      statusCode: 401,
      code: "GOOGLE_IDENTITY_INVALID"
    });
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: Boolean(payload.email_verified),
    name: payload.name ?? null,
    picture: payload.picture ?? null
  };
}

export async function buildGoogleAuthorizationUrl(state: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleCallbackUrl,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "select_account"
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function loginWithGoogleCode(
  code: string,
  context: EventContext = {}
): Promise<{ tokens: AuthTokens; user: SafeUser }> {
  const { idToken } = await exchangeCodeForTokens(code);
  const google = await verifyGoogleIdentity(idToken);

  if (!google.emailVerified) {
    throw new AppError("Google account email is not verified", {
      statusCode: 403,
      code: "GOOGLE_EMAIL_NOT_VERIFIED"
    });
  }

  const provider = await prisma.authProvider.findUnique({
    where: {
      provider_providerUserId: {
        provider: "GOOGLE",
        providerUserId: google.sub
      }
    },
    include: {
      user: {
        select: {
          ...SAFE_USER_SELECT,
          isDeleted: true,
          status: true
        }
      }
    }
  });

  if (provider?.user && !provider.user.isDeleted && provider.user.status === "ACTIVE") {
    const tokens = await issueTokenPair(provider.user);

    await trackEvent({
      userId: provider.user.id,
      category: "AUTH",
      action: "login_success_google",
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    return {
      tokens,
      user: toSafeUser(provider.user)
    };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: google.email },
    select: {
      id: true,
      name: true,
      handle: true,
      email: true,
      role: true,
      sex: true,
      availableDaysPerWeek: true,
      onboardingCompletedAt: true,
      acceptedTermsAt: true,
      acceptedTermsVersion: true,
      isDeleted: true,
      status: true
    }
  });

  if (existingUser) {
    if (existingUser.isDeleted || existingUser.status !== "ACTIVE") {
      throw new AppError("User account is not active", {
        statusCode: 403,
        code: "ACCOUNT_NOT_ACTIVE"
      });
    }

    await trackEvent({
      userId: existingUser.id,
      category: "SECURITY",
      severity: "INFO",
      action: "google_login_email_conflict",
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { email: existingUser.email }
    });

    throw new AppError("Email already used by another login method. Link your Google account first.", {
      statusCode: 409,
      code: "EMAIL_CONFLICT_NEEDS_LINK",
      details: {
        email: existingUser.email
      }
    });
  }

  // Auto-generate a handle from the Google profile (display name first, then
  // email local-part as fallback). Collisions get a numeric suffix so two users
  // with the same first name can sign in without bumping into each other.
  const handleSeed = google.name?.trim() || google.email;
  const handleBase = deriveHandleBase(handleSeed.includes("@") ? handleSeed : `${handleSeed}@x`, google.sub);
  const handle = await generateUniqueHandle(handleBase);

  const createdUser = await prisma.user.create({
    data: {
      name: google.name,
      handle,
      avatarUrl: google.picture,
      email: google.email,
      normalizedEmail: google.email,
      sex: "OTHER",
      accountType: classifyAccountType(google.email),
      status: "ACTIVE",
      emailVerifiedAt: new Date()
    },
    select: { ...SAFE_USER_SELECT }
  });

  await prisma.authProvider.create({
    data: {
      userId: createdUser.id,
      provider: "GOOGLE",
      providerUserId: google.sub,
      lastUsedAt: new Date()
    }
  });

  const tokens = await issueTokenPair(createdUser);

  await trackEvent({
    userId: createdUser.id,
    category: "AUTH",
    action: "user_registered_google",
    resourceType: "user",
    resourceId: createdUser.id,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { handle: createdUser.handle }
  });

  return {
    tokens,
    user: toSafeUser(createdUser)
  };
}

export async function linkGoogleToAuthenticatedUser(
  userId: string,
  code: string,
  context: EventContext = {}
): Promise<{ tokens: AuthTokens; user: SafeUser }> {
  const { idToken } = await exchangeCodeForTokens(code);
  const google = await verifyGoogleIdentity(idToken);

  if (!google.emailVerified) {
    throw new AppError("Google account email is not verified", {
      statusCode: 403,
      code: "GOOGLE_EMAIL_NOT_VERIFIED"
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...SAFE_USER_SELECT,
      isDeleted: true,
      status: true
    }
  });

  if (!user || user.isDeleted || user.status !== "ACTIVE") {
    throw new AppError("User not found", {
      statusCode: 404,
      code: "USER_NOT_FOUND"
    });
  }

  if (user.email.toLowerCase() !== google.email.toLowerCase()) {
    throw new AppError("Google email must match authenticated user email for secure linking", {
      statusCode: 409,
      code: "GOOGLE_EMAIL_MISMATCH"
    });
  }

  const existingGoogleProvider = await prisma.authProvider.findUnique({
    where: {
      provider_providerUserId: {
        provider: "GOOGLE",
        providerUserId: google.sub
      }
    },
    select: {
      userId: true
    }
  });

  if (existingGoogleProvider && existingGoogleProvider.userId !== user.id) {
    throw new AppError("Google account already linked to another user", {
      statusCode: 409,
      code: "GOOGLE_ACCOUNT_ALREADY_LINKED"
    });
  }

  await prisma.authProvider.upsert({
    where: {
      userId_provider: {
        userId: user.id,
        provider: "GOOGLE"
      }
    },
    update: {
      providerUserId: google.sub,
      lastUsedAt: new Date(),
      revokedAt: null
    },
    create: {
      userId: user.id,
      provider: "GOOGLE",
      providerUserId: google.sub,
      lastUsedAt: new Date()
    }
  });

  const tokens = await issueTokenPair(user);

  await trackEvent({
    userId: user.id,
    category: "AUTH",
    action: "google_account_linked",
    resourceType: "auth_provider",
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent
  });

  return {
    tokens,
    user: toSafeUser(user)
  };
}
