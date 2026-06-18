import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { createNotification, notifyUser } from "../notification/notification.service";
import { trackEvent } from "../../shared/services/event-log.service";
import type {
  CreateCompetitionBody,
  InviteMemberBody,
  ListChatQuery,
  ListFeedQuery,
  PostChatBody,
  PostEntryBody,
  PostEntryCommentBody,
  ReactionBody
} from "./competition.schema";
import type { CompetitionReactionKind } from "@prisma/client";
import { checkProfanity } from "./profanity-filter";

const CHAT_RATE_LIMIT_SEC = 2;

const MAX_MEMBERS = 10;
const INVITE_EXPIRY_DAYS = 7;
const LOBBY_START_DEADLINE_DAYS = 3;
// Anti-spam: at most one entry per user across all their competitions
// every ENTRY_RATE_LIMIT_SEC seconds. Unique-per-day still applies on top.
const ENTRY_RATE_LIMIT_SEC = 30;

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

  // Anti-spam rate limit. Even though unique-per-day blocks meaningful
  // duplicates, the upload endpoint still ate bandwidth on bursts. This
  // cap stops the "tapped the button 10 times" UX from hammering Storage.
  const lastEntry = await prisma.competitionEntry.findFirst({
    where: {
      userId,
      createdAt: { gt: new Date(Date.now() - ENTRY_RATE_LIMIT_SEC * 1000) }
    },
    select: { id: true }
  });
  if (lastEntry) {
    throw new AppError("Aguarde alguns segundos antes de enviar outra prova.", {
      statusCode: 429,
      code: "ENTRY_RATE_LIMITED"
    });
  }

  // Kind validation against competition type.
  if (competition.type === "TRAINING" && payload.kind !== "TRAINING") {
    throw new AppError("Esse desafio é só de treino", { statusCode: 400, code: "COMPETITION_KIND_MISMATCH" });
  }
  if (competition.type === "CARDIO" && payload.kind !== "CARDIO") {
    throw new AppError("Esse desafio é só de cardio", { statusCode: 400, code: "COMPETITION_KIND_MISMATCH" });
  }

  // Block reusing a photo this user already used in this competition,
  // EXCEPT when both entries come from the same workout session — that
  // lets a single workout where the user did exercises AND cardio count
  // as both proofs with the same picture.
  const dupeByHash = await prisma.competitionEntry.findFirst({
    where: {
      competitionId,
      userId,
      photoHash: payload.photoHash,
      ...(payload.workoutSessionId
        ? { workoutSessionId: { not: payload.workoutSessionId } }
        : {})
    },
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

  // Snapshot do ranking ANTES da entry pra comparar depois e detectar
  // ultrapassagens. Ordenação igual à dos standings (days › points › time
  // › volume), descendente. Uma query simples — barata mesmo com 30 membros.
  const preStandings = await prisma.competitionMemberStats.findMany({
    where: { competitionId },
    orderBy: [
      { daysActive: "desc" },
      { points: "desc" },
      { totalDurationSec: "desc" },
      { volumeKg: "desc" }
    ],
    select: { userId: true }
  });
  const preOrder = preStandings.map((s) => s.userId);
  const prePosition = preOrder.indexOf(userId);

  try {
    // Create + recompute stats in the same transaction so the
    // standings stay in sync with the entry table. Without the wrap a
    // crash between the two would leave stats stale until the next
    // entry by the same user.
    const entry = await prisma.$transaction(async (tx) => {
      const created = await tx.competitionEntry.create({
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
      await recomputeMemberStats(tx, competitionId, userId);
      return created;
    });

    // Detecta ultrapassagens: pega o ranking novo, compara com o pré, e
    // notifica quem perdeu posição pra esse poster. Fora da transação
    // pra não bloquear o response — entry já está commit, notification
    // é melhoria. Erros aqui não propagam.
    void notifyOvertakesAfterEntry(competitionId, userId, preOrder, prePosition).catch(() => undefined);

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

// Recomputes the materialised stats row for one (competition, user)
// pair from scratch. Cheap because the entry set is bounded by
// durationDays × 2 (max ~180 rows for a 90-day BOTH room). Always
// called inside a transaction so the entry change and the stats
// update commit atomically. If the row doesn't exist yet, it's
// created via upsert.
async function recomputeMemberStats(tx: TxClient, competitionId: string, userId: string): Promise<void> {
  const entries = await tx.competitionEntry.findMany({
    where: { competitionId, userId },
    select: {
      day: true,
      workoutSessionId: true,
      workoutSession: {
        select: {
          durationSec: true,
          history: { select: { reps: true, weightKg: true } }
        }
      }
    }
  });

  const days = new Set<string>();
  const sessions = new Map<string, { durationSec: number; volume: number }>();
  let points = 0;
  for (const e of entries) {
    days.add(e.day.toISOString().slice(0, 10));
    points += 1;
    if (e.workoutSessionId && e.workoutSession && !sessions.has(e.workoutSessionId)) {
      let vol = 0;
      for (const h of e.workoutSession.history) {
        if (h.weightKg && h.reps) vol += h.weightKg * h.reps;
      }
      sessions.set(e.workoutSessionId, {
        durationSec: e.workoutSession.durationSec ?? 0,
        volume: vol
      });
    }
  }
  let totalDurationSec = 0;
  let volume = 0;
  for (const s of sessions.values()) {
    totalDurationSec += s.durationSec;
    volume += s.volume;
  }

  await tx.competitionMemberStats.upsert({
    where: { competitionId_userId: { competitionId, userId } },
    update: {
      daysActive: days.size,
      points,
      totalDurationSec,
      volumeKg: Math.round(volume)
    },
    create: {
      competitionId,
      userId,
      daysActive: days.size,
      points,
      totalDurationSec,
      volumeKg: Math.round(volume)
    }
  });
}

// Standings: reads materialised aggregates from competition_member_stats
// (kept in sync by recomputeMemberStats) and joins streak — which is
// computed live from a tiny per-user day list so it naturally decays
// when a user misses a day without us needing a cron tick.
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
      memberStats: {
        select: {
          userId: true,
          daysActive: true,
          points: true,
          totalDurationSec: true,
          volumeKg: true
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

  // Lazy backfill: if any active member is missing a stats row (legacy
  // competitions created before the materialised table existed, or a
  // member added before this code shipped), compute on the fly so the
  // standings render correctly. Subsequent calls hit the cached row.
  const statsByUser = new Map(competition.memberStats.map((s) => [s.userId, s]));
  const missing = competition.members.filter((m) => !statsByUser.has(m.userId)).map((m) => m.userId);
  if (missing.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const uid of missing) {
        await recomputeMemberStats(tx, competitionId, uid);
      }
    });
    // Re-read the stats we just populated. Cheap — small set keyed by
    // the unique (competitionId, userId) index.
    const fresh = await prisma.competitionMemberStats.findMany({
      where: { competitionId, userId: { in: missing } },
      select: { userId: true, daysActive: true, points: true, totalDurationSec: true, volumeKg: true }
    });
    for (const s of fresh) statsByUser.set(s.userId, s);
  }

  // Streak still computed live so it decays naturally when a user
  // misses a day. One bulk query keyed by the (competitionId, userId)
  // index — cheap even with hundreds of entries per user.
  const dayRows = await prisma.competitionEntry.findMany({
    where: {
      competitionId,
      userId: { in: competition.members.map((m) => m.userId) }
    },
    select: { userId: true, day: true },
    distinct: ["userId", "day"]
  });
  const daysByUser = new Map<string, Set<string>>();
  for (const r of dayRows) {
    let set = daysByUser.get(r.userId);
    if (!set) {
      set = new Set();
      daysByUser.set(r.userId, set);
    }
    set.add(r.day.toISOString().slice(0, 10));
  }

  const todayKey = new Date().toISOString().slice(0, 10);

  type Row = {
    userId: string;
    user: { id: string; name: string | null; handle: string; avatarUrl: string | null };
    role: "ADMIN" | "MEMBER";
    daysActive: number;
    points: number;
    totalDurationSec: number;
    volumeKg: number;
    streak: number;
  };

  const rows = competition.members.map<Row>((m) => {
    const stats = statsByUser.get(m.userId);
    const days = daysByUser.get(m.userId) ?? new Set<string>();

    // Walk backwards from today. If today not yet posted, start from
    // yesterday so the user doesn't see "0" first thing in the morning.
    const cursor = new Date(`${todayKey}T00:00:00Z`);
    if (!days.has(cursor.toISOString().slice(0, 10))) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    let streak = 0;
    while (days.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    return {
      userId: m.userId,
      user: m.user,
      role: m.role,
      daysActive: stats?.daysActive ?? 0,
      points: stats?.points ?? 0,
      totalDurationSec: stats?.totalDurationSec ?? 0,
      volumeKg: stats?.volumeKg ?? 0,
      streak
    };
  });

  // Tiebreaker chain: days → points → time → volume.
  rows.sort((a, b) =>
    b.daysActive - a.daysActive ||
    b.points - a.points ||
    b.totalDurationSec - a.totalDurationSec ||
    b.volumeKg - a.volumeKg
  );

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
// Cursor-based pagination by createdAt — clients pass `before` (the
// createdAt of their oldest cached item) to fetch the next page. The
// composite index (competitionId, createdAt) makes this an indexed
// range scan even when a long-running room has thousands of entries.
export async function getCompetitionFeed(
  userId: string,
  competitionId: string,
  query: ListFeedQuery = { limit: 30 }
) {
  const meMembership = await prisma.competitionMember.findUnique({
    where: { competitionId_userId: { competitionId, userId } },
    select: { id: true }
  });
  if (!meMembership) {
    throw new AppError("Você não faz parte dessa competição", { statusCode: 403, code: "COMPETITION_NOT_A_MEMBER" });
  }

  const entries = await prisma.competitionEntry.findMany({
    where: {
      competitionId,
      ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {})
    },
    orderBy: { createdAt: "desc" },
    take: query.limit,
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

  // Reactions are loaded in one batch keyed by entry id so we avoid an
  // N+1 query per feed item.
  const reactionsByEntry = await loadReactionSummary(entries.map((e) => e.id), userId);
  // Comment counts batched the same way — we only need the number on the
  // grid tile; the full thread is loaded on demand when the user opens it.
  const commentsByEntry = await loadCommentCounts(entries.map((e) => e.id));

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
        : null,
      reactions: reactionsByEntry.get(e.id) ?? [],
      commentsCount: commentsByEntry.get(e.id) ?? 0
    };
  });

  // nextCursor is the createdAt of the last item returned. Clients pass
  // it back as `before` to fetch the next page. Null when we returned
  // fewer items than requested — there's nothing left to paginate.
  const nextCursor = items.length === query.limit
    ? items[items.length - 1].createdAt.toISOString()
    : null;

  return { items, nextCursor };
}

// ─── Reactions on entries ────────────────────────────────────────────────

async function assertEntryInCompetition(competitionId: string, entryId: string): Promise<void> {
  const entry = await prisma.competitionEntry.findUnique({
    where: { id: entryId },
    select: { competitionId: true }
  });
  if (!entry || entry.competitionId !== competitionId) {
    throw new AppError("Prova não encontrada", { statusCode: 404, code: "COMPETITION_ENTRY_NOT_FOUND" });
  }
}

// Toggles a reaction on/off. If the user already reacted with the same
// kind, removes it. Otherwise inserts. Different reaction kinds from the
// same user on the same entry can coexist (you can clap AND fire-emoji
// the same proof) — matches the multi-reaction pattern of Slack/Discord.
export async function toggleReaction(userId: string, competitionId: string, entryId: string, payload: ReactionBody) {
  await assertActiveMembership(userId, competitionId);
  await assertEntryInCompetition(competitionId, entryId);

  // Toggle à prova de corrida (toques rápidos / UI otimista disparando 2x):
  // deleteMany é idempotente (apagar 0 não dá erro). Se nada foi apagado, a
  // reação não existia → cria. Um create concorrente pode ganhar a corrida e
  // estourar a unique (P2002) — nesse caso a reação já está lá, então tratamos
  // como "added" em vez de crashar (antes isso virava 500 no Sentry).
  const deleted = await prisma.competitionEntryReaction.deleteMany({
    where: { entryId, userId, kind: payload.kind }
  });
  if (deleted.count > 0) {
    return { action: "removed" as const, kind: payload.kind };
  }

  try {
    await prisma.competitionEntryReaction.create({
      data: { entryId, userId, kind: payload.kind }
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Corrida: outra requisição criou a mesma reação primeiro. O estado final
      // é o mesmo (reação presente) → não é erro.
      return { action: "added" as const, kind: payload.kind };
    }
    throw err;
  }
  return { action: "added" as const, kind: payload.kind };
}

export type ReactionSummary = {
  kind: CompetitionReactionKind;
  count: number;
  mine: boolean;
};

// Aggregated reaction counts per entry id, with a flag for which kinds
// the calling user already reacted with. Called from the feed endpoint
// so we don't have to expose a separate "list reactions" route.
async function loadReactionSummary(
  entryIds: string[],
  currentUserId: string
): Promise<Map<string, ReactionSummary[]>> {
  if (entryIds.length === 0) return new Map();

  const rows = await prisma.competitionEntryReaction.findMany({
    where: { entryId: { in: entryIds } },
    select: { entryId: true, kind: true, userId: true }
  });

  const map = new Map<string, Map<CompetitionReactionKind, { count: number; mine: boolean }>>();
  for (const r of rows) {
    let perEntry = map.get(r.entryId);
    if (!perEntry) {
      perEntry = new Map();
      map.set(r.entryId, perEntry);
    }
    const current = perEntry.get(r.kind) ?? { count: 0, mine: false };
    current.count += 1;
    if (r.userId === currentUserId) current.mine = true;
    perEntry.set(r.kind, current);
  }

  const result = new Map<string, ReactionSummary[]>();
  for (const [entryId, perEntry] of map.entries()) {
    const items: ReactionSummary[] = [];
    for (const [kind, value] of perEntry.entries()) {
      items.push({ kind, count: value.count, mine: value.mine });
    }
    result.set(entryId, items);
  }
  return result;
}

// Admin moderation: hard-delete a proof entry. Cascade drops attached
// reactions and comments. The underlying storage object is left as
// orphaned for now — Supabase TTL / a future GC pass cleans it up.
// Only ACTIVE admins of the room can do this. Author can NOT delete
// their own entry to discourage gaming the leaderboard (they post
// proof, see how others reacted, then delete to redo).
export async function deleteCompetitionEntry(userId: string, competitionId: string, entryId: string) {
  const me = await prisma.competitionMember.findUnique({
    where: { competitionId_userId: { competitionId, userId } },
    select: { role: true, abandonedAt: true }
  });
  if (!me || me.role !== "ADMIN" || me.abandonedAt) {
    throw new AppError("Apenas admins podem remover provas", {
      statusCode: 403,
      code: "COMPETITION_NOT_ADMIN"
    });
  }

  const entry = await prisma.competitionEntry.findUnique({
    where: { id: entryId },
    select: { id: true, competitionId: true, userId: true }
  });
  if (!entry || entry.competitionId !== competitionId) {
    throw new AppError("Prova não encontrada", { statusCode: 404, code: "COMPETITION_ENTRY_NOT_FOUND" });
  }

  // Delete + recompute stats for the affected user atomically.
  await prisma.$transaction(async (tx) => {
    await tx.competitionEntry.delete({ where: { id: entryId } });
    await recomputeMemberStats(tx, competitionId, entry.userId);
  });

  void trackEvent({
    userId,
    category: "COMPETITION",
    action: "competition_entry_deleted",
    resourceType: "competition_entry",
    resourceId: entryId,
    metadata: { competitionId, ownerUserId: entry.userId }
  });

  return { success: true };
}

// ─── Entry comments ─────────────────────────────────────────────────────

async function loadCommentCounts(entryIds: string[]): Promise<Map<string, number>> {
  if (entryIds.length === 0) return new Map();
  const rows = await prisma.competitionEntryComment.groupBy({
    by: ["entryId"],
    where: { entryId: { in: entryIds } },
    _count: { _all: true }
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.entryId, r._count._all);
  return map;
}

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

// ─── Chat ────────────────────────────────────────────────────────────────

async function assertActiveMembership(userId: string, competitionId: string): Promise<void> {
  const m = await prisma.competitionMember.findUnique({
    where: { competitionId_userId: { competitionId, userId } },
    select: { abandonedAt: true }
  });
  if (!m) {
    throw new AppError("Você não faz parte dessa competição", { statusCode: 403, code: "COMPETITION_NOT_A_MEMBER" });
  }
  if (m.abandonedAt) {
    throw new AppError("Você abandonou essa competição", { statusCode: 403, code: "COMPETITION_ABANDONED" });
  }
}

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

// Detecta usuários ultrapassados após um post de entry e dispara notificação
// pra cada um. Roda fora da transação do entry — best-effort, falhas logam
// e seguem. Algoritmo: recalcula o ranking pós-entry, acha a posição nova
// do poster; quem estava entre nova-posição e velha-posição (no ranking
// PRÉ-entry) foi ultrapassado. Cobre também o caso do poster que não estava
// na tabela de stats antes (prePosition=-1) — nesse cenário, todos que
// estavam à frente da nova posição foram ultrapassados.
async function notifyOvertakesAfterEntry(
  competitionId: string,
  posterUserId: string,
  preOrder: string[],
  prePosition: number
): Promise<void> {
  const postStandings = await prisma.competitionMemberStats.findMany({
    where: { competitionId },
    orderBy: [
      { daysActive: "desc" },
      { points: "desc" },
      { totalDurationSec: "desc" },
      { volumeKg: "desc" }
    ],
    select: { userId: true }
  });
  const postOrder = postStandings.map((s) => s.userId);
  const postPosition = postOrder.indexOf(posterUserId);

  // Sem movimento (mesma posição) ou poster nem entrou no ranking — nada
  // a notificar.
  if (postPosition === -1) return;
  if (prePosition !== -1 && postPosition >= prePosition) return;

  const overtakenIds = preOrder.slice(
    postPosition,
    prePosition === -1 ? preOrder.length : prePosition
  );
  if (overtakenIds.length === 0) return;

  const [poster, competition] = await Promise.all([
    prisma.user.findUnique({
      where: { id: posterUserId },
      select: { name: true, handle: true }
    }),
    prisma.competition.findUnique({
      where: { id: competitionId },
      select: { name: true }
    })
  ]);

  const posterLabel =
    poster?.name?.split(" ")[0] ||
    (poster?.handle ? `@${poster.handle}` : "Alguém");
  const compLabel = competition?.name ?? "desafio";

  for (const overtakenId of overtakenIds) {
    // Sem self-notify (não deveria acontecer já que o slice exclui o
    // poster, mas defensivo).
    if (overtakenId === posterUserId) continue;

    await notifyUser({
      userId: overtakenId,
      type: "COMPETITION_RANKING_OVERTAKEN",
      title: "Você foi ultrapassado",
      body: `${posterLabel} passou na sua frente em "${compLabel}"`,
      metadata: { competitionId, posterUserId },
      url: `/desafios/${competitionId}`,
      tag: `overtake-${competitionId}`
    }).catch(() => undefined);
  }
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
