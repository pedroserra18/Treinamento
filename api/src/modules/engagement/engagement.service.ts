import { prisma } from "../../config/prisma";
import { notifyUser } from "../notification/notification.service";
import { logger } from "../../config/logger";

// Cron handlers de notificações de "engajamento" — todas pertencem à
// categoria ENGAGEMENT do toggle do usuário. Implementadas pra rodar a
// cada poucas horas via cron-job.org chamando os endpoints /cron/* do
// backend. Cada handler é idempotente: rodar 2x na mesma janela não
// duplica push porque usamos throttles (last*PushAt nas preferências)
// ou checagens de notification já existente.
//
// Cada função filtra ATIVAMENTE quem deve receber pra evitar spam. Sem
// excedentes — quem nunca abriu o app, quem nunca treinou, quem deletou
// a conta etc. são todos excluídos no SQL antes do loop.

// ─── Streak at risk ─────────────────────────────────────────────────────
//
// Se o user tem streak ≥ 3 dias consecutivos de treino e ainda não treinou
// hoje, manda um aviso. Sem streak grande não vale o ruído — primeira
// vez não tem custo emocional de quebrar. Idempotente por dia: checa se
// já existe Notification do tipo STREAK_AT_RISK criada hoje.
export async function notifyStreakAtRisk(): Promise<{
  checked: number;
  notified: number;
}> {
  // Dia atual no TZ do servidor (UTC). Usa start-of-day como cutoff pra
  // não notificar quem treinou ainda hoje.
  const now = new Date();
  const startOfTodayUtc = new Date(now);
  startOfTodayUtc.setUTCHours(0, 0, 0, 0);
  const startOfYesterdayUtc = new Date(startOfTodayUtc.getTime() - 24 * 60 * 60 * 1000);

  // Pega usuários que treinaram ONTEM e NÃO treinaram hoje, com streak ≥ 3.
  // O streak = nº de dias consecutivos com pelo menos 1 sessão COMPLETED.
  // Implementação pragmática: olha últimos 30 dias, conta dias consecutivos
  // de trás pra frente. Custo: 1 query por user candidato, ~30ms cada.
  const candidates = await prisma.user.findMany({
    where: {
      isDeleted: false,
      status: "ACTIVE",
      workoutSessions: {
        some: {
          status: "COMPLETED",
          endedAt: { gte: startOfYesterdayUtc, lt: startOfTodayUtc }
        },
        // NÃO treinou hoje
        none: {
          status: "COMPLETED",
          endedAt: { gte: startOfTodayUtc }
        }
      }
    },
    select: { id: true }
  });

  let notified = 0;

  for (const u of candidates) {
    // Já avisamos hoje? (idempotente — cron pode rodar várias vezes)
    const alreadyToday = await prisma.notification.findFirst({
      where: {
        userId: u.id,
        type: "STREAK_AT_RISK",
        createdAt: { gte: startOfTodayUtc }
      },
      select: { id: true }
    });
    if (alreadyToday) continue;

    // Compute streak — back 30 dias.
    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId: u.id,
        status: "COMPLETED",
        endedAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }
      },
      select: { endedAt: true },
      orderBy: { endedAt: "desc" }
    });
    const dayKeys = new Set(
      sessions
        .map((s) => s.endedAt?.toISOString().slice(0, 10))
        .filter((k): k is string => Boolean(k))
    );
    let streak = 0;
    const cursor = new Date(startOfYesterdayUtc);
    while (dayKeys.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    if (streak < 3) continue;

    await notifyUser({
      userId: u.id,
      type: "STREAK_AT_RISK",
      title: "Seu streak vai quebrar",
      body: `Você tá com ${streak} dias seguidos de treino. Treina hoje pra manter o ritmo!`,
      metadata: { streak },
      url: "/train"
    }).catch(() => undefined);
    notified += 1;
  }

  return { checked: candidates.length, notified };
}

