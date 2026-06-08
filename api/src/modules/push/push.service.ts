import webpush from "web-push";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { AppError } from "../../shared/errors/app-error";
import type {
  ScheduleNotificationBody,
  SubscribePushBody,
  UnsubscribePushBody
} from "./push.schema";

// Estado interno do módulo de push. configured=true só quando todas as
// três env vars (PUBLIC, PRIVATE, SUBJECT) estão setadas — nesse caso
// o `web-push` é inicializado e o resto do módulo opera normalmente.
// Sem isso, o módulo fica em modo no-op gracioso: subscribe e schedule
// 503 com mensagem clara, em vez de explodir com TypeError. Permite
// dev local sem precisar gerar chaves só pra rodar o resto.
let configured = false;

export function isPushConfigured(): boolean {
  return configured;
}

export function initializeWebPush(): void {
  const publicKey = env.vapidPublicKey;
  const privateKey = env.vapidPrivateKey;
  const subject = env.vapidSubject;

  if (!publicKey || !privateKey || !subject) {
    logger.warn(
      "[push] VAPID env vars ausentes — módulo de push em modo no-op. " +
        "Setar VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT pra ativar."
    );
    configured = false;
    return;
  }

  // setVapidDetails é idempotente e síncrono — apenas armazena os valores
  // num singleton interno do web-push.
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  logger.info("[push] Web Push (VAPID) inicializado com sucesso.");
}

export function getPublicVapidKey(): string | null {
  if (!configured || !env.vapidPublicKey) return null;
  return env.vapidPublicKey;
}

// Upsert por endpoint. Devices podem renovar a subscription (browser
// invalida e regenera), então fazemos update quando o mesmo endpoint
// chega de novo. Garantia: cada device tem no máximo uma row ativa.
export async function subscribeUserToPush(
  userId: string,
  body: SubscribePushBody
): Promise<void> {
  ensureConfiguredOrThrow();

  await prisma.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    update: {
      userId,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: body.userAgent ?? null
    },
    create: {
      userId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: body.userAgent ?? null
    }
  });
}

export async function unsubscribeUserFromPush(
  userId: string,
  body: UnsubscribePushBody
): Promise<void> {
  // deleteMany pra não 404 quando o endpoint nem existia (idempotente).
  // Filtro por userId pra não vazar deletes de subscriptions alheias mesmo
  // se um caller forge o endpoint de outro usuário.
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: body.endpoint, userId }
  });
}

export async function scheduleNotification(
  userId: string,
  body: ScheduleNotificationBody
): Promise<{ id: string; fireAt: Date }> {
  ensureConfiguredOrThrow();

  const fireAt = new Date(body.fireAt);
  if (!Number.isFinite(fireAt.getTime())) {
    throw new AppError("fireAt inválido", { statusCode: 400, code: "INVALID_FIRE_AT" });
  }

  // Rejeita agendamentos no passado distante (mais de 1 min atrás) —
  // provavelmente bug do client com timezone. Pequenos atrasos (< 1 min)
  // são permitidos pra cobrir clock skew leve entre device e server.
  const now = Date.now();
  if (fireAt.getTime() < now - 60_000) {
    throw new AppError("fireAt está no passado", {
      statusCode: 400,
      code: "FIRE_AT_IN_PAST"
    });
  }

  // Limite defensivo: não deixa agendar pra mais de 24h no futuro. O
  // caso primário (descanso de treino) cabe em minutos; valores absurdos
  // indicam bug do client.
  if (fireAt.getTime() > now + 24 * 60 * 60 * 1000) {
    throw new AppError("fireAt muito distante (máx. 24h)", {
      statusCode: 400,
      code: "FIRE_AT_TOO_FAR"
    });
  }

  const created = await prisma.scheduledNotification.create({
    data: {
      userId,
      fireAt,
      title: body.title,
      body: body.body,
      url: body.url ?? null,
      tag: body.tag ?? null,
      status: "PENDING"
    }
  });

  return { id: created.id, fireAt: created.fireAt };
}

export async function cancelScheduledNotification(
  userId: string,
  scheduleId: string
): Promise<void> {
  // updateMany filtrando por userId + status='PENDING' — só cancela o que
  // ainda não foi enviado E pertence ao caller. Idempotente: já cancelado
  // ou já enviado retorna sem efeito.
  await prisma.scheduledNotification.updateMany({
    where: { id: scheduleId, userId, status: "PENDING" },
    data: { status: "CANCELLED" }
  });
}

