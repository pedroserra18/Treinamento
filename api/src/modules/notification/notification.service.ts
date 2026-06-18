import { prisma } from "../../config/prisma";
import { scheduleNotification } from "../push/push.service";
import { logger } from "../../config/logger";

export type NotificationType =
  // Social
  | "POST_REMOVED_BY_ADMIN"
  | "POST_COMMENT"
  | "POST_LIKE"
  | "POST_COMMENT_REPLY"
  | "POST_REPORTED"
  | "USER_FOLLOWED"
  // Support
  | "SUPPORT_TICKET_CREATED"
  | "SUPPORT_TICKET_REPLIED"
  | "SUPPORT_TICKET_RESOLVED"
  | "SUPPORT_TICKET_AUTO_CLOSED"
  // Competition
  | "COMPETITION_INVITE_RECEIVED"
  | "COMPETITION_MEMBER_JOINED"
  | "COMPETITION_STARTED"
  | "COMPETITION_FINISHED"
  | "COMPETITION_ENDING_SOON"
  | "COMPETITION_RANKING_OVERTAKEN"
  // Engagement (Tier 3)
  | "STREAK_AT_RISK"
  | "INACTIVE_REMINDER"
  | "WEEKLY_RECAP"
  | "APP_ANNIVERSARY";

// Categoria define qual toggle do usuário governa se vai virar push.
// As 4 categorias batem com 4 colunas booleanas em NotificationPreferences:
//   SOCIAL → pushSocial      (follow / like / comment / reply)
//   COMPETITION → pushCompetition (convite / started / ending / overtake / finished)
//   SUPPORT → pushSupport    (admin replies, etc.)
//   ENGAGEMENT → pushEngagement (streak, inactive, recap, anniversary)
export type NotificationCategory = "SOCIAL" | "COMPETITION" | "SUPPORT" | "ENGAGEMENT";

const TYPE_TO_CATEGORY: Record<NotificationType, NotificationCategory> = {
  POST_REMOVED_BY_ADMIN: "SUPPORT", // moderação cai em "suporte" porque é admin agindo
  POST_COMMENT: "SOCIAL",
  POST_LIKE: "SOCIAL",
  POST_COMMENT_REPLY: "SOCIAL",
  POST_REPORTED: "SUPPORT", // denúncia → fila de moderação do admin (suporte)
  USER_FOLLOWED: "SOCIAL",
  SUPPORT_TICKET_CREATED: "SUPPORT",
  SUPPORT_TICKET_REPLIED: "SUPPORT",
  SUPPORT_TICKET_RESOLVED: "SUPPORT",
  SUPPORT_TICKET_AUTO_CLOSED: "SUPPORT",
  COMPETITION_INVITE_RECEIVED: "COMPETITION",
  COMPETITION_MEMBER_JOINED: "COMPETITION",
  COMPETITION_STARTED: "COMPETITION",
  COMPETITION_FINISHED: "COMPETITION",
  COMPETITION_ENDING_SOON: "COMPETITION",
  COMPETITION_RANKING_OVERTAKEN: "COMPETITION",
  STREAK_AT_RISK: "ENGAGEMENT",
  INACTIVE_REMINDER: "ENGAGEMENT",
  WEEKLY_RECAP: "ENGAGEMENT",
  APP_ANNIVERSARY: "ENGAGEMENT"
};

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
};

// Helper legado mantido por compat — agora delega pra notifyUser, que
// herda o type e adiciona o gate de push baseado em preferências. Todos
// os callsites existentes continuam funcionando sem mudança.
export async function createNotification(input: CreateNotificationInput) {
  return notifyUser({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    metadata: input.metadata,
    // Url default é null — caller pode passar via notifyUser direto se
    // quiser deep-link no tap da notificação push.
    url: null
  });
}

