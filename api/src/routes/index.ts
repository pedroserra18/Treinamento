import authRoutes from "../modules/auth/auth.routes";
import adminRoutes from "../modules/admin/admin.routes";
import healthRoutes from "../modules/health/health.routes";
import workoutRoutes from "../modules/workout/workout.routes";
import exerciseRoutes from "../modules/exercise/exercise.routes";
import progressRoutes from "../modules/progress/progress.routes";
import securityRoutes from "../modules/security/security.routes";
import dashboardRoutes from "../modules/dashboard/dashboard.routes";
import recommendationRoutes from "../modules/recommendation/recommendation.routes";
import aiRoutes from "../modules/ai/ai.routes";
import { socialRouter } from "../modules/social/social.routes";
import { Router } from "express";

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(adminRoutes);
router.use(dashboardRoutes);
router.use(exerciseRoutes);
router.use(progressRoutes);
router.use(recommendationRoutes);
router.use(workoutRoutes);
router.use(aiRoutes);
router.use("/social", socialRouter);
router.use(securityRoutes);

export default router;
