import { Prisma, PostReportReason } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { CreatePostBody } from "./social.schema";
import { createNotification, notifyUser } from "../notification/notification.service";

const POST_SELECT = {
  id: true,
  caption: true,
  photoUrl: true,
  privacy: true,
  likesCount: true,
  createdAt: true,
  _count: { select: { comments: true } },
  user: { select: { id: true, name: true, handle: true, avatarUrl: true } },
  workoutSession: {
    select: {
      id: true,
      durationSec: true,
      notes: true,
      history: {
        select: {
          exerciseId: true,
          exercise: { select: { name: true, primaryMuscleGroup: true } },
          setNumber: true,
          reps: true,
          weightKg: true,
          durationSec: true,
          distanceMeters: true,
          perceivedExertion: true,
          executionOrder: true,
          notes: true,
        },
        orderBy: [{ executionOrder: "asc" as const }, { setNumber: "asc" as const }],
      },
      cardioEntries: {
        select: { type: true, durationSec: true, distanceMeters: true, calories: true, notes: true },
        orderBy: { createdAt: "asc" as const },
      },
    },
  },
};

type RawPostUser = { id: string; name: string | null; handle: string; avatarUrl: string | null };
type RawPostCounts = { comments: number };

// Reshapes a Prisma post into the public API shape: collapses `_count` into
// a scalar `commentsCount`. The user object already has the shape we expose
// (id, name, handle, avatarUrl) so we just pass it through.
function transformPost<T extends { user: RawPostUser; _count: RawPostCounts }>(post: T) {
  const { _count, ...rest } = post;
  return { ...rest, commentsCount: _count.comments };
}

type HistoryRow = {
  exerciseId: string;
  exercise: { name: string; primaryMuscleGroup: string };
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  distanceMeters: number | null;
  perceivedExertion: number | null;
  executionOrder: number;
  notes: string | null;
};

// User-written exercise notes are persisted as a `[nota:...]` tag inside the
// first set's `notes` (keeps the schema unchanged). Surface the clean value
// once per exercise so the feed payload stays compact.
function extractUserNote(notes: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/\[nota:([^\]]+)\]/);
  if (!match) return null;
  const value = match[1].trim();
  return value.length > 0 ? value : null;
}

type CardioRow = {
  type: string;
  durationSec: number;
  distanceMeters: number | null;
  calories: number | null;
  notes: string | null;
};

function summariseSession(session: {
  durationSec: number | null;
  history: HistoryRow[];
  cardioEntries?: CardioRow[];
} | null) {
  if (!session) return null;

  type ExerciseAgg = {
    name: string;
    primaryMuscleGroup: string;
    totalVolumeKg: number;
    sets: Array<{ setNumber: number; reps: number | null; weightKg: number | null; durationSec: number | null; distanceMeters: number | null; perceivedExertion: number | null }>;
    executionOrder: number;
    userNote: string | null;
  };

  const exerciseMap = new Map<string, ExerciseAgg>();
  let totalVolumeKg = 0;

  for (const h of session.history) {
    if (!exerciseMap.has(h.exerciseId)) {
      exerciseMap.set(h.exerciseId, {
        name: h.exercise.name,
        primaryMuscleGroup: h.exercise.primaryMuscleGroup,
        totalVolumeKg: 0,
        sets: [],
        executionOrder: h.executionOrder,
        userNote: null,
      });
    }
    const agg = exerciseMap.get(h.exerciseId)!;
    if (h.reps && h.weightKg) {
      const vol = h.reps * h.weightKg;
      agg.totalVolumeKg += vol;
      totalVolumeKg += vol;
    }
    if (agg.userNote == null) {
      agg.userNote = extractUserNote(h.notes);
    }
    agg.sets.push({
      setNumber: h.setNumber,
      reps: h.reps,
      weightKg: h.weightKg,
      durationSec: h.durationSec,
      distanceMeters: h.distanceMeters,
      perceivedExertion: h.perceivedExertion,
    });
  }

  const exercises = Array.from(exerciseMap.values())
    .sort((a, b) => a.executionOrder - b.executionOrder)
    .map((e) => ({
      name: e.name,
      primaryMuscleGroup: e.primaryMuscleGroup,
      sets: e.sets.sort((a, b) => a.setNumber - b.setNumber),
      totalVolumeKg: Number(e.totalVolumeKg.toFixed(1)),
      userNote: e.userNote,
    }));

  const cardio = (session.cardioEntries ?? []).map((c) => ({
    type: c.type,
    durationSec: c.durationSec,
    distanceMeters: c.distanceMeters,
    calories: c.calories,
    notes: c.notes,
  }));

  return {
    durationSec: session.durationSec,
    totalVolumeKg: Number(totalVolumeKg.toFixed(1)),
    exercises,
    cardio,
  };
}

