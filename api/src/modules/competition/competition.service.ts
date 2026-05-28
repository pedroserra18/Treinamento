import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { createNotification } from "../notification/notification.service";
import type { CreateCompetitionBody, InviteMemberBody } from "./competition.schema";

const MAX_MEMBERS = 10;
const INVITE_EXPIRY_DAYS = 7;

const COMPETITION_INCLUDE = {
  owner: { select: { id: true, name: true, handle: true, avatarUrl: true } },
  members: {
    orderBy: { joinedAt: "asc" as const },
    include: {
      user: { select: { id: true, name: true, handle: true, avatarUrl: true } }
    }
  },
  _count: { select: { entries: true } }
};

// Throws when the user already belongs to a LOBBY or ACTIVE competition.
// Used by create + join paths to enforce the "1 active per user" rule.
// Service-level check is fine for now (low contention); for higher scale,
// add a partial unique index on competition_members via raw SQL migration.
async function assertUserHasNoActiveCompetition(userId: string): Promise<void> {
  const existing = await prisma.competitionMember.findFirst({
    where: {
      userId,
      competition: { status: { in: ["LOBBY", "ACTIVE"] } }
    },
    select: { id: true, competition: { select: { id: true, name: true } } }
  });

  if (existing) {
    throw new AppError("Você já está em uma competição ativa", {
      statusCode: 409,
      code: "COMPETITION_ALREADY_IN_ANOTHER",
      details: { competitionId: existing.competition.id, name: existing.competition.name }
    });
  }
}

// Throws when the inviter is not mutual followers with the target. Friends
// here means "both directions of follow" — same definition the UI exposes.
async function assertMutualFollow(inviterId: string, targetUserId: string): Promise<void> {
  if (inviterId === targetUserId) {
    throw new AppError("Não é possível convidar a si mesmo", { statusCode: 400, code: "COMPETITION_INVITE_SELF" });
  }

  const [a, b] = await Promise.all([
    prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: inviterId, followingId: targetUserId } },
      select: { id: true }
    }),
    prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: targetUserId, followingId: inviterId } },
      select: { id: true }
    })
  ]);

  if (!a || !b) {
    throw new AppError("Você só pode convidar pessoas com quem é amigo (segue mutuamente)", {
      statusCode: 403,
      code: "COMPETITION_INVITE_NOT_FRIEND"
    });
  }
}

export async function createCompetition(userId: string, payload: CreateCompetitionBody) {
  await assertUserHasNoActiveCompetition(userId);

  return prisma.$transaction(async (tx) => {
    const competition = await tx.competition.create({
      data: {
        ownerUserId: userId,
        name: payload.name ?? null,
        type: payload.type,
        durationDays: payload.durationDays
      }
    });

    await tx.competitionMember.create({
      data: { competitionId: competition.id, userId, role: "ADMIN" }
    });

    return tx.competition.findUniqueOrThrow({
      where: { id: competition.id },
      include: COMPETITION_INCLUDE
    });
  });
}

export async function getMyActiveCompetition(userId: string) {
  const membership = await prisma.competitionMember.findFirst({
    where: { userId, competition: { status: { in: ["LOBBY", "ACTIVE"] } } },
    include: {
      competition: { include: COMPETITION_INCLUDE }
    }
  });

  return membership?.competition ?? null;
}

export async function getCompetitionById(userId: string, competitionId: string) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: COMPETITION_INCLUDE
  });

  if (!competition) {
    throw new AppError("Competição não encontrada", { statusCode: 404, code: "COMPETITION_NOT_FOUND" });
  }

  const isMember = competition.members.some((m) => m.userId === userId);
  if (!isMember) {
    throw new AppError("Você não faz parte dessa competição", {
      statusCode: 403,
      code: "COMPETITION_NOT_A_MEMBER"
    });
  }

  return competition;
}

