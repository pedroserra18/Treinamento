import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import {
  cancelScheduledNotificationController,
  getVapidPublicKeyController,
  scheduleNotificationController,
  subscribePushController,
  unsubscribePushController
} from "./push.controller";
import {
  scheduleNotificationBodySchema,
  scheduleParamsSchema,
  subscribePushBodySchema,
  unsubscribePushBodySchema
} from "./push.schema";

const router = Router();

// Pública — frontend bate aqui pra descobrir a chave VAPID que usa pro
// PushManager.subscribe(). Não é segredo (designed to be public per spec).
router.get(
  "/push/vapid-public-key",
  asyncHandler(async (req, res) => getVapidPublicKeyController(req, res))
);

router.post(
  "/push/subscribe",
  requireAuth,
  validateRequest({ body: subscribePushBodySchema }),
  asyncHandler(async (req, res) => subscribePushController(req, res))
);

router.post(
  "/push/unsubscribe",
  requireAuth,
  validateRequest({ body: unsubscribePushBodySchema }),
  asyncHandler(async (req, res) => unsubscribePushController(req, res))
);

router.post(
  "/push/schedule",
  requireAuth,
  validateRequest({ body: scheduleNotificationBodySchema }),
  asyncHandler(async (req, res) => scheduleNotificationController(req, res))
);

router.delete(
  "/push/schedule/:scheduleId",
  requireAuth,
  validateRequest({ params: scheduleParamsSchema }),
  asyncHandler(async (req, res) => cancelScheduledNotificationController(req, res))
);

export default router;
