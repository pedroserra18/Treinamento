import { Request, Response } from "express";

import { getSecurityMetricsSnapshot } from "../../middlewares/security.middleware";

export function getSecurityMetricsController(req: Request, res: Response): void {
  const metrics = getSecurityMetricsSnapshot();

  res.status(200).json({
    data: metrics,
    meta: {
      requestId: req.context.requestId
    }
  });
}
