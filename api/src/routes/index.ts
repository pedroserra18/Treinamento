import { Router } from "express";

import authRoutes from "../modules/auth/auth.routes";
import dashboardRoutes from "../modules/dashboard/dashboard.routes";
import exerciseRoutes from "../modules/exercise/exercise.routes";
import healthRoutes from "../modules/health/health.routes";
import securityRoutes from "../modules/security/security.routes";

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(dashboardRoutes);
router.use(exerciseRoutes);
router.use(securityRoutes);

export default router;