export async function inviteMember(userId: string, competitionId: string, payload: InviteMemberBody) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { members: { select: { userId: true, role: true } } }
  });

  if (!competition) {
    throw new AppError("Competição não encontrada", { statusCode: 404, code: "COMPETITION_NOT_FOUND" });
  }

  if (competition.status !== "LOBBY") {
    throw new AppError("Só é possível convidar enquanto a competição está no lobby", {
      statusCode: 400,
      code: "COMPETITION_NOT_IN_LOBBY"
    });
  }

  const inviter = competition.members.find((m) => m.userId === userId);
  if (!inviter || inviter.role !== "ADMIN") {
    throw new AppError("Apenas admins podem convidar", { statusCode: 403, code: "COMPETITION_NOT_ADMIN" });
  }

  if (competition.members.length >= MAX_MEMBERS) {
    throw new AppError(`Limite de ${MAX_MEMBERS} membros atingido`, {
      statusCode: 400,
      code: "COMPETITION_MEMBER_LIMIT"
    });
  }

  if (payload.invitedUserId) {
    if (competition.members.some((m) => m.userId === payload.invitedUserId)) {
      throw new AppError("Essa pessoa já está na competição", {
        statusCode: 409,
        code: "COMPETITION_ALREADY_MEMBER"
      });
    }

    await assertMutualFollow(userId, payload.invitedUserId);

    // Block duplicate pending invites for the same competition + user.
    const existingInvite = await prisma.competitionInvite.findFirst({
      where: {
        competitionId,
        invitedUserId: payload.invitedUserId,
        status: "PENDING"
      },
      select: { id: true }
    });
    if (existingInvite) {
      throw new AppError("Você já enviou um convite pendente para essa pessoa", {
        statusCode: 409,
        code: "COMPETITION_INVITE_DUPLICATE"
      });
    }
  }

  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 86_400_000);

  const invite = await prisma.competitionInvite.create({
    data: {
      competitionId,
      invitedByUserId: userId,
      invitedUserId: payload.invitedUserId ?? null,
      expiresAt
    }
  });

  // Best-effort in-app notification. Failure here should not roll back
  // the invite creation since the link is still usable.
  if (payload.invitedUserId) {
    try {
      await createNotification({
        userId: payload.invitedUserId,
        type: "COMPETITION_INVITE_RECEIVED",
        title: "Novo convite de desafio",
        body: `Você foi convidado para a competição "${competition.name ?? "Desafio"}"`,
        metadata: { competitionId, inviteId: invite.id, inviteToken: invite.token }
      });
    } catch {
      // ignore — notification is auxiliary
    }
  }

  return invite;
}

// Public-ish preview: returns enough to render the accept page without
// requiring the recipient to be authenticated. The token itself is the
// auth — anyone with the URL gets the preview. Accepting needs login.
export async function getInvitePreview(token: string) {
  const invite = await prisma.competitionInvite.findUnique({
    where: { token },
    include: {
      competition: {
        select: {
          id: true,
          name: true,
          type: true,
          durationDays: true,
          status: true,
          _count: { select: { members: true } }
        }
      },
      invitedBy: { select: { id: true, name: true, handle: true, avatarUrl: true } }
    }
  });

  if (!invite) {
    throw new AppError("Convite inválido", { statusCode: 404, code: "INVITE_NOT_FOUND" });
  }

  return invite;
}