// Processa todos os jobs PENDING com fireAt <= now. Chamado pelo worker
// in-process (intervalo de 1s) e também pelo endpoint /cron/process-push
// como safety net caso o processo tenha dormido. Pega no máximo 50 jobs
// por chamada pra limitar o blast radius de um spike inesperado.
//
// Implementação: claim atômico via updateMany com fireAt+status filter,
// marcando IN_PROGRESS de forma implícita ao mudar pra status temporário.
// Em vez de IN_PROGRESS (que exigiria mais um valor no enum), fazemos
// um select primeiro e processamos cada um — aceito porque a janela de
// race é só entre o select e o sendPush, e idempotência é garantida
// pelo update pra SENT/FAILED no final.
export async function processDuePendingNotifications(now: Date = new Date()): Promise<{
  processed: number;
  sent: number;
  failed: number;
  cancelled: number;
}> {
  if (!configured) {
    return { processed: 0, sent: 0, failed: 0, cancelled: 0 };
  }

  const due = await prisma.scheduledNotification.findMany({
    where: { status: "PENDING", fireAt: { lte: now } },
    orderBy: { fireAt: "asc" },
    take: 50,
    include: {
      user: {
        select: { id: true, pushSubscriptions: true }
      }
    }
  });

  let sent = 0;
  let failed = 0;
  let cancelled = 0;

  for (const job of due) {
    const subscriptions = job.user.pushSubscriptions;
    if (subscriptions.length === 0) {
      // User não tem subscription ativa — não tem como entregar. Marca
      // como CANCELLED pra não ficar tentando indefinidamente.
      await prisma.scheduledNotification.update({
        where: { id: job.id },
        data: { status: "CANCELLED", error: "no active subscriptions" }
      });
      cancelled += 1;
      continue;
    }

    const payload = JSON.stringify({
      title: job.title,
      body: job.body,
      url: job.url ?? "/",
      tag: job.tag ?? `sched-${job.id}`
    });

    let anyDelivered = false;
    const errors: string[] = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          },
          payload,
          { TTL: 300, urgency: "high" }
        );
        anyDelivered = true;
      } catch (err) {
        const status = extractStatusCode(err);
        // 404 (Not Found) e 410 (Gone) significam que a subscription
        // expirou no gateway — apaga a row pra não tentar de novo.
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.deleteMany({
            where: { endpoint: sub.endpoint }
          });
          errors.push(`expired:${sub.endpoint.slice(-20)}`);
        } else {
          errors.push(
            `${status ?? "err"}:${
              err instanceof Error ? err.message.slice(0, 60) : String(err).slice(0, 60)
            }`
          );
        }
      }
    }

    if (anyDelivered) {
      await prisma.scheduledNotification.update({
        where: { id: job.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          error: errors.length > 0 ? errors.join(" | ").slice(0, 500) : null
        }
      });
      sent += 1;
    } else {
      await prisma.scheduledNotification.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          error: errors.join(" | ").slice(0, 500) || "delivery failed"
        }
      });
      failed += 1;
    }
  }

  return { processed: due.length, sent, failed, cancelled };
}

// Limpeza de jobs antigos. Chamado periodicamente pra impedir que a
// tabela cresça indefinidamente — SENT/FAILED/CANCELLED com mais de
// 7 dias somem.
export async function pruneOldScheduledNotifications(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await prisma.scheduledNotification.deleteMany({
    where: {
      status: { in: ["SENT", "FAILED", "CANCELLED"] },
      createdAt: { lt: cutoff }
    }
  });
  return result.count;
}

function ensureConfiguredOrThrow(): void {
  if (!configured) {
    throw new AppError(
      "Push notifications não estão configuradas no servidor (VAPID ausente).",
      { statusCode: 503, code: "PUSH_NOT_CONFIGURED" }
    );
  }
}

function extractStatusCode(err: unknown): number | null {
  if (err && typeof err === "object" && "statusCode" in err) {
    const code = (err as { statusCode?: unknown }).statusCode;
    return typeof code === "number" ? code : null;
  }
  return null;
}
