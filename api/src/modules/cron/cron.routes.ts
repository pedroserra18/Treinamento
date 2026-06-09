import { Router } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { logger } from "../../config/logger";
import { notifyCompetitionsEndingSoon, runCompetitionReconcile } from "../competition/competition.service";
import { processDuePendingNotifications, pruneOldScheduledNotifications } from "../push/push.service";
import { runEngagementCron } from "../engagement/engagement.service";
import { requireCronSecret } from "./cron.middleware";

const router = Router();

// POST /cron/competition-reconcile — cancels expired lobbies and
// finalises ACTIVE rooms past endsAt. Designed to be called every
// 5 minutes from Vercel Cron (or any external scheduler). Idempotent:
// re-running it within the same 5min window is a no-op since both
// queries filter by status + timestamp.
//
// Vercel Cron config snippet (vercel.json):
//   {
//     "crons": [
//       { "path": "/api/v1/cron/competition-reconcile", "schedule": "*/5 * * * *" }
//     ]
//   }
//
// And set CRON_SECRET in the Vercel project env. Vercel automatically
// adds Authorization: Bearer <CRON_SECRET> to every cron call.
router.post(
  "/cron/competition-reconcile",
  requireCronSecret,
  asyncHandler(async (req, res) => {
    const startedAt = Date.now();
    const result = await runCompetitionReconcile();
    const durationMs = Date.now() - startedAt;
    logger.info("cron_competition_reconcile_done", {
      requestId: req.context?.requestId,
      ...result,
      durationMs
    });
    res.status(200).json({
      data: { ...result, durationMs },
      meta: { requestId: req.context?.requestId }
    });
  })
);

// POST /cron/process-push — safety net. O worker in-process já processa
// jobs a cada 1s enquanto a API está acordada, mas Render free tier
// dorme após 15min idle e o setInterval para junto. Esse endpoint pode
// ser pingado por cron-job.org a cada 1-2 minutos pra:
//   1. Manter o processo quente (efeito colateral do request HTTP).
//   2. Processar qualquer backlog de jobs vencidos enquanto dormíamos.
// Idempotente — só pega jobs PENDING vencidos.
router.post(
  "/cron/process-push",
  requireCronSecret,
  asyncHandler(async (req, res) => {
    const startedAt = Date.now();
    const result = await processDuePendingNotifications();
    const durationMs = Date.now() - startedAt;
    logger.info("cron_process_push_done", {
      requestId: req.context?.requestId,
      ...result,
      durationMs
    });
    res.status(200).json({
      data: { ...result, durationMs },
      meta: { requestId: req.context?.requestId }
    });
  })
);

// POST /cron/prune-push — limpa jobs antigos (SENT/FAILED/CANCELLED >
// 7 dias). Pode ser agendado diariamente. Não é crítico — só impede a
// tabela de crescer infinitamente.
router.post(
  "/cron/prune-push",
  requireCronSecret,
  asyncHandler(async (req, res) => {
    const startedAt = Date.now();
    const deleted = await pruneOldScheduledNotifications();
    const durationMs = Date.now() - startedAt;
    logger.info("cron_prune_push_done", {
      requestId: req.context?.requestId,
      deleted,
      durationMs
    });
    res.status(200).json({
      data: { deleted, durationMs },
      meta: { requestId: req.context?.requestId }
    });
  })
);

// POST /cron/competitions-ending-soon — checa competições ACTIVE que
// vão acabar nas próximas 2h e dispara push pros membros que ainda
// não foram avisados. Idempotente (skip de quem já tem notification do
// tipo). Agende a cada 30-60 min via cron-job.org.
router.post(
  "/cron/competitions-ending-soon",
  requireCronSecret,
  asyncHandler(async (req, res) => {
    const startedAt = Date.now();
    const result = await notifyCompetitionsEndingSoon();
    const durationMs = Date.now() - startedAt;
    logger.info("cron_competitions_ending_soon_done", {
      requestId: req.context?.requestId,
      ...result,
      durationMs
    });
    res.status(200).json({
      data: { ...result, durationMs },
      meta: { requestId: req.context?.requestId }
    });
  })
);

// POST /cron/engagement — composto: streak-at-risk + inactive + weekly-recap
// (só dom) + anniversary. Roda 1-2x por dia (idealmente de manhã, ~9h local
// do user). Throttles internos garantem idempotência se chamar várias vezes.
router.post(
  "/cron/engagement",
  requireCronSecret,
  asyncHandler(async (req, res) => {
    const startedAt = Date.now();
    const result = await runEngagementCron();
    const durationMs = Date.now() - startedAt;
    logger.info("cron_engagement_done", {
      requestId: req.context?.requestId,
      ...result,
      durationMs
    });
    res.status(200).json({
      data: { ...result, durationMs },
      meta: { requestId: req.context?.requestId }
    });
  })
);

export default router;
