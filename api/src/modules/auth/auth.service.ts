import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { redisClient } from "../../config/redis";
import { createHash, randomUUID } from "node:crypto";
import { AppError } from "../../shared/errors/app-error";
import { LoginBody, RefreshBody, RegisterBody } from "./auth.schema";
import { generateUniqueHandle } from "../../shared/utils/handle";
import { classifyAccountType } from "../../shared/utils/account-type";
import { trackEvent } from "../../shared/services/event-log.service";
import { EventContext } from "../../shared/utils/event-context";
import { SafeUser, toSafeUser } from "./auth-safe-user";

type AccessTokenPayload = {
  sub: string;
  role: "USER" | "COACH" | "ADMIN";
  email: string;
  tokenType: "access";
};

type RefreshTokenPayload = {
  sub: string;
  tokenType: "refresh";
  jti: string;
};


type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  token: string;
};

type AuthResult = {
  tokens: AuthTokens;
  user: SafeUser;
};

const localLockMap = new Map<string, number>();

function lockKey(email: string): string {
  return `auth:lock:${email.trim().toLowerCase()}`;
}

async function setLock(email: string, lockMinutes: number): Promise<void> {
  const key = lockKey(email);
  const expiresAt = Date.now() + lockMinutes * 60 * 1000;

  if (redisClient) {
    await redisClient.set(key, String(expiresAt), "EX", lockMinutes * 60);
    return;
  }

  localLockMap.set(key, expiresAt);
}

async function getLock(email: string): Promise<number | null> {
  const key = lockKey(email);

  if (redisClient) {
    const value = await redisClient.get(key);
    return value ? Number(value) : null;
  }

  const value = localLockMap.get(key);
  if (!value) {
    return null;
  }

  if (value <= Date.now()) {
    localLockMap.delete(key);
    return null;
  }

  return value;
}

async function clearLock(email: string): Promise<void> {
  const key = lockKey(email);

  if (redisClient) {
    await redisClient.del(key);
    return;
  }

  localLockMap.delete(key);
}

function calculateProgressiveLockMinutes(failedAttempts: number): number {
  if (failedAttempts < 3) {
    return 0;
  }

  const tier = failedAttempts - 3;
  const minutes = env.loginProgressiveBaseMin * 2 ** tier;
  return Math.min(minutes, env.loginProgressiveMaxMin);
}

function createAccessToken(payload: AccessTokenPayload): string {
  const options: jwt.SignOptions = {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
    issuer: env.jwtIssuer,
    audience: env.jwtAudience
  };

  return jwt.sign(payload, env.jwtSecret, {
    ...options
  });
}

function createRefreshToken(payload: RefreshTokenPayload): string {
  const options: jwt.SignOptions = {
    expiresIn: env.jwtRefreshExpiresIn as jwt.SignOptions["expiresIn"],
    issuer: env.jwtIssuer,
    audience: env.jwtAudience
  };

  return jwt.sign(payload, env.jwtRefreshSecret, {
    ...options
  });
}

function decodeExpirationDate(token: string): Date | null {
  const decoded = jwt.decode(token) as { exp?: number } | null;
  if (!decoded?.exp) {
    return null;
  }

  return new Date(decoded.exp * 1000);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function persistRefreshToken(userId: string, refreshToken: string): Promise<void> {
  const refreshTokenHash = hashToken(refreshToken);
  const tokenExpiresAt = decodeExpirationDate(refreshToken);

  await prisma.authProvider.upsert({
    where: {
      userId_provider: {
        userId,
        provider: "EMAIL_PASSWORD"
      }
    },
    update: {
      providerUserId: userId,
      refreshTokenHash,
      tokenExpiresAt,
      revokedAt: null,
      lastUsedAt: new Date()
    },
    create: {
      userId,
      provider: "EMAIL_PASSWORD",
      providerUserId: userId,
      refreshTokenHash,
      tokenExpiresAt,
      lastUsedAt: new Date()
    }
  });
}

async function issueTokenPair(user: { id: string; role: "USER" | "COACH" | "ADMIN"; email: string }) {
  const accessToken = createAccessToken({
    sub: user.id,
    role: user.role,
    email: user.email,
    tokenType: "access"
  });

  const refreshToken = createRefreshToken({
    sub: user.id,
    tokenType: "refresh",
    jti: randomUUID()
  });

  await persistRefreshToken(user.id, refreshToken);

  return {
    accessToken,
    refreshToken,
    token: accessToken
  };
}


export async function registerWithEmail(
  data: RegisterBody & { termsVersion?: string },
  context: EventContext = {}
): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true }
  });

  if (existing) {
    throw new AppError("Email already in use", {
      statusCode: 409,
      code: "EMAIL_ALREADY_IN_USE"
    });
  }

  // Resolve the requested handle: if it's taken, append a numeric suffix
  // rather than failing the signup — the client picked their preferred handle
  // already and we don't want a 409 on a small collision.
  const handle = await generateUniqueHandle(data.handle);

  const passwordHash = await bcrypt.hash(data.password, 12);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      handle,
      email: data.email,
      normalizedEmail: data.email,
      passwordHash,
      accountType: classifyAccountType(data.email),
      status: "ACTIVE",
      // Aceite dos termos vindo do checkbox no signup. Quando o cliente é
      // antigo e não envia, mantém null e o gate pede aceite na primeira
      // entrada autenticada.
      acceptedTermsAt: data.termsVersion ? new Date() : null,
      acceptedTermsVersion: data.termsVersion ?? null
    },
    select: {
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
      isPrivate: true, showFollowLists: true, avatarUrl: true
    }
  });

  const tokens = await issueTokenPair({
    id: user.id,
    role: user.role,
    email: user.email
  });

  await trackEvent({
    userId: user.id,
    category: "AUTH",
    action: "user_registered",
    resourceType: "user",
    resourceId: user.id,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { handle: user.handle }
  });

  return {
    tokens,
    user: toSafeUser(user)
  };
}

