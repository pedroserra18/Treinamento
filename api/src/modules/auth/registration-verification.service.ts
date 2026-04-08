import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { redisClient } from "../../config/redis";
import { createHash, randomInt } from "node:crypto";
import { AppError } from "../../shared/errors/app-error";
import { sendEmail } from "../../shared/services/email.service";

type VerificationRecord = {
  codeHash: string;
  expiresAt: number;
  attempts: number;
};

type RequestRegisterEmailCodeResult = {
  delivery: "EMAIL";
};

const localVerificationMap = new Map<string, VerificationRecord>();

function verificationKey(email: string): string {
  return `auth:register:verification:${email.trim().toLowerCase()}`;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return String(randomInt(100000, 1000000));
}

async function setVerificationRecord(email: string, record: VerificationRecord): Promise<void> {
  const key = verificationKey(email);
  const ttlSeconds = env.emailVerificationTtlMin * 60;

  if (redisClient) {
    await redisClient.set(key, JSON.stringify(record), "EX", ttlSeconds);
    return;
  }

  localVerificationMap.set(key, record);
}

async function getVerificationRecord(email: string): Promise<VerificationRecord | null> {
  const key = verificationKey(email);

  if (redisClient) {
    const raw = await redisClient.get(key);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as VerificationRecord;
  }

  const record = localVerificationMap.get(key);
  if (!record) {
    return null;
  }

  if (record.expiresAt <= Date.now()) {
    localVerificationMap.delete(key);
    return null;
  }

  return record;
}

async function deleteVerificationRecord(email: string): Promise<void> {
  const key = verificationKey(email);

  if (redisClient) {
    await redisClient.del(key);
    return;
  }

  localVerificationMap.delete(key);
}

export async function requestRegisterEmailCode(email: string): Promise<RequestRegisterEmailCodeResult> {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true }
  });

  if (existing) {
    throw new AppError("Email already in use", {
      statusCode: 409,
      code: "EMAIL_ALREADY_IN_USE"
    });
  }

  const code = generateCode();
  const expiresAt = Date.now() + env.emailVerificationTtlMin * 60 * 1000;

  await setVerificationRecord(email, {
    codeHash: hashCode(code),
    expiresAt,
    attempts: 0
  });

  try {
    await sendEmail({
      to: email,
      subject: "Seu codigo de verificacao",
      text: `Seu codigo de verificacao e ${code}. Valido por ${env.emailVerificationTtlMin} minutos.`,
      html: `<p>Seu codigo de verificacao e <strong>${code}</strong>.</p><p>Valido por ${env.emailVerificationTtlMin} minutos.</p>`
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to deliver verification email. Check Resend API key and sender.";

    throw new AppError(message, {
      statusCode: 502,
      code: "EMAIL_DELIVERY_FAILED"
    });
  }

  return {
    delivery: "EMAIL"
  };
}

export async function verifyRegisterEmailCode(email: string, code: string): Promise<void> {
  const record = await getVerificationRecord(email);

  if (!record || record.expiresAt <= Date.now()) {
    await deleteVerificationRecord(email);
    throw new AppError("Verification code expired or not found", {
      statusCode: 400,
      code: "VERIFICATION_CODE_INVALID"
    });
  }

  if (record.attempts >= 5) {
    await deleteVerificationRecord(email);
    throw new AppError("Too many invalid verification attempts", {
      statusCode: 429,
      code: "VERIFICATION_CODE_ATTEMPTS_EXCEEDED"
    });
  }

  const valid = record.codeHash === hashCode(code);

  if (!valid) {
    await setVerificationRecord(email, {
      ...record,
      attempts: record.attempts + 1
    });

    throw new AppError("Invalid verification code", {
      statusCode: 400,
      code: "VERIFICATION_CODE_INVALID"
    });
  }

  await deleteVerificationRecord(email);
}