export async function createPost(userId: string, data: CreatePostBody) {
  if (data.workoutSessionId) {
    const session = await prisma.workoutSession.findFirst({
      where: { id: data.workoutSessionId, userId },
      select: { id: true },
    });
    if (!session) {
      throw new AppError("Sessão não encontrada", { statusCode: 404, code: "SESSION_NOT_FOUND" });
    }

    const existing = await prisma.workoutPost.findUnique({
      where: { workoutSessionId: data.workoutSessionId },
      select: { id: true },
    });
    if (existing) {
      throw new AppError("Já existe um post para essa sessão", { statusCode: 409, code: "POST_ALREADY_EXISTS" });
    }
  }

  const author = await prisma.user.findUnique({ where: { id: userId }, select: { isPrivate: true } });
  const privacy = author?.isPrivate && data.privacy === "PUBLIC" ? "FRIENDS" : data.privacy;

  const post = await prisma.workoutPost.create({
    data: {
      userId,
      workoutSessionId: data.workoutSessionId,
      caption: data.caption,
      photoUrl: data.photoUrl,
      privacy,
    },
    select: POST_SELECT,
  });

  const shaped = transformPost(post);
  return { ...shaped, workoutSummary: summariseSession(post.workoutSession) };
}

export async function updatePostPrivacy(userId: string, postId: string, privacy: "PUBLIC" | "FRIENDS" | "PRIVATE") {
  const post = await prisma.workoutPost.findUnique({
    where: { id: postId },
    select: { userId: true, removedAt: true },
  });
  if (!post || post.removedAt) {
    throw new AppError("Post não encontrado", { statusCode: 404, code: "POST_NOT_FOUND" });
  }
  if (post.userId !== userId) {
    throw new AppError("Sem permissão", { statusCode: 403, code: "FORBIDDEN" });
  }

  const author = await prisma.user.findUnique({ where: { id: userId }, select: { isPrivate: true } });
  const finalPrivacy = author?.isPrivate && privacy === "PUBLIC" ? "FRIENDS" : privacy;

  const updated = await prisma.workoutPost.update({
    where: { id: postId },
    data: { privacy: finalPrivacy },
    select: POST_SELECT,
  });

  const shaped = transformPost(updated);
  return { ...shaped, workoutSummary: summariseSession(updated.workoutSession) };
}

export async function deletePost(userId: string, postId: string, userRole?: string) {
  const post = await prisma.workoutPost.findUnique({
    where: { id: postId },
    select: { userId: true, caption: true, photoUrl: true, removedAt: true },
  });
  if (!post) throw new AppError("Post não encontrado", { statusCode: 404, code: "POST_NOT_FOUND" });
  const isOwner = post.userId === userId;
  const isAdmin = userRole === "ADMIN";
  if (!isOwner && !isAdmin) throw new AppError("Sem permissão", { statusCode: 403, code: "FORBIDDEN" });

  if (isOwner) {
    await prisma.workoutPost.delete({ where: { id: postId } });
  } else {
    if (post.removedAt) {
      throw new AppError("Post já foi removido", { statusCode: 400, code: "POST_ALREADY_REMOVED" });
    }
    await prisma.workoutPost.update({
      where: { id: postId },
      data: { removedAt: new Date(), removedByAdminId: userId },
    });
    // Removeu o post → resolve as denúncias pendentes desse post (admin agiu).
    await prisma.postReport.updateMany({
      where: { postId, status: "PENDING" },
      data: { status: "REVIEWED", reviewedById: userId, reviewedAt: new Date() },
    });
  }

  if (!isOwner && isAdmin) {
    await createNotification({
      userId: post.userId,
      type: "POST_REMOVED_BY_ADMIN",
      title: "Seu post foi removido",
      body: "Um administrador removeu seu post por conteúdo impróprio. Caso considere um engano, entre em contato com o suporte.",
      metadata: { postId, hadPhoto: Boolean(post.photoUrl), hadCaption: Boolean(post.caption) },
    }).catch(() => undefined);
  }
}

