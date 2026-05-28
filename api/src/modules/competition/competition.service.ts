import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { createNotification } from "../notification/notification.service";
import type { CreateCompetitionBody, InviteMemberBody, PostEntryBody } from "./competition.schema";

const MAX_MEMBERS = 10;
const INVITE_EXPIRY_DAYS = 7;
const LOBBY_START_DEADLINE_DAYS = 3;

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
      abandonedAt: null, // soft-abandoned members no longer hold the slot
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
    const startDeadline = new Date(Date.now() + LOBBY_START_DEADLINE_DAYS * 86_400_000);
    const competition = await tx.competition.create({
      data: {
        ownerUserId: userId,
        name: payload.name ?? null,
        type: payload.type,
        durationDays: payload.durationDays,
        startDeadline
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
  await reconcileExpiredCompetitions(userId);
  const membership = await prisma.competitionMember.findFirst({
    where: {
      userId,
      abandonedAt: null,
      competition: { status: { in: ["LOBBY", "ACTIVE"] } }
    },
    include: {
      competition: { include: COMPETITION_INCLUDE }
    }
  });

  return membership?.competition ?? null;
}

// Admin transitions LOBBY → ACTIVE. Locks in type/durationDays (immutable
// after this) and computes endsAt = startedAt + durationDays. Once active,
// member roster is frozen — invites stop being accepted.
export async function startCompetition(userId: string, competitionId: string) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { members: { select: { userId: true, role: true, abandonedAt: true } } }
  });

  if (!competition) {
    throw new AppError("Competição não encontrada", { statusCode: 404, code: "COMPETITION_NOT_FOUND" });
  }

  const me = competition.members.find((m) => m.userId === userId);
  if (!me || me.role !== "ADMIN" || me.abandonedAt) {
    throw new AppError("Apenas admins podem iniciar o desafio", { statusCode: 403, code: "COMPETITION_NOT_ADMIN" });
  }

  if (competition.status !== "LOBBY") {
    throw new AppError("Esse desafio não está mais no lobby", { statusCode: 400, code: "COMPETITION_NOT_IN_LOBBY" });
  }

  const activeMembers = competition.members.filter((m) => !m.abandonedAt);
  if (activeMembers.length < 2) {
    throw new AppError("Pelo menos 2 participantes ativos são necessários para iniciar", {
      statusCode: 400,
      code: "COMPETITION_TOO_FEW_MEMBERS"
    });
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + competition.durationDays * 86_400_000);

  const updated = await prisma.competition.update({
    where: { id: competitionId },
    data: { status: "ACTIVE", startedAt: now, endsAt },
    include: COMPETITION_INCLUDE
  });

  // Notify everyone except the admin who started it.
  try {
    await Promise.all(
      activeMembers
        .filter((m) => m.userId !== userId)
        .map((m) =>
          createNotification({
            userId: m.userId,
            type: "COMPETITION_STARTED",
            title: "O desafio começou!",
            body: `${competition.name ?? "Seu desafio"} está rodando. Vá treinar.`,
            metadata: { competitionId }
          })
        )
    );
  } catch {
    // ignore
  }

  return updated;
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
    include: {
      competition: {
        select: { ownerUserId: true, status: true, members: { orderBy: { joinedAt: "asc" } } }
      }
    }
  });

  if (!membership) {
    throw new AppError("Você não faz parte dessa competição", { statusCode: 404, code: "COMPETITION_NOT_A_MEMBER" });
  }

  if (membership.abandonedAt) {
    return { success: true, cancelled: false };
  }

  // Owner in LOBBY → cancel the whole room.
  if (membership.competition.ownerUserId === userId && membership.competition.status === "LOBBY") {
    await prisma.competition.update({
      where: { id: competitionId },
      data: { status: "CANCELLED" }
    });
    return { success: true, cancelled: true };
  }

  // Soft-abandon (always — entries stay, leaderboard ignores).
  await prisma.competitionMember.update({
    where: { id: membership.id },
    data: { abandonedAt: new Date(), role: "MEMBER" } // demoted just in case
  });

  // If the owner abandons during ACTIVE, promote the oldest non-abandoned
  // non-owner member to admin so the room still has a moderator. We don't
  // change ownerUserId because it's audit data (who created the room).
  if (membership.competition.ownerUserId === userId && membership.competition.status === "ACTIVE") {
    const successor = membership.competition.members.find(
      (m) => m.userId !== userId && !m.abandonedAt
    );
    if (successor && successor.role !== "ADMIN") {
      await prisma.competitionMember.update({
        where: { id: successor.id },
        data: { role: "ADMIN" }
      });
    }
  }

  // If everyone abandoned, cancel the room (nothing to compete with).
  const remaining = await prisma.competitionMember.count({
    where: { competitionId, abandonedAt: null }
  });
  if (remaining === 0) {
    await prisma.competition.update({
      where: { id: competitionId },
      data: { status: "CANCELLED" }
    });
    return { success: true, cancelled: true };
  }

  return { success: true, cancelled: false };
}

