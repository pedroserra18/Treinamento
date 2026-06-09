import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import {
  getPreferencesController,
  listNotificationsController,
  markAllNotificationsReadController,
  markNotificationReadController,
  updatePreferencesController
} from "./notification.controller";

const router = Router();

router.get("/", requireAuth, asyncHandler(listNotificationsController));

// Granular push toggles — usado pelo NotificationsPanel das Configurações.
// Registrado antes das rotas dinâmicas pra ordem ficar clara mesmo que
// Express normalmente case multi-segment com prefixo antes de single-param.
router.get("/preferences", requireAuth, asyncHandler(getPreferencesController));
router.patch("/preferences", requireAuth, asyncHandler(updatePreferencesController));

router.patch("/:id/read", requireAuth, asyncHandler(markNotificationReadController));
router.post("/read-all", requireAuth, asyncHandler(markAllNotificationsReadController));

export { router as notificationRouter };
