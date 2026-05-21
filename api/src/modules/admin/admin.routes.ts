import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import { requireAdminRole } from "../../middlewares/role.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { deactivateUserController, deleteUserController, listUsersController, reactivateUserController } from "./admin.controller";
import {
  deactivateUserParamsSchema,
  deleteUserParamsSchema,
  listUsersQuerySchema,
  reactivateUserParamsSchema
} from "./admin.schema";

const router = Router();

router.get(
  "/admin/users",
  requireAuth,
  requireAdminRole,
  validateRequest({ query: listUsersQuerySchema }),
  asyncHandler(async (req, res) => listUsersController(req, res))
);

router.patch(
  "/admin/users/:userId/deactivate",
  requireAuth,
  requireAdminRole,
  validateRequest({ params: deactivateUserParamsSchema }),
  asyncHandler(async (req, res) => deactivateUserController(req, res))
);

router.patch(
  "/admin/users/:userId/reactivate",
  requireAuth,
  requireAdminRole,
  validateRequest({ params: reactivateUserParamsSchema }),
  asyncHandler(async (req, res) => reactivateUserController(req, res))
);

router.delete(
  "/admin/users/:userId",
  requireAuth,
  requireAdminRole,
  validateRequest({ params: deleteUserParamsSchema }),
  asyncHandler(async (req, res) => deleteUserController(req, res))
);

export default router;
