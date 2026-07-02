import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { trackEvent } from "../../shared/services/event-log.service";
import { checkProfanity } from "./profanity-filter";
import { assertActiveMembership, CHAT_RATE_LIMIT_SEC } from "./competition-helpers";
import type { ListChatQuery, PostChatBody } from "./competition.schema";

export async function listChatMessages(userId: string, competitionId: string, query: ListChatQuery) {
  await assertActiveMembership(userId, competitionId);

  const items = await prisma.competitionMessage.findMany({
    where: {
      competitionId,
      ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {})
    },
    orderBy: { createdAt: "desc" },
    take: query.limit,
    select: {
      id: true,
      userId: true,
      content: true,
      createdAt: true,
      user: { select: { id: true, name: true, handle: true, avatarUrl: true } }
    }
  });

  // Return chronological order (oldest → newest) so the client appends.
  return { items: items.reverse() };
}

export async function postChatMessage(userId: string, competitionId: string, payload: PostChatBody) {
  await assertActiveMembership(userId, competitionId);

  // Rate limit: one message per CHAT_RATE_LIMIT_SEC seconds per user per
  // room. Cheap subquery against the createdAt index.
  const recent = await prisma.competitionMessage.findFirst({
    where: {
      competitionId,
      userId,
      createdAt: { gt: new Date(Date.now() - CHAT_RATE_LIMIT_SEC * 1000) }
    },
    select: { id: true }
  });
  if (recent) {
    throw new AppError("Calma — espere alguns segundos antes de mandar outra mensagem", {
      statusCode: 429,
      code: "CHAT_RATE_LIMITED"
    });
  }

  const check = checkProfanity(payload.content);
  if (!check.ok) {
    throw new AppError("Mensagem bloqueada por conter conteúdo impróprio", {
      statusCode: 400,
      code: "CHAT_BLOCKED_PROFANITY"
    });
  }

  const message = await prisma.competitionMessage.create({
    data: {
      competitionId,
      userId,
      content: payload.content
    },
    select: {
      id: true,
      userId: true,
      content: true,
      createdAt: true,
      user: { select: { id: true, name: true, handle: true, avatarUrl: true } }
    }
  });

  return message;
}

export async function deleteChatMessage(userId: string, competitionId: string, messageId: string) {
  const message = await prisma.competitionMessage.findUnique({
    where: { id: messageId },
    select: { id: true, userId: true, competitionId: true }
  });

  if (!message || message.competitionId !== competitionId) {
    throw new AppError("Mensagem não encontrada", { statusCode: 404, code: "CHAT_MESSAGE_NOT_FOUND" });
  }

  // Author can always delete their own. Admins can delete anyone's.
  const isAdminAction = message.userId !== userId;
  if (isAdminAction) {
    const me = await prisma.competitionMember.findUnique({
      where: { competitionId_userId: { competitionId, userId } },
      select: { role: true, abandonedAt: true }
    });
    if (!me || me.role !== "ADMIN" || me.abandonedAt) {
      throw new AppError("Você só pode apagar suas próprias mensagens", {
        statusCode: 403,
        code: "CHAT_NOT_AUTHORISED"
      });
    }
  }

  await prisma.competitionMessage.delete({ where: { id: messageId } });

  if (isAdminAction) {
    void trackEvent({
      userId,
      category: "COMPETITION",
      action: "competition_chat_deleted",
      resourceType: "competition_message",
      resourceId: messageId,
      metadata: { competitionId, authorUserId: message.userId }
    });
  }

  return { success: true };
}

// Auto-finalize / auto-cancel pass. Two callers:
// - On-read mode (userId provided): used by list endpoints as a fallback
//   so users don't see stale LOBBY/ACTIVE rows even when the cron is
//   down. Restricted to the caller's memberships so it stays O(few) per
//   request.
// - Cron mode (userId = null): scans across all users. Run by the
//   external cron job (e.g. Vercel Cron) every ~5 min so the on-read
//   path becomes a no-op in steady state.