// Lists the user's competitions: any membership in any status, ordered
// LOBBY/ACTIVE first then completed/cancelled by recency. Used by the
// /desafios index page to show "atual" and "histórico" together.
export async function listMyCompetitions(userId: string) {
  await reconcileExpiredCompetitions(userId);
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

// Mutual followers (= friends in this app's vocabulary) that aren't yet
// in the competition and don't have a pending invite. Drives the friend
// picker modal on the detail page. Three small queries (intersect in JS)
// keep this scalable even for users with thousands of follows.
export async function listInvitableFriends(userId: string, competitionId: string) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      ownerUserId: true,
      status: true,
      members: { select: { userId: true, role: true, abandonedAt: true } },
      invites: { where: { status: "PENDING" }, select: { invitedUserId: true } }
    }
  });

  if (!competition) {
    throw new AppError("Competição não encontrada", { statusCode: 404, code: "COMPETITION_NOT_FOUND" });
  }

  const me = competition.members.find((m) => m.userId === userId);
  if (!me || me.role !== "ADMIN" || me.abandonedAt) {
    throw new AppError("Apenas admins podem ver a lista de convite", {
      statusCode: 403,
      code: "COMPETITION_NOT_ADMIN"
    });
  }

  const excluded = new Set<string>();
  for (const m of competition.members) {
    if (!m.abandonedAt) excluded.add(m.userId);
  }
  for (const i of competition.invites) {
    if (i.invitedUserId) excluded.add(i.invitedUserId);
  }

  const [following, followers] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }),
    prisma.follow.findMany({ where: { followingId: userId }, select: { followerId: true } })
  ]);

  const followingSet = new Set(following.map((f) => f.followingId));
  const mutualIds = followers
    .map((f) => f.followerId)
    .filter((id) => followingSet.has(id) && !excluded.has(id));

  if (mutualIds.length === 0) {
    return { items: [] };
  }

  const users = await prisma.user.findMany({
    where: { id: { in: mutualIds }, isDeleted: false },
    select: { id: true, name: true, handle: true, avatarUrl: true },
    orderBy: [{ name: "asc" }, { handle: "asc" }]
  });

  return { items: users };
}

// Promote or demote a member. Owner never loses ADMIN role. Only existing
// admins can promote. Demoting yourself is allowed (but if you're the
// last admin we block it to avoid leaving the room without a moderator).
export async function setMemberRole(
  userId: string,
  competitionId: string,
  targetUserId: string,
  role: "ADMIN" | "MEMBER"
) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { members: { select: { id: true, userId: true, role: true, abandonedAt: true } } }
  });

  if (!competition) {
    throw new AppError("Competição não encontrada", { statusCode: 404, code: "COMPETITION_NOT_FOUND" });
  }

  const me = competition.members.find((m) => m.userId === userId);
  if (!me || me.role !== "ADMIN" || me.abandonedAt) {
    throw new AppError("Apenas admins podem mudar permissões", {
      statusCode: 403,
      code: "COMPETITION_NOT_ADMIN"
    });
  }

  const target = competition.members.find((m) => m.userId === targetUserId);
  if (!target) {
    throw new AppError("Membro não encontrado", { statusCode: 404, code: "COMPETITION_MEMBER_NOT_FOUND" });
  }
  if (target.abandonedAt) {
    throw new AppError("Esse membro abandonou o desafio", {
      statusCode: 400,
      code: "COMPETITION_MEMBER_ABANDONED"
    });
  }

  // Owner is always admin — both protections (can't demote, can't promote
  // again since they already are admin).
  if (targetUserId === competition.ownerUserId && role === "MEMBER") {
    throw new AppError("O criador da sala não pode ser rebaixado", {
      statusCode: 400,
      code: "COMPETITION_CANT_DEMOTE_OWNER"
    });
  }

  if (target.role === role) {
    return { success: true };
  }

  // Don't leave the room without any admin.
  if (role === "MEMBER") {
    const otherAdmins = competition.members.filter(
      (m) => m.userId !== targetUserId && m.role === "ADMIN" && !m.abandonedAt
    );
    if (otherAdmins.length === 0) {
      throw new AppError("A sala precisa ter pelo menos um admin ativo", {
        statusCode: 400,
        code: "COMPETITION_LAST_ADMIN"
      });
    }
  }

  await prisma.competitionMember.update({ where: { id: target.id }, data: { role } });
  return { success: true };
}

