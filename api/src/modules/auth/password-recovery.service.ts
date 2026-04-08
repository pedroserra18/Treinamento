import bcrypt from "bcryptjs";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { logoutSession } from "./auth.service";
import { redisClient } from "../../config/redis";
import { createHash, randomInt } from "node:crypto";
import { AppError } from "../../shared/errors/app-error";
import { sendEmail } from "../../shared/services/email.service";

type RecoveryRecord = {
  codeHash: string;
  expiresAt: number;
  attempts: number;
};

const localRecoveryMap = new Map<string, RecoveryRecord>();

function recoveryKey(email: string): string {
  return `auth:password-recovery:${email.trim().toLowerCase()}`;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return String(randomInt(100000, 1000000));
}

async function setRecoveryRecord(email: string, record: RecoveryRecord): Promise<void> {
  const key = recoveryKey(email);
  const ttlSeconds = env.emailVerificationTtlMin * 60;

  if (redisClient) {
    await redisClient.set(key, JSON.stringify(record), "EX", ttlSeconds);
    return;
  }

  localRecoveryMap.set(key, record);
}

async function getRecoveryRecord(email: string): Promise<RecoveryRecord | null> {
  const key = recoveryKey(email);

  if (redisClient) {
    const raw = await redisClient.get(key);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as RecoveryRecord;
  }

  const record = localRecoveryMap.get(key);
  if (!record) {
    return null;
  }

  if (record.expiresAt <= Date.now()) {
    localRecoveryMap.delete(key);
    return null;
  }

  return record;
}

async function deleteRecoveryRecord(email: string): Promise<void> {
  const key = recoveryKey(email);

  if (redisClient) {
    await redisClient.del(key);
    return;
  }

  localRecoveryMap.delete(key);
}

export async function requestForgotPasswordCode(email: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, status: true, isDeleted: true, passwordHash: true }
  });

  // Keep the response identical to avoid account enumeration.
  if (!user || user.isDeleted || user.status !== "ACTIVE" || !user.passwordHash) {
    return;
  }

  const code = generateCode();
  const expiresAt = Date.now() + env.emailVerificationTtlMin * 60 * 1000;

  await setRecoveryRecord(email, {
    codeHash: hashCode(code),
    expiresAt,
    attempts: 0
  });

  try {
    await sendEmail({
      to: email,
      subject: "Codigo para recuperar sua senha",
      text: `Seu codigo para recuperar a senha e ${code}. Valido por ${env.emailVerificationTtlMin} minutos.`,
      html: `<p>Seu codigo para recuperar a senha e <strong>${code}</strong>.</p><p>Valido por ${env.emailVerificationTtlMin} minutos.</p>`
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to deliver password recovery email. Check Resend API key and sender.";

    throw new AppError(message, {
      statusCode: 502,
      code: "EMAIL_DELIVERY_FAILED"
    });
  }
}

export async function confirmForgotPasswordWithCode(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  const record = await getRecoveryRecord(email);

  if (!record || record.expiresAt <= Date.now()) {
    await deleteRecoveryRecord(email);
    throw new AppError("Verification code expired or not found", {
      statusCode: 400,
      code: "VERIFICATION_CODE_INVALID"
    });
  }

  if (record.attempts >= 5) {
    await deleteRecoveryRecord(email);
    throw new AppError("Too many invalid verification attempts", {
      statusCode: 429,
      code: "VERIFICATION_CODE_ATTEMPTS_EXCEEDED"
    });
  }

  const valid = record.codeHash === hashCode(code);

  if (!valid) {
    await setRecoveryRecord(email, {
      ...record,
      attempts: record.attempts + 1
    });

    throw new AppError("Invalid verification code", {
      statusCode: 400,
      code: "VERIFICATION_CODE_INVALID"
    });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, status: true, isDeleted: true }
  });

  if (!user || user.isDeleted || user.status !== "ACTIVE") {
    await deleteRecoveryRecord(email);
    throw new AppError("User not found", {
      statusCode: 404,
      code: "USER_NOT_FOUND"
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0
    }
  });

  await logoutSession(user.id);
  await deleteRecoveryRecord(email);
}
