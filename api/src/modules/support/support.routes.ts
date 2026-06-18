import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { requireAdminRole } from "../../middlewares/role.middleware";
import { validateRequest } from "../../middlewares/validation.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import {
  adminGetTicketController,
  adminListTicketsController,
  adminTicketCountsController,
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
  adminListRemovedPostsController,
  adminRestorePostController,
  adminListReportsController,
  adminResolveReportController,
} from "../social/social.controller";
import { resolveReportSchema } from "../social/social.schema";
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
// IMPORTANTE: declarar antes de /tickets/:ticketId, senão "counts" casa como id.
router.get(
  "/admin/support/tickets/counts",
  requireAuth,
  requireAdminRole,
  asyncHandler(adminTicketCountsController)
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

// Denúncias de posts (moderação da comunidade → fila do admin)
router.get(
  "/admin/support/reports",
  requireAuth,
  requireAdminRole,
  asyncHandler(adminListReportsController)
);
router.patch(
  "/admin/support/reports/:reportId/resolve",
  requireAuth,
  requireAdminRole,
  validateRequest({ body: resolveReportSchema }),
  asyncHandler(adminResolveReportController)
);

// Removed posts review (used from support tickets)
router.get(
  "/admin/support/users/:userId/removed-posts",
  requireAuth,
  requireAdminRole,
  asyncHandler(adminListRemovedPostsController)
);
router.post(
  "/admin/support/posts/:postId/restore",
  requireAuth,
  requireAdminRole,
  asyncHandler(adminRestorePostController)
);

export default router;