export async function acceptInvite(userId: string, token: string) {
  const invite = await prisma.competitionInvite.findUnique({
    where: { token },
    include: { competition: { include: { members: { select: { userId: true } } } } }
  });

  if (!invite) {
    throw new AppError("Convite inválido", { statusCode: 404, code: "INVITE_NOT_FOUND" });
  }

  if (invite.status !== "PENDING") {
    throw new AppError("Convite já foi respondido ou expirou", { statusCode: 400, code: "INVITE_NOT_PENDING" });
  }

  if (invite.expiresAt < new Date()) {
    await prisma.competitionInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } });
    throw new AppError("Convite expirou", { statusCode: 400, code: "INVITE_EXPIRED" });
  }

  if (invite.invitedUserId && invite.invitedUserId !== userId) {
    throw new AppError("Esse convite é para outra pessoa", { statusCode: 403, code: "INVITE_OTHER_USER" });
  }

  if (invite.competition.status !== "LOBBY") {
    throw new AppError("Essa competição não está mais aceitando membros", {
      statusCode: 400,
      code: "COMPETITION_NOT_IN_LOBBY"
    });
  }

  if (invite.competition.members.some((m) => m.userId === userId)) {
    throw new AppError("Você já é membro dessa competição", { statusCode: 409, code: "COMPETITION_ALREADY_MEMBER" });
  }

  if (invite.competition.members.length >= MAX_MEMBERS) {
    throw new AppError(`Limite de ${MAX_MEMBERS} membros atingido`, {
      statusCode: 400,
      code: "COMPETITION_MEMBER_LIMIT"
    });
  }

  await assertUserHasNoActiveCompetition(userId);

  const result = await prisma.$transaction(async (tx) => {
    const member = await tx.competitionMember.create({
      data: { competitionId: invite.competitionId, userId, role: "MEMBER" }
    });

    await tx.competitionInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", respondedAt: new Date() }
    });

    return member;
  });

  // Notify the admins (best-effort).
  try {
    const admins = await prisma.competitionMember.findMany({
      where: { competitionId: invite.competitionId, role: "ADMIN", userId: { not: userId } },
      select: { userId: true }
    });
    await Promise.all(
      admins.map((a) =>
        createNotification({
          userId: a.userId,
          type: "COMPETITION_MEMBER_JOINED",
          title: "Novo membro no desafio",
          body: "Alguém aceitou seu convite para a competição",
          metadata: { competitionId: invite.competitionId }
        })
      )
    );
  } catch {
    // ignore — notifications are auxiliary
  }

  return result;
}

export async function declineInvite(userId: string, token: string) {
  const invite = await prisma.competitionInvite.findUnique({ where: { token } });
  if (!invite) {
    throw new AppError("Convite inválido", { statusCode: 404, code: "INVITE_NOT_FOUND" });
  }
  if (invite.status !== "PENDING") {
    return { success: true };
  }
  if (invite.invitedUserId && invite.invitedUserId !== userId) {
    throw new AppError("Esse convite é para outra pessoa", { statusCode: 403, code: "INVITE_OTHER_USER" });
  }
  await prisma.competitionInvite.update({
    where: { id: invite.id },
    data: { status: "DECLINED", respondedAt: new Date() }
  });
  return { success: true };
}

export async function leaveCompetition(userId: string, competitionId: string) {
  const membership = await prisma.competitionMember.findUnique({
    where: { competitionId_userId: { competitionId, userId } },
    include: { competition: { select: { ownerUserId: true, status: true } } }
  });

  if (!membership) {
    throw new AppError("Você não faz parte dessa competição", { statusCode: 404, code: "COMPETITION_NOT_A_MEMBER" });
  }

  if (membership.competition.ownerUserId === userId && membership.competition.status === "LOBBY") {
    // Owner leaving while in lobby = cancel the competition entirely.
    await prisma.competition.update({
      where: { id: competitionId },
      data: { status: "CANCELLED" }
    });
    return { success: true, cancelled: true };
  }

  await prisma.competitionMember.delete({
    where: { competitionId_userId: { competitionId, userId } }
  });

  return { success: true, cancelled: false };
}

// Lists the user's competitions: any membership in any status, ordered
// LOBBY/ACTIVE first then completed/cancelled by recency. Used by the
// /desafios index page to show "atual" and "histórico" together.
export async function listMyCompetitions(userId: string) {
  const memberships = await prisma.competitionMember.findMany({
    where: { userId },
    include: { competition: { include: COMPETITION_INCLUDE } },
    orderBy: { joinedAt: "desc" }
  });

  const items = memberships
    .map((m) => m.competition)
    .sort((a, b) => {
      const order = (s: typeof a.status) => (s === "LOBBY" || s === "ACTIVE" ? 0 : 1);
      const da = order(a.status) - order(b.status);
      if (da !== 0) return da;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  return { items };
}

// Pending invites for the current user (in-app only, link-only invites
// aren't surfaced here). Drives the "Convites" tab on /desafios.
export async function listMyInvites(userId: string) {
  const items = await prisma.competitionInvite.findMany({
    where: { invitedUserId: userId, status: "PENDING", expiresAt: { gt: new Date() } },
    include: {
      competition: {
        select: {
          id: true,
          name: true,
          type: true,
          durationDays: true,
          _count: { select: { members: true } }
        }
      },
      invitedBy: { select: { id: true, name: true, handle: true, avatarUrl: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  return { items };
}
