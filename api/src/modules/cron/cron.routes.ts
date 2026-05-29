import { Router } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { logger } from "../../config/logger";
import { runCompetitionReconcile } from "../competition/competition.service";
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

export default router;
