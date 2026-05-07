import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireAdminRole } from "../../middlewares/role.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import {
  adminGetTicketController,
  adminListTicketsController,
  adminReplyController,
  adminUpdateStatusController,
  autoCloseController,
  createTemplateController,
  createTicketController,
  deleteTemplateController,
  getMyTicketController,
  listMyTicketsController,
  listTemplatesController,
  updateTemplateController,
  userReplyController,
  userResolveController,
} from "./support.controller";
import {
  adminListQuerySchema,
  adminReplySchema,
  adminUpdateStatusSchema,
  createTicketSchema,
  templateBodySchema,
  templateIdParamsSchema,
  ticketIdParamsSchema,
  userReplySchema,
} from "./support.schema";

const router = Router();

// User endpoints
router.post(
  "/support/tickets",
  requireAuth,
  validateRequest({ body: createTicketSchema }),
  asyncHandler(createTicketController)
);
router.get("/support/tickets", requireAuth, asyncHandler(listMyTicketsController));
router.get(
  "/support/tickets/:ticketId",
  requireAuth,
  validateRequest({ params: ticketIdParamsSchema }),
  asyncHandler(getMyTicketController)
);
router.post(
  "/support/tickets/:ticketId/messages",
  requireAuth,
  validateRequest({ params: ticketIdParamsSchema, body: userReplySchema }),
  asyncHandler(userReplyController)
);
router.post(
  "/support/tickets/:ticketId/resolve",
  requireAuth,
  validateRequest({ params: ticketIdParamsSchema }),
  asyncHandler(userResolveController)
);

// Admin endpoints
router.get(
  "/admin/support/tickets",
  requireAuth,
  requireAdminRole,
  validateRequest({ query: adminListQuerySchema }),
  asyncHandler(adminListTicketsController)
);
router.get(
  "/admin/support/tickets/:ticketId",
  requireAuth,
  requireAdminRole,
  validateRequest({ params: ticketIdParamsSchema }),
  asyncHandler(adminGetTicketController)
);
router.post(
  "/admin/support/tickets/:ticketId/messages",
  requireAuth,
  requireAdminRole,
  validateRequest({ params: ticketIdParamsSchema, body: adminReplySchema }),
  asyncHandler(adminReplyController)
);
router.patch(
  "/admin/support/tickets/:ticketId/status",
  requireAuth,
  requireAdminRole,
  validateRequest({ params: ticketIdParamsSchema, body: adminUpdateStatusSchema }),
  asyncHandler(adminUpdateStatusController)
);

// Templates
router.get("/admin/support/templates", requireAuth, requireAdminRole, asyncHandler(listTemplatesController));
router.post(
  "/admin/support/templates",
  requireAuth,
  requireAdminRole,
  validateRequest({ body: templateBodySchema }),
  asyncHandler(createTemplateController)
);
router.patch(
  "/admin/support/templates/:templateId",
  requireAuth,
  requireAdminRole,
  validateRequest({ params: templateIdParamsSchema, body: templateBodySchema }),
  asyncHandler(updateTemplateController)
);
router.delete(
  "/admin/support/templates/:templateId",
  requireAuth,
  requireAdminRole,
  validateRequest({ params: templateIdParamsSchema }),
  asyncHandler(deleteTemplateController)
);

// Auto-close (admin-triggered, can be wired to scheduler)
router.post(
  "/admin/support/auto-close",
  requireAuth,
  requireAdminRole,
  asyncHandler(autoCloseController)
);

export default router;