export async function adminListRemovedPostsByUser(targetUserId: string) {
  const posts = await prisma.workoutPost.findMany({
    where: { userId: targetUserId, removedAt: { not: null } },
    orderBy: { removedAt: "desc" },
    select: {
      id: true,
      caption: true,
      photoUrl: true,
      privacy: true,
      likesCount: true,
      createdAt: true,
      updatedAt: true,
      removedAt: true,
      removalReason: true,
      removedByAdminId: true,
      workoutSession: {
        select: {
          id: true,
          scheduledAt: true,
          startedAt: true,
          endedAt: true,
          durationSec: true,
          caloriesBurned: true,
          notes: true,
          workoutPlan: { select: { id: true, name: true } },
          _count: { select: { history: true } },
        },
      },
    },
  });

  const adminIds = Array.from(new Set(posts.map((p) => p.removedByAdminId).filter((id): id is string => Boolean(id))));
  const admins = adminIds.length
    ? await prisma.user.findMany({
        where: { id: { in: adminIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const adminById = new Map(admins.map((a) => [a.id, a]));

  return posts.map((p) => ({
    ...p,
    removedBy: p.removedByAdminId
      ? { id: p.removedByAdminId, displayName: adminById.get(p.removedByAdminId)?.name ?? adminById.get(p.removedByAdminId)?.email ?? null }
      : null,
  }));
}

export async function adminRestorePost(postId: string) {
  const post = await prisma.workoutPost.findUnique({
    where: { id: postId },
    select: { id: true, userId: true, removedAt: true },
  });
  if (!post) {
    throw new AppError("Post não encontrado", { statusCode: 404, code: "POST_NOT_FOUND" });
  }
  if (!post.removedAt) {
    throw new AppError("Post não está removido", { statusCode: 400, code: "POST_NOT_REMOVED" });
  }

  await prisma.workoutPost.update({
    where: { id: postId },
    data: { removedAt: null, removedByAdminId: null, removalReason: null },
  });

  await createNotification({
    userId: post.userId,
    type: "POST_REMOVED_BY_ADMIN",
    title: "Seu post foi restaurado",
    body: "Após análise do suporte, seu post voltou a ficar visível.",
    metadata: { postId, restored: true },
  }).catch(() => undefined);
}

export async function toggleLike(userId: string, postId: string) {
  const post = await prisma.workoutPost.findUnique({ where: { id: postId }, select: { id: true, userId: true, privacy: true, removedAt: true } });
  if (!post || post.removedAt) throw new AppError("Post não encontrado", { statusCode: 404, code: "POST_NOT_FOUND" });

  // Toggle à prova de corrida (toque rápido / UI otimista disparando 2x):
  // numa transação, deleteMany (idempotente) decide o "unlike"; se nada foi
  // apagado, cria o like. Mantém o contador likesCount consistente. Se um
  // create concorrente ganhar a corrida (P2002), a transação reverte e tratamos
  // como "já curtido" — antes isso virava 500 (PrismaClientKnownRequestError).
  let liked: boolean;
  try {
    liked = await prisma.$transaction(async (tx) => {
      const deleted = await tx.postLike.deleteMany({ where: { postId, userId } });
      if (deleted.count > 0) {
        await tx.workoutPost.update({ where: { id: postId }, data: { likesCount: { decrement: 1 } } });
        return false;
      }
      await tx.postLike.create({ data: { postId, userId } });
      await tx.workoutPost.update({ where: { id: postId }, data: { likesCount: { increment: 1 } } });
      return true;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { liked: true };
    }
    throw err;
  }

  if (!liked) return { liked: false };

  // Notifica o autor — pula se for o próprio user curtindo o próprio post.
  // Best-effort: erros aqui não fazem o like falhar (already curtido no DB).
  if (post.userId !== userId) {
    const liker = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, handle: true } });
    const likerLabel = liker?.name?.split(" ")[0] || (liker?.handle ? `@${liker.handle}` : "Alguém");
    await notifyUser({
      userId: post.userId,
      type: "POST_LIKE",
      title: "Curtiram seu post",
      body: `${likerLabel} curtiu seu treino`,
      metadata: { postId, likerUserId: userId },
      // Deep link direto pro post que foi curtido.
      url: `/post/${postId}`,
      // Mesma tag por post coalesce múltiplos likes recentes em uma
      // notificação visual (mais N curtidas em vez de 10 banners).
      tag: `like-${postId}`
    });
  }

  return { liked: true };
}

export async function getFeed(userId: string, page: number, pageSize: number) {
  const followingIds = (
    await prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } })
  ).map((f) => f.followingId);

  const posts = await prisma.workoutPost.findMany({
    where: {
      removedAt: null,
      OR: [
        { privacy: "PUBLIC", user: { isPrivate: false } },
        { privacy: "PUBLIC", userId: { in: followingIds } },
        { privacy: "FRIENDS", userId: { in: followingIds } },
        { userId },
      ],
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: POST_SELECT,
  });

  const likedPostIds = new Set(
    (await prisma.postLike.findMany({ where: { userId, postId: { in: posts.map((p) => p.id) } }, select: { postId: true } }))
      .map((l) => l.postId)
  );

  return posts.map((p) => {
    const shaped = transformPost(p);
    return {
      ...shaped,
      likedByMe: likedPostIds.has(p.id),
      workoutSummary: summariseSession(p.workoutSession),
    };
  });
}

