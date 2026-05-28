import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import { uploadCompetitionPhotoController } from "./upload.controller";

const router = Router();

router.post(
  "/uploads/competition-photo",
  requireAuth,
  asyncHandler(async (req, res) => uploadCompetitionPhotoController(req, res))
);

export default router;
