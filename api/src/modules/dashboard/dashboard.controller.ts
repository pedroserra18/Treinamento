import { Request, Response } from "express";

export function getDashboardSummaryController(req: Request, res: Response): void {
  res.status(200).json({
    data: {
      welcome: "Dashboard unlocked",
      stats: {
        activePlans: 0,
        pendingSessions: 0
      }
    },
    meta: {
      requestId: req.context.requestId
    }
  });
}