export async function getUserPosts(viewerId: string | undefined, targetUserId: string, page: number, pageSize: number) {
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId, isDeleted: false, status: "ACTIVE" },
    select: { isPrivate: true },
  });
  if (!targetUser) throw new AppError("Usuário não encontrado", { statusCode: 404, code: "USER_NOT_FOUND" });

  const isFollowing = viewerId
    ? !!(await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: targetUserId } } }))
    : false;

  const isSelf = viewerId === targetUserId;

  if (targetUser.isPrivate && !isSelf && !isFollowing) {
    return [];
  }

  const privacyFilter = isSelf
    ? {}
    : isFollowing
      ? { privacy: { in: ["PUBLIC", "FRIENDS"] as Array<"PUBLIC" | "FRIENDS"> } }
      : { privacy: "PUBLIC" as const };

  const posts = await prisma.workoutPost.findMany({
    where: { userId: targetUserId, removedAt: null, ...privacyFilter },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: POST_SELECT,
  });

  return posts.map((p) => {
    const shaped = transformPost(p);
    return { ...shaped, workoutSummary: summariseSession(p.workoutSession ?? null) };
  });
}

// Busca um único post (deep-link de notificação: "Curtiram seu post" leva ao
// post exato). Aplica as mesmas regras de privacidade do feed/perfil — se o
// viewer não pode ver, devolve 404 (não revela existência).
export async function getPostById(viewerId: string, postId: string) {
  const raw = await prisma.workoutPost.findUnique({
    where: { id: postId },
    select: {
      ...POST_SELECT,
      removedAt: true,
      userId: true,
      user: { select: { id: true, name: true, handle: true, avatarUrl: true, isPrivate: true } },
    },
  });
  if (!raw || raw.removedAt) {
    throw new AppError("Post não encontrado", { statusCode: 404, code: "POST_NOT_FOUND" });
  }

  const { removedAt: _removedAt, userId: authorId, user, ...rest } = raw;
  const { isPrivate: authorIsPrivate, ...publicUser } = user;

  const isSelf = viewerId === authorId;
  let canView = isSelf;
  if (!canView) {
    const isFollowing = !!(await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: authorId } },
    }));
    if (rest.privacy === "PUBLIC") canView = !authorIsPrivate || isFollowing;
    else if (rest.privacy === "FRIENDS") canView = isFollowing;
    else canView = false; // PRIVATE
  }
  if (!canView) {
    throw new AppError("Post não encontrado", { statusCode: 404, code: "POST_NOT_FOUND" });
  }

  const likedByMe = !!(await prisma.postLike.findFirst({ where: { userId: viewerId, postId } }));
  const shaped = transformPost({ ...rest, user: publicUser });
  return { ...shaped, likedByMe, workoutSummary: summariseSession(rest.workoutSession ?? null) };
}