// ─── Inactive reminder ──────────────────────────────────────────────────
//
// Usuários que não treinam há ≥ 7 dias recebem um "saudades" — mas NÃO
// mais que 1x a cada 7 dias (throttle em lastInactivePushAt). Sem treino
// nunca = também recebe (provavelmente onboarding incompleto).
export async function notifyInactiveUsers(): Promise<{
  checked: number;
  notified: number;
}> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Candidatos: ativos, não deletados, ultima sessão > 7 dias OU sem nenhuma
  // sessão. NÃO precisa join — usa subquery.
  const candidates = await prisma.user.findMany({
    where: {
      isDeleted: false,
      status: "ACTIVE",
      onboardingCompletedAt: { not: null },
      // Não tem nenhuma sessão completed nos últimos 7 dias.
      workoutSessions: {
        none: {
          status: "COMPLETED",
          endedAt: { gte: sevenDaysAgo }
        }
      }
    },
    select: {
      id: true,
      notificationPreferences: {
        select: { lastInactivePushAt: true }
      }
    }
  });

  let notified = 0;

  for (const u of candidates) {
    const lastSent = u.notificationPreferences?.lastInactivePushAt;
    if (lastSent && lastSent.getTime() > sevenDaysAgo.getTime()) continue;

    await notifyUser({
      userId: u.id,
      type: "INACTIVE_REMINDER",
      title: "Tá com saudades?",
      body: "Faz mais de uma semana que você não treina. Que tal um treino rápido hoje?",
      url: "/train"
    }).catch(() => undefined);

    // Marca o throttle independente de push ter chegado — evita spammar
    // mesmo se backend de push falhou e gerou só in-app.
    await prisma.notificationPreferences
      .upsert({
        where: { userId: u.id },
        update: { lastInactivePushAt: now },
        create: { userId: u.id, lastInactivePushAt: now }
      })
      .catch(() => undefined);

    notified += 1;
  }

  return { checked: candidates.length, notified };
}

// ─── Weekly recap ───────────────────────────────────────────────────────
//
// Toda manhã de domingo manda resumo da semana pra quem teve pelo menos
// 1 treino. Window = última segunda 00:00 UTC → próximo domingo 00:00
// UTC. Idempotente por semana: checa Notification existente do tipo
// WEEKLY_RECAP criada nos últimos 7 dias.
export async function notifyWeeklyRecap(): Promise<{
  users: number;
  notified: number;
}> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Janela da última semana (segunda 00:00 → domingo 24:00 UTC). Pra
  // simplificar usamos "últimos 7 dias" como aproximação — em escala
  // não muda quase nada, e evita complicação com timezone.
  const weekStart = sevenDaysAgo;

  const candidates = await prisma.user.findMany({
    where: {
      isDeleted: false,
      status: "ACTIVE",
      workoutSessions: {
        some: {
          status: "COMPLETED",
          endedAt: { gte: weekStart }
        }
      }
    },
    select: { id: true }
  });

  let notified = 0;

  for (const u of candidates) {
    const recent = await prisma.notification.findFirst({
      where: {
        userId: u.id,
        type: "WEEKLY_RECAP",
        createdAt: { gte: sevenDaysAgo }
      },
      select: { id: true }
    });
    if (recent) continue;

    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId: u.id,
        status: "COMPLETED",
        endedAt: { gte: weekStart }
      },
      select: { durationSec: true }
    });
    const count = sessions.length;
    const totalMin = Math.round(
      sessions.reduce((s, x) => s + (x.durationSec ?? 0), 0) / 60
    );

    const body =
      count >= 5
        ? `Você fez ${count} treinos essa semana, ${totalMin} min no total. Tá voando 🚀`
        : count >= 3
          ? `Você fez ${count} treinos essa semana, ${totalMin} min no total. Mantendo o ritmo!`
          : `Você fez ${count} treino${count > 1 ? "s" : ""} essa semana, ${totalMin} min. Bora subir o nível?`;

    await notifyUser({
      userId: u.id,
      type: "WEEKLY_RECAP",
      title: "Sua semana em treino",
      body,
      metadata: { sessions: count, totalMin },
      url: "/progress"
    }).catch(() => undefined);

    notified += 1;
  }

  return { users: candidates.length, notified };
}