export async function loginWithEmail(data: LoginBody, context: EventContext = {}): Promise<AuthResult> {
  const currentLock = await getLock(data.email);
  if (currentLock && currentLock > Date.now()) {
    await trackEvent({
      category: "SECURITY",
      severity: "WARNING",
      action: "login_blocked_locked",
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { email: data.email, retryAfterMs: currentLock - Date.now() }
    });
    throw new AppError("Account temporarily locked due to repeated failed attempts", {
      statusCode: 423,
      code: "ACCOUNT_LOCKED",
      details: {
        retryAfterSeconds: Math.ceil((currentLock - Date.now()) / 1000)
      }
    });
  }

  const user = await prisma.user.findUnique({
    where: { email: data.email },
    select: {
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
      isPrivate: true, showFollowLists: true, avatarUrl: true,
      passwordHash: true,
      failedLoginAttempts: true,
      isDeleted: true,
      status: true
    }
  });

  if (!user?.passwordHash || user.isDeleted || user.status !== "ACTIVE") {
    throw new AppError("Invalid credentials", {
      statusCode: 401,
      code: "INVALID_CREDENTIALS"
    });
  }

  const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);
  if (!isPasswordValid) {
    const failedAttempts = user.failedLoginAttempts + 1;
    const lockMinutes = calculateProgressiveLockMinutes(failedAttempts);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: failedAttempts
      }
    });

    if (lockMinutes > 0) {
      await setLock(data.email, lockMinutes);
    }

    await trackEvent({
      userId: user.id,
      category: "SECURITY",
      severity: lockMinutes > 0 ? "WARNING" : "INFO",
      action: "login_failed",
      requestId: context.requestId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { email: data.email, failedAttempts, lockMinutes }
    });

    throw new AppError("Invalid credentials", {
      statusCode: 401,
      code: "INVALID_CREDENTIALS"
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lastLoginAt: new Date()
    }
  });
  await clearLock(data.email);

  await trackEvent({
    userId: user.id,
    category: "AUTH",
    action: "login_success",
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent
  });

  const tokens = await issueTokenPair({
    id: user.id,
    role: user.role,
    email: user.email
  });

  return {
    tokens,
    user: toSafeUser(user)
  };
}

export async function refreshSession(data: RefreshBody): Promise<AuthTokens> {
  let payload: RefreshTokenPayload;
  try {
    payload = jwt.verify(data.refreshToken, env.jwtRefreshSecret, {
      issuer: env.jwtIssuer,
      audience: env.jwtAudience
    }) as RefreshTokenPayload;
  } catch {
    throw new AppError("Invalid refresh token", {
      statusCode: 401,
      code: "INVALID_REFRESH_TOKEN"
    });
  }

  if (payload.tokenType !== "refresh") {
    throw new AppError("Invalid refresh token", {
      statusCode: 401,
      code: "INVALID_REFRESH_TOKEN"
    });
  }

  const session = await prisma.authProvider.findUnique({
    where: {
      userId_provider: {
        userId: payload.sub,
        provider: "EMAIL_PASSWORD"
      }
    },
    select: {
      id: true,
      refreshTokenHash: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          isDeleted: true,
          status: true
        }
      }
    }
  });

  if (
    !session?.refreshTokenHash ||
    session.revokedAt ||
    !session.user ||
    session.user.isDeleted ||
    session.user.status !== "ACTIVE"
  ) {
    throw new AppError("Refresh token revoked", {
      statusCode: 401,
      code: "REFRESH_TOKEN_REVOKED"
    });
  }

  const matches = hashToken(data.refreshToken) === session.refreshTokenHash;
  if (!matches) {
    throw new AppError("Invalid refresh token", {
      statusCode: 401,
      code: "INVALID_REFRESH_TOKEN"
    });
  }

  const tokens = await issueTokenPair({
    id: session.user.id,
    role: session.user.role,
    email: session.user.email
  });

  return tokens;
}

export async function logoutSession(userId: string, context: EventContext = {}): Promise<void> {
  const result = await prisma.authProvider.updateMany({
    where: {
      userId,
      provider: "EMAIL_PASSWORD",
      revokedAt: null
    },
    data: {
      revokedAt: new Date(),
      refreshTokenHash: null,
      accessTokenHash: null,
      tokenExpiresAt: null,
      lastUsedAt: new Date()
    }
  });

  await trackEvent({
    userId,
    category: "AUTH",
    action: "logout",
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { revokedSessions: result.count }
  });
}

// Valores pré-preenchidos para o quiz da IA: peso ATUAL (último registro
// de progresso > peso do perfil), altura/gênero/idade do perfil. Mantém o
// peso sempre em dia com o que o usuário registra na página de progresso
// (BodyMeasurement), em vez do peso estático do perfil — peso muda toda
// semana, altura quase nunca.

// Gestao de perfil (updates, onboarding, termos, delete, export) vive em
// auth-profile.service.ts. Reexportado aqui para o controller nao mudar imports.
export * from "./auth-profile.service";
