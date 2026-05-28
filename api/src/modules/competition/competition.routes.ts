import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import { validateRequest } from "../../middlewares/validation.middleware";
import {
  competitionParamsSchema,
  createCompetitionBodySchema,
  inviteMemberBodySchema,
  inviteTokenParamsSchema
} from "./competition.schema";
import {
  acceptInviteController,
  createCompetitionController,
  declineInviteController,
  getActiveCompetitionController,
  getCompetitionController,
  getInvitePreviewController,
  inviteMemberController,
  leaveCompetitionController,
  listMyCompetitionsController,
  listMyInvitesController
} from "./competition.controller";

const router = Router();

router.post(
  "/competitions",
  requireAuth,
  validateRequest({ body: createCompetitionBodySchema }),
  asyncHandler(async (req, res) => createCompetitionController(req, res))
);

router.get(
  "/competitions/me",
  requireAuth,
  asyncHandler(async (req, res) => getActiveCompetitionController(req, res))
);

router.get(
  "/competitions/mine",
  requireAuth,
  asyncHandler(async (req, res) => listMyCompetitionsController(req, res))
);

router.get(
  "/competitions/invites",
  requireAuth,
  asyncHandler(async (req, res) => listMyInvitesController(req, res))
);

// Public preview by token — the token itself is the credential. We never
// reveal who's a member from this route, only the high-level info needed
// to render the accept page.
router.get(
  "/competitions/invites/:token",
  validateRequest({ params: inviteTokenParamsSchema }),
  asyncHandler(async (req, res) => getInvitePreviewController(req, res))
);

router.post(
  "/competitions/invites/:token/accept",
  requireAuth,
  validateRequest({ params: inviteTokenParamsSchema }),
  asyncHandler(async (req, res) => acceptInviteController(req, res))
);

router.post(
  "/competitions/invites/:token/decline",
  requireAuth,
  validateRequest({ params: inviteTokenParamsSchema }),
  asyncHandler(async (req, res) => declineInviteController(req, res))
);

router.get(
  "/competitions/:competitionId",
  requireAuth,
  validateRequest({ params: competitionParamsSchema }),
  asyncHandler(async (req, res) => getCompetitionController(req, res))
);

router.post(
  "/competitions/:competitionId/invite",
  requireAuth,
  validateRequest({ params: competitionParamsSchema, body: inviteMemberBodySchema }),
  asyncHandler(async (req, res) => inviteMemberController(req, res))
);

router.post(
  "/competitions/:competitionId/leave",
  requireAuth,
  validateRequest({ params: competitionParamsSchema }),
  asyncHandler(async (req, res) => leaveCompetitionController(req, res))
);

export default router;
