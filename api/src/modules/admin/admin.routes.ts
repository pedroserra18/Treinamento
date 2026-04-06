import { Router } from "express";

import { deactivateUserController, deleteUserController, listUsersController } from "./admin.controller";
import {
  deactivateUserParamsSchema,
  deleteUserParamsSchema,
  listUsersQuerySchema
} from "./admin.schema";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireAdminRole } from "../../middlewares/role.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";

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

router.delete(
  "/admin/users/:userId",
  requireAuth,
  requireAdminRole,
  validateRequest({ params: deleteUserParamsSchema }),
  asyncHandler(async (req, res) => deleteUserController(req, res))
);

export default router;
