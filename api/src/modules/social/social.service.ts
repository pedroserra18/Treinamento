import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { CreatePostBody } from "./social.schema";
import { createNotification } from "../notification/notification.service";

const POST_SELECT = {
  id: true,
  caption: true,
  photoUrl: true,
  privacy: true,
  likesCount: true,
  createdAt: true,
  user: { select: { id: true, name: true, avatarUrl: true } },
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
        },
        orderBy: [{ executionOrder: "asc" as const }, { setNumber: "asc" as const }],
      },
    },
  },
};

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
};

function summariseSession(session: {
  durationSec: number | null;
  history: HistoryRow[];
} | null) {
  if (!session) return null;

  type ExerciseAgg = {
    name: string;
    primaryMuscleGroup: string;
    totalVolumeKg: number;
    sets: Array<{ setNumber: number; reps: number | null; weightKg: number | null; durationSec: number | null; distanceMeters: number | null; perceivedExertion: number | null }>;
    executionOrder: number;
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
      });
    }
    const agg = exerciseMap.get(h.exerciseId)!;
    if (h.reps && h.weightKg) {
      const vol = h.reps * h.weightKg;
      agg.totalVolumeKg += vol;
      totalVolumeKg += vol;
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
    }));

  return {
    durationSec: session.durationSec,
    totalVolumeKg: Number(totalVolumeKg.toFixed(1)),
    exercises,
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

  const post = await prisma.workoutPost.create({
    data: {
      userId,
      workoutSessionId: data.workoutSessionId,
      caption: data.caption,
      photoUrl: data.photoUrl,
      privacy: data.privacy,
    },
    select: POST_SELECT,
  });

  return { ...post, workoutSummary: summariseSession(post.workoutSession) };
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
      removedAt: true,
      removalReason: true,
      removedByAdminId: true,
    },
  });
  return posts;
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

  const existing = await prisma.postLike.findUnique({ where: { postId_userId: { postId, userId } } });

  if (existing) {
    await prisma.$transaction([
      prisma.postLike.delete({ where: { postId_userId: { postId, userId } } }),
      prisma.workoutPost.update({ where: { id: postId }, data: { likesCount: { decrement: 1 } } }),
    ]);
    return { liked: false };
  }

  await prisma.$transaction([
    prisma.postLike.create({ data: { postId, userId } }),
    prisma.workoutPost.update({ where: { id: postId }, data: { likesCount: { increment: 1 } } }),
  ]);
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
        { privacy: "PUBLIC" },
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

  return posts.map((p) => ({
    ...p,
    likedByMe: likedPostIds.has(p.id),
    workoutSummary: summariseSession(p.workoutSession),
  }));
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

  return posts.map((p) => ({ ...p, workoutSummary: summariseSession(p.workoutSession ?? null) }));
}

export async function followUser(followerId: string, followingId: string) {
  if (followerId === followingId) {
    throw new AppError("Você não pode seguir a si mesmo", { statusCode: 400, code: "CANNOT_FOLLOW_SELF" });
  }

  const target = await prisma.user.findUnique({ where: { id: followingId, isDeleted: false }, select: { id: true } });
  if (!target) throw new AppError("Usuário não encontrado", { statusCode: 404, code: "USER_NOT_FOUND" });

  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId, followingId } },
    create: { followerId, followingId },
    update: {},
  });
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

export async function sharePlan(userId: string, planId: string) {
  const plan = await prisma.workoutPlan.findFirst({
    where: { id: planId, userId },
    select: { id: true, name: true },
  });
  if (!plan) throw new AppError("Rotina não encontrada", { statusCode: 404, code: "PLAN_NOT_FOUND" });

  const shared = await prisma.sharedPlan.create({
    data: { planId, creatorId: userId },
    select: { token: true },
  });

  return { token: shared.token };
}

export async function getSharedPlan(token: string) {
  const shared = await prisma.sharedPlan.findUnique({
    where: { token },
    select: {
      plan: {
        select: {
          id: true,
          name: true,
          description: true,
          exercises: {
            orderBy: { orderIndex: "asc" },
            select: {
              orderIndex: true,
              sets: true,
              repsMin: true,
              repsMax: true,
              restSec: true,
              notes: true,
              exercise: { select: { id: true, name: true, primaryMuscleGroup: true, equipment: true, thumbnailUrl: true } },
            },
          },
        },
      },
      creator: { select: { id: true, name: true, avatarUrl: true } },
      createdAt: true,
    },
  });

  if (!shared) throw new AppError("Link inválido ou expirado", { statusCode: 404, code: "SHARED_PLAN_NOT_FOUND" });

  return shared;
}

