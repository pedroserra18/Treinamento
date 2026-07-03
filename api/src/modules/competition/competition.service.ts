import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { createNotification, notifyUser } from "../notification/notification.service";
import { trackEvent } from "../../shared/services/event-log.service";
import type {
  CreateCompetitionBody,
  InviteMemberBody
} from "./competition.schema";
// Reconcile (finalização de competição) usa getStandings, que vive no serviço
// de entries. Dependência unidirecional (entries não importa daqui) — sem ciclo.
import { getStandings } from "./competition-entries.service";

const MAX_MEMBERS = 10;
const INVITE_EXPIRY_DAYS = 7;
const LOBBY_START_DEADLINE_DAYS = 3;

// Postgres throws 40001 (serialization_failure) when two Serializable
// transactions conflict — for us, that happens when two simultaneous
// "create/accept" requests race for the same user's single-slot
// guarantee. We re-throw as a friendly 409 so the client UI shows the
// right message.
function isSerializationFailure(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === "P2034";
  }
  if (typeof err === "object" && err !== null) {
    const e = err as { code?: string; meta?: { code?: string } };
    if (e.code === "40001" || e.meta?.code === "40001") return true;
  }
  return false;
}

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
// Accepts an optional transaction client so callers can perform the check
// + the membership insert inside the same atomic unit. Without this, a
// user could double-tap accept and end up in two rooms before the check
// fires for the second request — small window but real at high traffic.
type TxClient = Prisma.TransactionClient | typeof prisma;