// Removes a member (soft-abandon). Same effect as leaveCompetition from the
// member's side — entries stay in the feed, leaderboard ignores them.
// Owner can't be kicked.
export async function kickMember(userId: string, competitionId: string, targetUserId: string) {
  if (userId === targetUserId) {
    throw new AppError("Use 'sair do desafio' para sair", {
      statusCode: 400,
      code: "COMPETITION_KICK_SELF"
    });
  }

  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: { members: { select: { id: true, userId: true, role: true, abandonedAt: true } } }
  });

  if (!competition) {
    throw new AppError("Competição não encontrada", { statusCode: 404, code: "COMPETITION_NOT_FOUND" });
  }

  const me = competition.members.find((m) => m.userId === userId);
  if (!me || me.role !== "ADMIN" || me.abandonedAt) {
    throw new AppError("Apenas admins podem remover membros", {
      statusCode: 403,
      code: "COMPETITION_NOT_ADMIN"
    });
  }

  if (targetUserId === competition.ownerUserId) {
    throw new AppError("O criador da sala não pode ser removido", {
      statusCode: 400,
      code: "COMPETITION_CANT_KICK_OWNER"
    });
  }

  const target = competition.members.find((m) => m.userId === targetUserId);
  if (!target) {
    throw new AppError("Membro não encontrado", { statusCode: 404, code: "COMPETITION_MEMBER_NOT_FOUND" });
  }
  if (target.abandonedAt) {
    return { success: true };
  }

  await prisma.competitionMember.update({
    where: { id: target.id },
    data: { abandonedAt: new Date(), role: "MEMBER" }
  });

  return { success: true };
}

