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
import { toSafeUser, type SafeUser } from "./auth-safe-user";

// Estado de conta relevante pra decidir se o login pode prosseguir. Espelha
// os campos do User que os gates consultam — nada além disso, pra a função
// abaixo continuar pura.
export type AccountGateState = {
  isDeleted: boolean;
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "DISABLED";
};

// Traduz o estado da conta no erro que o cliente recebe. PURA de propósito
// (sem Prisma, sem I/O): é o ponto onde um deslize deixaria alguém banido
// entrar, então precisa ser testável sem banco.
//
// Devolve null SÓ quando a conta pode entrar. A condição é exatamente a
// mesma de antes (isDeleted || status !== "ACTIVE" bloqueia) — o que muda é
// a mensagem, nunca quem passa.
//
// As mensagens não citam motivo, data ou quem decidiu: quem foi barrado
// precisa saber o que fazer, não conhecer a decisão de moderação. O canal de
// contato vive no cliente, porque o suporte interno exige login — e quem
// chega aqui justamente não consegue logar.
export function inactiveAccountError(account: AccountGateState): AppError | null {
  if (!account.isDeleted && account.status === "ACTIVE") {
    return null;
  }

  if (account.isDeleted) {
    return new AppError("Esta conta foi removida da plataforma.", {
      statusCode: 403,
      code: "ACCOUNT_BANNED"
    });
  }

  if (account.status === "SUSPENDED") {
    return new AppError("Esta conta está suspensa no momento.", {
      statusCode: 403,
      code: "ACCOUNT_SUSPENDED"
    });
  }

  if (account.status === "DISABLED") {
    return new AppError("Esta conta está desativada.", {
      statusCode: 403,
      code: "ACCOUNT_DISABLED"
    });
  }

  // PENDING (ou qualquer estado futuro do enum): barra por padrão. Preferimos
  // negar um caso desconhecido a liberar por omissão.
  return new AppError("Esta conta ainda não está ativa.", {
    statusCode: 403,
    code: "ACCOUNT_NOT_ACTIVE"
  });
}

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
    // Escopos básicos de identidade. São classificados pelo Google como
    // non-sensitive: não exigem o processo de verificação do app. Adicionar
    // qualquer coisa aqui (Gmail, Drive, Calendar) muda isso e passa a exigir
    // verificação — não mexer sem entender a consequência.
    scope: "openid email profile",
    state,
    // "online" e não "offline": usamos o Google só pra provar quem é o usuário
    // no momento do login. O exchangeCodeForTokens descarta tudo menos o
    // id_token, então pedir refresh token (offline) seria solicitar permissão
    // de agir em nome do usuário sem ele estar presente — permissão que o app
    // não usa. Menor privilégio conta a favor numa eventual verificação.
    access_type: "online",
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

    // Reancora o vínculo. deactivateUserAccount revoga TODOS os providers do
    // usuário; ao reativar, o EMAIL_PASSWORD se conserta sozinho no próximo
    // login (persistRefreshToken faz upsert com revokedAt: null), mas o GOOGLE
    // ficava revogado pra sempre — a pessoa entrava normalmente (este login
    // não consulta revokedAt) enquanto getGoogleLinkStatus, que exige
    // revokedAt: null, insistia em dizer "não conectado".
    //
    // Reativar aqui é seguro porque o portão de verdade é status === "ACTIVE",
    // checado logo acima: conta suspensa não chega neste ponto.
    await prisma.authProvider.update({
      where: { id: provider.id },
      data: { revokedAt: null, lastUsedAt: new Date() }
    });

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
    const blocked = inactiveAccountError(existingUser);
    if (blocked) {
      throw blocked;
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
