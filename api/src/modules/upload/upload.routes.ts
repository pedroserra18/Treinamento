import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import {
  uploadCompetitionPhotoController,
  uploadExercisePhotoController
} from "./upload.controller";

const router = Router();

router.post(
  "/uploads/competition-photo",
  requireAuth,
  asyncHandler(async (req, res) => uploadCompetitionPhotoController(req, res))
);

router.post(
  "/uploads/exercise-photo",
  requireAuth,
  asyncHandler(async (req, res) => uploadExercisePhotoController(req, res))
);

export default router;