// Posts a daily entry (proof of training/cardio). Validates kind matches
// the competition type, ensures the photo isn't a duplicate of one this
// user already used in this competition, and uniquely enforces one entry
// per (user, day, kind) via the unique constraint at the DB level.
export async function postCompetitionEntry(userId: string, competitionId: string, payload: PostEntryBody) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      type: true,
      status: true,
      endsAt: true,
      members: { select: { userId: true, abandonedAt: true } }
    }
  });

  if (!competition) {
    throw new AppError("Competição não encontrada", { statusCode: 404, code: "COMPETITION_NOT_FOUND" });
  }

  const me = competition.members.find((m) => m.userId === userId);
  if (!me) {
    throw new AppError("Você não faz parte desse desafio", { statusCode: 403, code: "COMPETITION_NOT_A_MEMBER" });
  }
  if (me.abandonedAt) {
    throw new AppError("Você abandonou esse desafio", { statusCode: 400, code: "COMPETITION_ABANDONED" });
  }

  if (competition.status !== "ACTIVE") {
    throw new AppError("Esse desafio não está em andamento", { statusCode: 400, code: "COMPETITION_NOT_ACTIVE" });
  }

  if (competition.endsAt && competition.endsAt < new Date()) {
    throw new AppError("Esse desafio já encerrou", { statusCode: 400, code: "COMPETITION_ENDED" });
  }

  // Kind validation against competition type.
  if (competition.type === "TRAINING" && payload.kind !== "TRAINING") {
    throw new AppError("Esse desafio é só de treino", { statusCode: 400, code: "COMPETITION_KIND_MISMATCH" });
  }
  if (competition.type === "CARDIO" && payload.kind !== "CARDIO") {
    throw new AppError("Esse desafio é só de cardio", { statusCode: 400, code: "COMPETITION_KIND_MISMATCH" });
  }

  // Block reusing a photo this user already used in this competition.
  const dupeByHash = await prisma.competitionEntry.findFirst({
    where: { competitionId, userId, photoHash: payload.photoHash },
    select: { id: true, day: true }
  });
  if (dupeByHash) {
    throw new AppError("Essa foto já foi usada como prova em outro dia. Tire uma foto nova.", {
      statusCode: 400,
      code: "COMPETITION_PHOTO_REUSED"
    });
  }

  // Day key — UTC midnight of the entry day. This is also the partition
  // for the unique(competitionId, userId, day, kind) constraint.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  try {
    const entry = await prisma.competitionEntry.create({
      data: {
        competitionId,
        userId,
        day: today,
        kind: payload.kind,
        workoutSessionId: payload.workoutSessionId ?? null,
        photoUrl: payload.photoUrl,
        photoPath: payload.photoPath ?? null,
        photoHash: payload.photoHash
      }
    });
    return entry;
  } catch (err) {
    // Prisma unique violation = already posted this kind today.
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      throw new AppError("Você já postou esse tipo de prova hoje", {
        statusCode: 409,
        code: "COMPETITION_ENTRY_DUPLICATE_DAY"
      });
    }
    throw err;
  }
}

// Standings: per-member count of distinct days with at least one entry,
// plus total workout volume as the tiebreaker. Excludes abandoned members
// but their entries stay in the feed.
export async function getStandings(userId: string, competitionId: string) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      status: true,
      durationDays: true,
      startedAt: true,
      endsAt: true,
      type: true,
      members: {
        where: { abandonedAt: null },
        select: {
          userId: true,
          role: true,
          user: { select: { id: true, name: true, handle: true, avatarUrl: true } }
        }
      },
      entries: {
        select: {
          userId: true,
          day: true,
          kind: true,
          workoutSession: {
            select: {
              history: { select: { reps: true, weightKg: true } }
            }
          }
        }
      }
    }
  });

  if (!competition) {
    throw new AppError("Competição não encontrada", { statusCode: 404, code: "COMPETITION_NOT_FOUND" });
  }

  // Membership check (any role, including abandoned — they can still see).
  const meMembership = await prisma.competitionMember.findUnique({
    where: { competitionId_userId: { competitionId, userId } },
    select: { id: true }
  });
  if (!meMembership) {
    throw new AppError("Você não faz parte dessa competição", { statusCode: 403, code: "COMPETITION_NOT_A_MEMBER" });
  }

  type Row = {
    userId: string;
    user: { id: string; name: string | null; handle: string; avatarUrl: string | null };
    role: "ADMIN" | "MEMBER";
    daysActive: number;
    volumeKg: number;
  };

  const rows = competition.members.map<Row>((m) => {
    const days = new Set<string>();
    let volume = 0;
    for (const e of competition.entries) {
      if (e.userId !== m.userId) continue;
      days.add(e.day.toISOString().slice(0, 10));
      if (e.workoutSession) {
        for (const h of e.workoutSession.history) {
          if (h.weightKg && h.reps) volume += h.weightKg * h.reps;
        }
      }
    }
    return {
      userId: m.userId,
      user: m.user,
      role: m.role,
      daysActive: days.size,
      volumeKg: Math.round(volume)
    };
  });

  // Sort by daysActive DESC, volumeKg DESC (tiebreaker). Stable order
  // after that doesn't matter — any equal rows tie cleanly.
  rows.sort((a, b) => b.daysActive - a.daysActive || b.volumeKg - a.volumeKg);

  return {
    competitionId: competition.id,
    status: competition.status,
    durationDays: competition.durationDays,
    startedAt: competition.startedAt,
    endsAt: competition.endsAt,
    type: competition.type,
    rows
  };
}