export async function saveSharedPlan(userId: string, token: string) {
  const shared = await getSharedPlan(token);

  const newPlan = await prisma.workoutPlan.create({
    data: {
      userId,
      name: shared.plan.name,
      description: shared.plan.description ?? undefined,
      status: "ACTIVE",
    },
  });

  for (const ex of shared.plan.exercises) {
    await prisma.workoutPlanExercise.create({
      data: {
        workoutPlanId: newPlan.id,
        exerciseId: ex.exercise.id,
        orderIndex: ex.orderIndex,
        sets: ex.sets ?? undefined,
        repsMin: ex.repsMin ?? undefined,
        repsMax: ex.repsMax ?? undefined,
        restSec: ex.restSec ?? undefined,
        notes: ex.notes ?? undefined,
      },
    });
  }

  return { planId: newPlan.id, planName: newPlan.name };
}

export async function compareExercise(viewerId: string, targetUserId: string, exerciseId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  async function getStats(uid: string) {
    const rows = await prisma.workoutHistory.findMany({
      where: { userId: uid, exerciseId, completedAt: { gte: thirtyDaysAgo } },
      select: { reps: true, weightKg: true, setNumber: true },
    });

    if (rows.length === 0) return { maxWeightKg: 0, totalVolumeKg: 0, totalSets: 0, totalReps: 0, bestSet: null as { reps: number; weightKg: number } | null };

    let maxWeightKg = 0;
    let totalVolumeKg = 0;
    let totalReps = 0;
    let bestSetScore = 0;
    let bestSet: { reps: number; weightKg: number } | null = null;

    for (const r of rows) {
      if (r.weightKg != null && r.weightKg > maxWeightKg) maxWeightKg = r.weightKg;
      if (r.reps != null && r.weightKg != null) {
        const vol = r.reps * r.weightKg;
        totalVolumeKg += vol;
        totalReps += r.reps;
        if (vol > bestSetScore) { bestSetScore = vol; bestSet = { reps: r.reps, weightKg: r.weightKg }; }
      } else if (r.reps != null) {
        totalReps += r.reps;
      }
    }

    return {
      maxWeightKg: Number(maxWeightKg.toFixed(1)),
      totalVolumeKg: Number(totalVolumeKg.toFixed(1)),
      totalSets: rows.length,
      totalReps,
      bestSet,
    };
  }

  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId }, select: { name: true } });

  const [meStats, themStats, meProfile, themProfile] = await Promise.all([
    getStats(viewerId),
    getStats(targetUserId),
    prisma.user.findUnique({ where: { id: viewerId }, select: { name: true, avatarUrl: true } }),
    prisma.user.findUnique({ where: { id: targetUserId }, select: { name: true, avatarUrl: true } }),
  ]);

  return {
    exerciseName: exercise?.name ?? exerciseId,
    me: { name: meProfile?.name, avatarUrl: meProfile?.avatarUrl, stats: meStats },
    them: { name: themProfile?.name, avatarUrl: themProfile?.avatarUrl, stats: themStats },
  };
}

export async function compareUsers(viewerId: string, targetUserId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  async function getUserStats(uid: string) {
    const [sessions7d, sessions30d, history7d, topExercises] = await Promise.all([
      prisma.workoutSession.count({ where: { userId: uid, status: "COMPLETED", endedAt: { gte: sevenDaysAgo } } }),
      prisma.workoutSession.count({ where: { userId: uid, status: "COMPLETED", endedAt: { gte: thirtyDaysAgo } } }),
      prisma.workoutHistory.findMany({
        where: { userId: uid, completedAt: { gte: sevenDaysAgo }, weightKg: { not: null }, reps: { not: null } },
        select: { weightKg: true, reps: true, exercise: { select: { name: true } }, exerciseId: true },
      }),
      prisma.workoutHistory.groupBy({
        by: ["exerciseId"],
        where: { userId: uid, completedAt: { gte: thirtyDaysAgo } },
        _count: { exerciseId: true },
        orderBy: { _count: { exerciseId: "desc" } },
        take: 3,
      }),
    ]);

    const volumeKg7d = history7d.reduce((sum, h) => sum + (h.reps! * h.weightKg!), 0);

    const exerciseIds = topExercises.map((e) => e.exerciseId);
    const exerciseNames = await prisma.exercise.findMany({
      where: { id: { in: exerciseIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(exerciseNames.map((e) => [e.id, e.name]));

    return {
      workouts7d: sessions7d,
      workouts30d: sessions30d,
      volumeKg7d: Number(volumeKg7d.toFixed(1)),
      topExercises: topExercises.map((e) => ({ name: nameMap.get(e.exerciseId) ?? "?", count: e._count.exerciseId })),
    };
  }

  const [viewer, target, viewerProfile, targetProfile] = await Promise.all([
    getUserStats(viewerId),
    getUserStats(targetUserId),
    prisma.user.findUnique({ where: { id: viewerId }, select: { name: true, avatarUrl: true } }),
    prisma.user.findUnique({ where: { id: targetUserId, isDeleted: false }, select: { name: true, avatarUrl: true } }),
  ]);

  if (!targetProfile) throw new AppError("Usuário não encontrado", { statusCode: 404, code: "USER_NOT_FOUND" });

  return {
    me: { name: viewerProfile?.name, avatarUrl: viewerProfile?.avatarUrl, stats: viewer },
    them: { name: targetProfile.name, avatarUrl: targetProfile.avatarUrl, stats: target },
  };
}