// ─── Anniversary ────────────────────────────────────────────────────────
//
// Quando completa N anos de cadastro, manda parabéns + resumo simples.
// Atualmente checa só "1 ano completo" (createdAt ≈ 1 ano atrás), mas
// fácil estender pra 2, 3, etc. Throttle anual em lastAnniversaryPushAt
// (se já mandamos esse ano, pula).
export async function notifyAnniversaries(): Promise<{
  checked: number;
  notified: number;
}> {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setUTCFullYear(oneYearAgo.getUTCFullYear() - 1);
  // Janela de 7 dias antes do aniversário até 1 dia depois — flexibilidade
  // pra capturar usuários que estejam "perto" do dia certo.
  const windowStart = new Date(oneYearAgo.getTime() - 7 * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(oneYearAgo.getTime() + 24 * 60 * 60 * 1000);

  const candidates = await prisma.user.findMany({
    where: {
      isDeleted: false,
      status: "ACTIVE",
      createdAt: { gte: windowStart, lt: windowEnd }
    },
    select: {
      id: true,
      createdAt: true,
      notificationPreferences: {
        select: { lastAnniversaryPushAt: true }
      }
    }
  });

  let notified = 0;
  const elevenMonthsAgo = new Date(now.getTime() - 11 * 30 * 24 * 60 * 60 * 1000);

  for (const u of candidates) {
    // Throttle anual: se já mandamos nos últimos 11 meses, pula. 11 meses
    // (não 12) cobre cron rodando "um dia atrasado" sem perder o ano novo.
    const last = u.notificationPreferences?.lastAnniversaryPushAt;
    if (last && last > elevenMonthsAgo) continue;

    const totalSessions = await prisma.workoutSession.count({
      where: { userId: u.id, status: "COMPLETED" }
    });

    await notifyUser({
      userId: u.id,
      type: "APP_ANNIVERSARY",
      title: "1 ano com a gente! 🎉",
      body:
        totalSessions > 0
          ? `Você completou 1 ano no SerraAthlo, com ${totalSessions} treino${totalSessions > 1 ? "s" : ""} registrados. Vamos pra mais um!`
          : "Você completou 1 ano no SerraAthlo. Bora começar essa nova era?",
      metadata: { totalSessions },
      url: "/progress"
    }).catch(() => undefined);

    await prisma.notificationPreferences
      .upsert({
        where: { userId: u.id },
        update: { lastAnniversaryPushAt: now },
        create: { userId: u.id, lastAnniversaryPushAt: now }
      })
      .catch(() => undefined);

    notified += 1;
  }

  return { checked: candidates.length, notified };
}

// ─── Composite cron entry point ─────────────────────────────────────────
//
// Roda todas as tasks de engagement em sequência. Conveniente pra ter
// um único endpoint /cron/engagement que cobre tudo. Erros individuais
// não param as próximas tasks.
export async function runEngagementCron(): Promise<{
  streakAtRisk: { checked: number; notified: number };
  inactive: { checked: number; notified: number };
  weeklyRecap: { users: number; notified: number };
  anniversary: { checked: number; notified: number };
}> {
  const results = {
    streakAtRisk: { checked: 0, notified: 0 },
    inactive: { checked: 0, notified: 0 },
    weeklyRecap: { users: 0, notified: 0 },
    anniversary: { checked: 0, notified: 0 }
  };

  try {
    results.streakAtRisk = await notifyStreakAtRisk();
  } catch (err) {
    logger.error("[engagement.cron] streakAtRisk failed:", err);
  }

  try {
    results.inactive = await notifyInactiveUsers();
  } catch (err) {
    logger.error("[engagement.cron] inactive failed:", err);
  }

  // Recap só dispara aos domingos (dia 0 da semana, UTC). Se a cron-job.org
  // chamar todo dia, só domingo realmente faz algo — economiza chamadas.
  const isSunday = new Date().getUTCDay() === 0;
  if (isSunday) {
    try {
      results.weeklyRecap = await notifyWeeklyRecap();
    } catch (err) {
      logger.error("[engagement.cron] weeklyRecap failed:", err);
    }
  }

  try {
    results.anniversary = await notifyAnniversaries();
  } catch (err) {
    logger.error("[engagement.cron] anniversary failed:", err);
  }

  return results;
}
