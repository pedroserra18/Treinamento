import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import {
  listNotificationsController,
  markAllNotificationsReadController,
  markNotificationReadController,
} from "./notification.controller";

const router = Router();

router.get("/", requireAuth, asyncHandler(listNotificationsController));
router.patch("/:id/read", requireAuth, asyncHandler(markNotificationReadController));
router.post("/read-all", requireAuth, asyncHandler(markAllNotificationsReadController));

export { router as notificationRouter };