export type NotifyUserInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  // URL pra deep-link quando o user toca no push. Default null = abre
  // raiz do app. Ex.: "/post/abc123" ou "/desafios/abc123" pra cair direto na tela.
  url?: string | null;
  // Tag opcional pra coalesce visual na bandeja de notificação do iOS.
  // Mesma tag = sistema substitui a anterior em vez de empilhar.
  tag?: string | null;
  // Override pra desativar push mesmo com toggle ON. Usado pra eventos
  // de baixa prioridade que só fazem sentido in-app. Default true.
  pushable?: boolean;
};

// Função central de notificação. Cria a row in-app (igual antes) E, se
// o user opt-in pra categoria do evento, agenda push imediato (fireAt=now).
// Erros de push são logados mas NUNCA propagam — push é melhoria, não
// crítico; uma falha lá não pode quebrar o fluxo principal (ex.: like de
// post falhando porque push deu timeout seria absurdo).
export async function notifyUser(input: NotifyUserInput) {
  // Sempre cria a notificação in-app primeiro — esta é a fonte de verdade
  // (sininho do app, lista de notificações).
  const created = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      metadata: (input.metadata ?? null) as never
    }
  });

  // Push é opcional e best-effort.
  if (input.pushable === false) return created;

  try {
    const category = TYPE_TO_CATEGORY[input.type];
    const allowed = await isPushAllowedForCategory(input.userId, category);
    if (!allowed) return created;

    // fireAt = agora pra entrega imediata pelo worker (próximo tick em 1s).
    await scheduleNotification(input.userId, {
      fireAt: new Date().toISOString(),
      title: input.title,
      body: input.body,
      url: input.url ?? undefined,
      tag: input.tag ?? `${input.type.toLowerCase()}-${created.id}`
    });
  } catch (err) {
    // Push não-configurado, sem subscriptions, etc. Não-fatal.
    logger.warn("[notifyUser] push schedule failed (non-fatal):", err);
  }

  return created;
}

// Lê preferências do usuário. Se a row não existir, retorna defaults
// (tudo true) — equivalente a "criar preferências on-demand". Decisão
// proposital: usuários antigos não precisam de migração de dados.
export async function isPushAllowedForCategory(
  userId: string,
  category: NotificationCategory
): Promise<boolean> {
  const prefs = await prisma.notificationPreferences.findUnique({
    where: { userId },
    select: {
      pushSocial: true,
      pushCompetition: true,
      pushSupport: true,
      pushEngagement: true
    }
  });

  if (!prefs) {
    // Sem row = defaults = tudo true.
    return true;
  }

  switch (category) {
    case "SOCIAL":
      return prefs.pushSocial;
    case "COMPETITION":
      return prefs.pushCompetition;
    case "SUPPORT":
      return prefs.pushSupport;
    case "ENGAGEMENT":
      return prefs.pushEngagement;
  }
}

export async function listMyNotifications(userId: string, limit = 30) {
  const items = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const unreadCount = await prisma.notification.count({
    where: { userId, readAt: null },
  });

  return { items, unreadCount };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

// ─── Preferences ────────────────────────────────────────────────────────

export type NotificationPreferencesDto = {
  pushSocial: boolean;
  pushCompetition: boolean;
  pushSupport: boolean;
  pushEngagement: boolean;
};

const DEFAULT_PREFS: NotificationPreferencesDto = {
  pushSocial: true,
  pushCompetition: true,
  pushSupport: true,
  pushEngagement: true
};

export async function getNotificationPreferences(
  userId: string
): Promise<NotificationPreferencesDto> {
  const row = await prisma.notificationPreferences.findUnique({
    where: { userId },
    select: {
      pushSocial: true,
      pushCompetition: true,
      pushSupport: true,
      pushEngagement: true
    }
  });
  return row ?? DEFAULT_PREFS;
}

export async function updateNotificationPreferences(
  userId: string,
  patch: Partial<NotificationPreferencesDto>
): Promise<NotificationPreferencesDto> {
  const result = await prisma.notificationPreferences.upsert({
    where: { userId },
    update: patch,
    create: { userId, ...DEFAULT_PREFS, ...patch },
    select: {
      pushSocial: true,
      pushCompetition: true,
      pushSupport: true,
      pushEngagement: true
    }
  });
  return result;
}
