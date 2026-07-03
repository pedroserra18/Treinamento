import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";

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