// Denúncia de um post pela comunidade. Cai na fila de moderação do admin.
// Idempotente (1 denúncia por usuário/post) e só notifica os admins na
// primeira denúncia do post, pra não inundar a caixa deles.
export async function reportPost(
  reporterId: string,
  postId: string,
  reason: PostReportReason,
  details?: string,
) {
  const post = await prisma.workoutPost.findUnique({
    where: { id: postId },
    select: { id: true, userId: true, removedAt: true },
  });
  if (!post || post.removedAt) {
    throw new AppError("Post não encontrado", { statusCode: 404, code: "POST_NOT_FOUND" });
  }
  if (post.userId === reporterId) {
    throw new AppError("Você não pode denunciar o próprio post", { statusCode: 400, code: "CANNOT_REPORT_OWN_POST" });
  }

  let created: { id: string };
  try {
    created = await prisma.postReport.create({
      data: { postId, reporterId, reason, details: details?.trim() || null },
      select: { id: true },
    });
  } catch (err) {
    // Já denunciou (unique postId+reporterId) ou corrida de cliques (P2002).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { reported: true, alreadyReported: true };
    }
    throw err;
  }

  // Notifica admins só na 1ª denúncia do post (in-app + push, categoria SUPPORT).
  const totalForPost = await prisma.postReport.count({ where: { postId } });
  if (totalForPost === 1) {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isDeleted: false },
      select: { id: true },
    });
    await Promise.all(
      admins.map((a) =>
        notifyUser({
          userId: a.id,
          type: "POST_REPORTED",
          title: "Post denunciado",
          body: "Um post foi denunciado pela comunidade. Toque para revisar.",
          metadata: { postId, reportId: created.id, reason },
          url: `/post/${postId}`,
          tag: `report-${postId}`,
        }).catch(() => undefined)
      )
    );
  }

  return { reported: true, alreadyReported: false };
}

// Lista as denúncias pendentes pro admin (fila de moderação). Pula posts já
// removidos. Flat list ordenada da mais recente; o admin age por post.
export async function adminListReports() {
  return prisma.postReport.findMany({
    where: { status: "PENDING", post: { removedAt: null } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      reason: true,
      details: true,
      createdAt: true,
      reporter: { select: { id: true, name: true, handle: true } },
      post: {
        select: {
          id: true,
          caption: true,
          photoUrl: true,
          createdAt: true,
          user: { select: { id: true, name: true, handle: true, avatarUrl: true } },
        },
      },
    },
  });
}

// Admin decide: REMOVE_POST reusa o fluxo de remoção (marca removido, notifica
// o autor e resolve as denúncias); DISMISS marca as denúncias do post como
// dispensadas (admin considerou o conteúdo ok).
export async function adminResolveReport(
  adminId: string,
  reportId: string,
  action: "DISMISS" | "REMOVE_POST",
) {
  const report = await prisma.postReport.findUnique({
    where: { id: reportId },
    select: { id: true, postId: true },
  });
  if (!report) {
    throw new AppError("Denúncia não encontrada", { statusCode: 404, code: "REPORT_NOT_FOUND" });
  }

  if (action === "REMOVE_POST") {
    await deletePost(adminId, report.postId, "ADMIN");
    return { action };
  }

  await prisma.postReport.updateMany({
    where: { postId: report.postId, status: "PENDING" },
    data: { status: "DISMISSED", reviewedById: adminId, reviewedAt: new Date() },
  });
  return { action };
}

export async function followUser(followerId: string, followingId: string) {
  if (followerId === followingId) {
    throw new AppError("Você não pode seguir a si mesmo", { statusCode: 400, code: "CANNOT_FOLLOW_SELF" });
  }

  const target = await prisma.user.findUnique({ where: { id: followingId, isDeleted: false }, select: { id: true } });
  if (!target) throw new AppError("Usuário não encontrado", { statusCode: 404, code: "USER_NOT_FOUND" });

  // Detecta se é primeiro follow vs re-follow pra não spammar quando o
  // usuário fica re-clicando. upsert.create rola só quando a row nasce.
  const result = await prisma.follow.upsert({
    where: { followerId_followingId: { followerId, followingId } },
    create: { followerId, followingId },
    update: {},
  });

  // Heurística simples — só notifica se a row foi recém-criada (createdAt
  // dentro dos últimos 5s). Re-follow é no-op de notificação.
  const wasJustCreated = Date.now() - result.createdAt.getTime() < 5000;
  if (wasJustCreated) {
    const follower = await prisma.user.findUnique({ where: { id: followerId }, select: { name: true, handle: true } });
    const followerLabel = follower?.name?.split(" ")[0] || (follower?.handle ? `@${follower.handle}` : "Alguém");
    await notifyUser({
      userId: followingId,
      type: "USER_FOLLOWED",
      title: "Novo seguidor",
      body: `${followerLabel} começou a te seguir`,
      metadata: { followerUserId: followerId },
      url: `/u/${followerId}`,
      tag: `follow-${followerId}`
    });
  }
}

export async function unfollowUser(followerId: string, followingId: string) {
  await prisma.follow.deleteMany({ where: { followerId, followingId } });
}

