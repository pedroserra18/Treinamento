import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { trackEvent } from "../../shared/services/event-log.service";
import { checkProfanity } from "./profanity-filter";
import { assertActiveMembership, assertEntryInCompetition, CHAT_RATE_LIMIT_SEC } from "./competition-helpers";
import type { PostEntryCommentBody } from "./competition.schema";

export async function listEntryComments(userId: string, competitionId: string, entryId: string) {
  await assertActiveMembership(userId, competitionId);
  await assertEntryInCompetition(competitionId, entryId);

  const items = await prisma.competitionEntryComment.findMany({
    where: { entryId },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      userId: true,
      content: true,
      createdAt: true,
      user: { select: { id: true, name: true, handle: true, avatarUrl: true } }
    }
  });
  return { items };
}

export async function postEntryComment(
  userId: string,
  competitionId: string,
  entryId: string,
  payload: PostEntryCommentBody
) {
  await assertActiveMembership(userId, competitionId);
  await assertEntryInCompetition(competitionId, entryId);

  // Reuse the chat rate limit — same anti-flood target, same trade-off.
  const recent = await prisma.competitionEntryComment.findFirst({
    where: {
      entryId,
      userId,
      createdAt: { gt: new Date(Date.now() - CHAT_RATE_LIMIT_SEC * 1000) }
    },
    select: { id: true }
  });
  if (recent) {
    throw new AppError("Calma — espere alguns segundos antes de comentar de novo", {
      statusCode: 429,
      code: "COMMENT_RATE_LIMITED"
    });
  }

  const check = checkProfanity(payload.content);
  if (!check.ok) {
    throw new AppError("Comentário bloqueado por conter conteúdo impróprio", {
      statusCode: 400,
      code: "COMMENT_BLOCKED_PROFANITY"
    });
  }

  const comment = await prisma.competitionEntryComment.create({
    data: { entryId, userId, content: payload.content },
    select: {
      id: true,
      userId: true,
      content: true,
      createdAt: true,
      user: { select: { id: true, name: true, handle: true, avatarUrl: true } }
    }
  });
  return comment;
}

export async function deleteEntryComment(
  userId: string,
  competitionId: string,
  entryId: string,
  commentId: string
) {
  await assertEntryInCompetition(competitionId, entryId);

  const comment = await prisma.competitionEntryComment.findUnique({
    where: { id: commentId },
    select: { id: true, userId: true, entryId: true }
  });
  if (!comment || comment.entryId !== entryId) {
    throw new AppError("Comentário não encontrado", { statusCode: 404, code: "COMMENT_NOT_FOUND" });
  }

  // Author can delete their own. Admins (active) of the room can delete
  // anyone's. Same rule as chat moderation.
  const isAdminAction = comment.userId !== userId;
  if (isAdminAction) {
    const me = await prisma.competitionMember.findUnique({
      where: { competitionId_userId: { competitionId, userId } },
      select: { role: true, abandonedAt: true }
    });
    if (!me || me.role !== "ADMIN" || me.abandonedAt) {
      throw new AppError("Você só pode apagar seus próprios comentários", {
        statusCode: 403,
        code: "COMMENT_NOT_AUTHORISED"
      });
    }
  }

  await prisma.competitionEntryComment.delete({ where: { id: commentId } });

  if (isAdminAction) {
    void trackEvent({
      userId,
      category: "COMPETITION",
      action: "competition_comment_deleted",
      resourceType: "competition_comment",
      resourceId: commentId,
      metadata: { competitionId, entryId, authorUserId: comment.userId }
    });
  }

  return { success: true };
}
