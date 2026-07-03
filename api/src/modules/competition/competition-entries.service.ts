import { Prisma } from "@prisma/client";
import type { CompetitionReactionKind } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { notifyUser } from "../notification/notification.service";
import { trackEvent } from "../../shared/services/event-log.service";
import { assertActiveMembership, assertEntryInCompetition } from "./competition-helpers";
import type { ListFeedQuery, PostEntryBody, ReactionBody } from "./competition.schema";

type TxClient = Prisma.TransactionClient | typeof prisma;

const ENTRY_RATE_LIMIT_SEC = 30;

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