export async function getFollowers(userId: string) {
  const rows = await prisma.follow.findMany({
    where: { followingId: userId },
    select: { follower: { select: { id: true, name: true, avatarUrl: true } }, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({ ...r.follower, followedAt: r.createdAt }));
}

export async function getFollowing(userId: string) {
  const rows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { following: { select: { id: true, name: true, avatarUrl: true } }, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({ ...r.following, followedAt: r.createdAt }));
}

export async function searchUsers(viewerId: string, q: string, page: number, pageSize: number) {
  const users = await prisma.user.findMany({
    where: {
      isDeleted: false,
      status: "ACTIVE",
      id: { not: viewerId },
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, avatarUrl: true },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  const followingIds = new Set(
    (await prisma.follow.findMany({ where: { followerId: viewerId, followingId: { in: users.map((u) => u.id) } }, select: { followingId: true } }))
      .map((f) => f.followingId)
  );

  return users.map((u) => ({ ...u, isFollowing: followingIds.has(u.id) }));
}

export async function getPublicProfile(viewerId: string | undefined, targetUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId, isDeleted: false, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      isPrivate: true,
      showFollowLists: true,
      createdAt: true,
      _count: { select: { followers: true, following: true, workoutPosts: true } },
    },
  });

  if (!user) throw new AppError("Usuário não encontrado", { statusCode: 404, code: "USER_NOT_FOUND" });

  const isFollowing = viewerId
    ? !!(await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: targetUserId } } }))
    : false;

  const isSelf = viewerId === targetUserId;
  const canSeeDetails = !user.isPrivate || isSelf || isFollowing;

  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
    isPrivate: user.isPrivate,
    showFollowLists: user.showFollowLists,
    memberSince: user.createdAt,
    followersCount: canSeeDetails ? user._count.followers : null,
    followingCount: canSeeDetails ? user._count.following : null,
    postsCount: canSeeDetails ? user._count.workoutPosts : null,
    isFollowing,
  };
}

export async function getPublicFollowers(viewerId: string | undefined, targetUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId, isDeleted: false, status: "ACTIVE" },
    select: { isPrivate: true, showFollowLists: true },
  });
  if (!user) throw new AppError("Usuário não encontrado", { statusCode: 404, code: "USER_NOT_FOUND" });

  const isSelf = viewerId === targetUserId;
  const isFollowing = viewerId
    ? !!(await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: targetUserId } } }))
    : false;

  if (!isSelf && (!user.showFollowLists || (user.isPrivate && !isFollowing))) {
    throw new AppError("Lista de seguidores não disponível", { statusCode: 403, code: "FOLLOW_LIST_PRIVATE" });
  }

  const rows = await prisma.follow.findMany({
    where: { followingId: targetUserId },
    select: { follower: { select: { id: true, name: true, avatarUrl: true } }, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({ ...r.follower, followedAt: r.createdAt }));
}

export async function getPublicFollowing(viewerId: string | undefined, targetUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId, isDeleted: false, status: "ACTIVE" },
    select: { isPrivate: true, showFollowLists: true },
  });
  if (!user) throw new AppError("Usuário não encontrado", { statusCode: 404, code: "USER_NOT_FOUND" });

  const isSelf = viewerId === targetUserId;
  const isFollowing = viewerId
    ? !!(await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: targetUserId } } }))
    : false;

  if (!isSelf && (!user.showFollowLists || (user.isPrivate && !isFollowing))) {
    throw new AppError("Lista de seguindo não disponível", { statusCode: 403, code: "FOLLOW_LIST_PRIVATE" });
  }

  const rows = await prisma.follow.findMany({
    where: { followerId: targetUserId },
    select: { following: { select: { id: true, name: true, avatarUrl: true } }, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({ ...r.following, followedAt: r.createdAt }));
}

export async function getMutualFollowers(viewerId: string, targetUserId: string) {
  const [viewerFollowingIds, targetFollowerIds] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: viewerId }, select: { followingId: true } }).then((r) => r.map((f) => f.followingId)),
    prisma.follow.findMany({ where: { followingId: targetUserId }, select: { followerId: true } }).then((r) => r.map((f) => f.followerId)),
  ]);

  const mutualIds = viewerFollowingIds.filter((id) => targetFollowerIds.includes(id));
  if (mutualIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: mutualIds }, isDeleted: false, status: "ACTIVE" },
    select: { id: true, name: true, avatarUrl: true },
  });
  return users;
}



// Comentarios de posts vivem em social-comments.service.ts.
// Reexportado aqui para manter a superficie de import do controller estavel.
export * from "./social-comments.service";

// Compartilhamento de planos e comparacao de usuarios foram extraidos.
export * from "./social-share.service";
export * from "./social-compare.service";