async function assertUserHasNoActiveCompetition(userId: string, db: TxClient = prisma): Promise<void> {
  const existing = await db.competitionMember.findFirst({
    where: {
      userId,
      abandonedAt: null, // soft-abandoned members no longer hold the slot
      competition: { status: { in: ["LOBBY", "ACTIVE"] } }
    },
    select: { id: true, competition: { select: { id: true, name: true } } }
  });

  if (existing) {
    throw new AppError("Você já está em uma competição ativa. Saia dela primeiro ou espere ela acabar.", {
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
  // Same Serializable transaction pattern as acceptInvite — the check
  // lives inside the tx so two simultaneous creates can't race.
  try {
    return await prisma.$transaction(
    async (tx) => {
      await assertUserHasNoActiveCompetition(userId, tx);

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
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  } catch (err) {
    if (isSerializationFailure(err)) {
      throw new AppError("Você já está em uma competição ativa. Saia dela primeiro ou espere ela acabar.", {
        statusCode: 409,
        code: "COMPETITION_ALREADY_IN_ANOTHER"
      });
    }
    throw err;
  }
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

  // Atomic check + insert with Serializable isolation so two simultaneous
  // accepts on the same account can't both succeed. Postgres re-checks on
  // commit and aborts the loser with a serialization error which we catch.
  let result;
  try {
    result = await prisma.$transaction(
    async (tx) => {
      await assertUserHasNoActiveCompetition(userId, tx);

      const member = await tx.competitionMember.create({
        data: { competitionId: invite.competitionId, userId, role: "MEMBER" }
      });

      await tx.competitionInvite.update({
        where: { id: invite.id },
        data: { status: "ACCEPTED", respondedAt: new Date() }
      });

      return member;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  } catch (err) {
    if (isSerializationFailure(err)) {
      throw new AppError("Você já está em uma competição ativa. Saia dela primeiro ou espere ela acabar.", {
        statusCode: 409,
        code: "COMPETITION_ALREADY_IN_ANOTHER"
      });
    }
    throw err;
  }

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
  // Audit trail — moderator actions are the ones we want to be able to
  // explain after the fact ("why was X demoted?"). trackEvent swallows
  // its own errors so a logging failure can't break the action.
  void trackEvent({
    userId,
    category: "COMPETITION",
    action: role === "ADMIN" ? "competition_member_promoted" : "competition_member_demoted",
    resourceType: "competition",
    resourceId: competitionId,
    metadata: { targetUserId, previousRole: target.role, newRole: role }
  });
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

  void trackEvent({
    userId,
    category: "COMPETITION",
    action: "competition_member_kicked",
    resourceType: "competition",
    resourceId: competitionId,
    metadata: { targetUserId }
  });

  return { success: true };
}

async function reconcileExpiredCompetitions(userId: string | null = null): Promise<{
  cancelledLobbies: number;
  finalizedActive: number;
}> {
  const now = new Date();

  const memberScope = userId ? { members: { some: { userId } } } : {};

  // Cancel expired lobbies.
  const lobbiesToCancel = await prisma.competition.findMany({
    where: {
      status: "LOBBY",
      startDeadline: { lt: now },
      ...memberScope
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
      ...memberScope
    },
    select: { id: true, members: { select: { userId: true }, take: 1 } }
  });
  for (const c of activeToFinalize) {
    // Use any member's id to satisfy the membership check inside
    // getStandings — that's how we re-use the same winner-picking logic
    // regardless of who triggered the reconcile.
    const scopeUserId = userId ?? c.members[0]?.userId;
    if (!scopeUserId) continue;
    const standings = await getStandings(scopeUserId, c.id);
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

  return {
    cancelledLobbies: lobbiesToCancel.length,
    finalizedActive: activeToFinalize.length
  };
}

// Exposed for the cron endpoint. Runs across all users.
export async function runCompetitionReconcile(): Promise<{
  cancelledLobbies: number;
  finalizedActive: number;
}> {
  return reconcileExpiredCompetitions(null);
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

// Detecta competições ACTIVE que vão acabar nas próximas N horas e ainda
// não tiveram aviso. Dispara push pra cada membro ativo com tag única —
// reentregas (cron rodando 2x sem state) coalesce visualmente. Marca via
// presença de Notification do tipo COMPETITION_ENDING_SOON por
// competition+user pra ser idempotente.
export async function notifyCompetitionsEndingSoon(): Promise<{
  competitionsChecked: number;
  notificationsSent: number;
}> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2h

  const ending = await prisma.competition.findMany({
    where: {
      status: "ACTIVE",
      endsAt: { gt: now, lte: windowEnd }
    },
    select: {
      id: true,
      name: true,
      endsAt: true,
      members: {
        where: { abandonedAt: null },
        select: { userId: true }
      }
    }
  });

  let notificationsSent = 0;

  for (const comp of ending) {
    const memberIds = comp.members.map((m) => m.userId);
    if (memberIds.length === 0) continue;

    // Achar membros que JÁ receberam aviso pra esta competição. Usamos
    // metadata.competitionId pra filtrar — o índice padrão do JSON é
    // suficiente pro volume aqui (poucas competições por noite).
    const existing = await prisma.notification.findMany({
      where: {
        userId: { in: memberIds },
        type: "COMPETITION_ENDING_SOON",
        metadata: { path: ["competitionId"], equals: comp.id } as never
      },
      select: { userId: true }
    });
    const alreadyNotified = new Set(existing.map((e) => e.userId));
    const toNotify = memberIds.filter((id) => !alreadyNotified.has(id));
    if (toNotify.length === 0) continue;

    const compName = comp.name ?? "Seu desafio";
    const hoursLeft = Math.max(
      1,
      Math.round((comp.endsAt!.getTime() - now.getTime()) / (60 * 60 * 1000))
    );

    for (const uid of toNotify) {
      await notifyUser({
        userId: uid,
        type: "COMPETITION_ENDING_SOON",
        title: "Competição acabando",
        body: `"${compName}" termina em ${hoursLeft}h. Bate a última prova!`,
        metadata: { competitionId: comp.id, hoursLeft },
        url: `/desafios/${comp.id}`,
        tag: `ending-${comp.id}`
      }).catch(() => undefined);
      notificationsSent += 1;
    }
  }

  return { competitionsChecked: ending.length, notificationsSent };
}

// Chat da competição vive em competition-chat.service.ts.
// Reexportado aqui para manter a superfície de import do controller estável.
export * from "./competition-chat.service";

// Comentarios de prova vivem em competition-comments.service.ts.
// Reexportado aqui para manter a superficie de import do controller estavel.
export * from "./competition-comments.service";

// Entries/standings/feed/reactions vivem em competition-entries.service.ts.
// Reexportado aqui para manter a superficie de import do controller estavel.
export * from "./competition-entries.service";
