import { Router } from "express";

import adminRoutes from "../modules/admin/admin.routes";
import authRoutes from "../modules/auth/auth.routes";
import dashboardRoutes from "../modules/dashboard/dashboard.routes";
import exerciseRoutes from "../modules/exercise/exercise.routes";
import healthRoutes from "../modules/health/health.routes";
import recommendationRoutes from "../modules/recommendation/recommendation.routes";
import securityRoutes from "../modules/security/security.routes";
import workoutRoutes from "../modules/workout/workout.routes";

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(adminRoutes);
router.use(dashboardRoutes);
router.use(exerciseRoutes);
router.use(recommendationRoutes);
router.use(workoutRoutes);
router.use(securityRoutes);

export default router;