// Feed of recent entries (proof photos) for everyone in the competition.
// Limited + paginated by createdAt for cheapness.
export async function getCompetitionFeed(userId: string, competitionId: string, limit = 30) {
  const meMembership = await prisma.competitionMember.findUnique({
    where: { competitionId_userId: { competitionId, userId } },
    select: { id: true }
  });
  if (!meMembership) {
    throw new AppError("Você não faz parte dessa competição", { statusCode: 403, code: "COMPETITION_NOT_A_MEMBER" });
  }

  const entries = await prisma.competitionEntry.findMany({
    where: { competitionId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 60),
    select: {
      id: true,
      day: true,
      kind: true,
      photoUrl: true,
      createdAt: true,
      user: { select: { id: true, name: true, handle: true, avatarUrl: true } },
      // Workout context so the feed item can render volume / duration /
      // exercise count without an extra round trip per item. Fast because
      // each session is small and we cap the feed length.
      workoutSession: {
        select: {
          durationSec: true,
          workoutPlan: { select: { name: true } },
          history: {
            select: {
              exerciseId: true,
              reps: true,
              weightKg: true
            }
          },
          cardioEntries: {
            select: { type: true, durationSec: true, distanceMeters: true }
          }
        }
      }
    }
  });

  const items = entries.map((e) => {
    let totalVolumeKg = 0;
    const exerciseSet = new Set<string>();
    for (const h of e.workoutSession?.history ?? []) {
      if (h.weightKg && h.reps) totalVolumeKg += h.weightKg * h.reps;
      exerciseSet.add(h.exerciseId);
    }
    const cardioSec = (e.workoutSession?.cardioEntries ?? []).reduce(
      (acc, c) => acc + c.durationSec,
      0
    );
    return {
      id: e.id,
      day: e.day,
      kind: e.kind,
      photoUrl: e.photoUrl,
      createdAt: e.createdAt,
      user: e.user,
      workout: e.workoutSession
        ? {
            planName: e.workoutSession.workoutPlan?.name ?? null,
            durationSec: e.workoutSession.durationSec ?? null,
            exerciseCount: exerciseSet.size,
            totalVolumeKg: Math.round(totalVolumeKg),
            cardioSec
          }
        : null
    };
  });

  return { items };
}

// Auto-finalize / auto-cancel pass: called on-read from list endpoints so
// we don't need a real cron for now. Cancels lobbies past startDeadline
// and completes active rooms past endsAt (computing the winner).
async function reconcileExpiredCompetitions(userId: string): Promise<void> {
  const now = new Date();

  // Cancel expired lobbies that this user is in (cheap query — restricted
  // to the caller's memberships so it stays O(few) per request).
  const lobbiesToCancel = await prisma.competition.findMany({
    where: {
      status: "LOBBY",
      startDeadline: { lt: now },
      members: { some: { userId } }
    },
    select: { id: true }
  });
  for (const c of lobbiesToCancel) {
    await prisma.competition.update({
      where: { id: c.id },
      data: { status: "CANCELLED" }
    });
  }

  // Finalize active rooms that hit endsAt.
  const activeToFinalize = await prisma.competition.findMany({
    where: {
      status: "ACTIVE",
      endsAt: { lt: now },
      members: { some: { userId } }
    },
    select: { id: true }
  });
  for (const c of activeToFinalize) {
    // Compute winner using same logic as getStandings.
    const standings = await getStandings(userId, c.id);
    const winner = standings.rows[0];
    await prisma.competition.update({
      where: { id: c.id },
      data: { status: "COMPLETED", winnerUserId: winner?.userId ?? null }
    });
    if (winner) {
      try {
        const allMembers = await prisma.competitionMember.findMany({
          where: { competitionId: c.id },
          select: { userId: true }
        });
        await Promise.all(
          allMembers.map((m) =>
            createNotification({
              userId: m.userId,
              type: "COMPETITION_FINISHED",
              title: "Desafio encerrado",
              body:
                m.userId === winner.userId
                  ? "Parabéns, você venceu o desafio!"
                  : `${winner.user.name ?? winner.user.handle} venceu o desafio.`,
              metadata: { competitionId: c.id, winnerUserId: winner.userId }
            })
          )
        );
      } catch {
        // ignore
      }
    }
  }
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
