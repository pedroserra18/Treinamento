import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.middleware";
import { asyncHandler } from "../../shared/utils/async-handler";
import { validateRequest } from "../../middlewares/validation.middleware";
import {
  competitionReadLimiter,
  competitionWriteLimiter
} from "../../middlewares/security.middleware";
import {
  chatParamsSchema,
  competitionParamsSchema,
  createCompetitionBodySchema,
  entryCommentParamsSchema,
  entryParamsSchema,
  inviteMemberBodySchema,
  inviteTokenParamsSchema,
  listChatQuerySchema,
  memberParamsSchema,
  postChatBodySchema,
  postEntryBodySchema,
  postEntryCommentBodySchema,
  reactionBodySchema
} from "./competition.schema";
import {
  acceptInviteController,
  createCompetitionController,
  declineInviteController,
  deleteChatController,
  deleteEntryCommentController,
  deleteEntryController,
  demoteMemberController,
  getActiveCompetitionController,
  getCompetitionController,
  getFeedController,
  getInvitePreviewController,
  getStandingsController,
  inviteMemberController,
  kickMemberController,
  leaveCompetitionController,
  listChatController,
  listEntryCommentsController,
  listInvitableFriendsController,
  listMyCompetitionsController,
  listMyInvitesController,
  postChatController,
  postEntryCommentController,
  postEntryController,
  promoteMemberController,
  startCompetitionController,
  toggleReactionController
} from "./competition.controller";

const router = Router();

// Per-user rate limiters mounted alongside requireAuth on every route so
// one bad actor on a shared IP can't blow through the global IP cap and
// take everyone behind that NAT down with them. Reads get a relaxed cap
// (polling-friendly); writes get a tight cap (anti-spam backstop).

router.post(
  "/competitions",
  requireAuth,
  competitionWriteLimiter,
  validateRequest({ body: createCompetitionBodySchema }),
  asyncHandler(async (req, res) => createCompetitionController(req, res))
);

router.get(
  "/competitions/me",
  requireAuth,
  competitionReadLimiter,
  asyncHandler(async (req, res) => getActiveCompetitionController(req, res))
);

router.get(
  "/competitions/mine",
  requireAuth,
  competitionReadLimiter,
  asyncHandler(async (req, res) => listMyCompetitionsController(req, res))
);

router.get(
  "/competitions/invites",
  requireAuth,
  competitionReadLimiter,
  asyncHandler(async (req, res) => listMyInvitesController(req, res))
);

// Public preview by token — the token itself is the credential. We never
// reveal who's a member from this route, only the high-level info needed
// to render the accept page. Falls back to IP key in the read limiter
// since there's no authenticated user.
router.get(
  "/competitions/invites/:token",
  competitionReadLimiter,
  validateRequest({ params: inviteTokenParamsSchema }),
  asyncHandler(async (req, res) => getInvitePreviewController(req, res))
);

router.post(
  "/competitions/invites/:token/accept",
  requireAuth,
  competitionWriteLimiter,
  validateRequest({ params: inviteTokenParamsSchema }),
  asyncHandler(async (req, res) => acceptInviteController(req, res))
);

router.post(
  "/competitions/invites/:token/decline",
  requireAuth,
  competitionWriteLimiter,
  validateRequest({ params: inviteTokenParamsSchema }),
  asyncHandler(async (req, res) => declineInviteController(req, res))
);

router.get(
  "/competitions/:competitionId",
  requireAuth,
  competitionReadLimiter,
  validateRequest({ params: competitionParamsSchema }),
  asyncHandler(async (req, res) => getCompetitionController(req, res))
);

router.post(
  "/competitions/:competitionId/invite",
  requireAuth,
  competitionWriteLimiter,
  validateRequest({ params: competitionParamsSchema, body: inviteMemberBodySchema }),
  asyncHandler(async (req, res) => inviteMemberController(req, res))
);

router.post(
  "/competitions/:competitionId/entries",
  requireAuth,
  competitionWriteLimiter,
  validateRequest({ params: competitionParamsSchema, body: postEntryBodySchema }),
  asyncHandler(async (req, res) => postEntryController(req, res))
);

router.get(
  "/competitions/:competitionId/standings",
  requireAuth,
  competitionReadLimiter,
  validateRequest({ params: competitionParamsSchema }),
  asyncHandler(async (req, res) => getStandingsController(req, res))
);

router.get(
  "/competitions/:competitionId/feed",
  requireAuth,
  competitionReadLimiter,
  validateRequest({ params: competitionParamsSchema }),
  asyncHandler(async (req, res) => getFeedController(req, res))
);

router.post(
  "/competitions/:competitionId/start",
  requireAuth,
  competitionWriteLimiter,
  validateRequest({ params: competitionParamsSchema }),
  asyncHandler(async (req, res) => startCompetitionController(req, res))
);

router.post(
  "/competitions/:competitionId/entries/:entryId/reactions",
  requireAuth,
  competitionWriteLimiter,
  validateRequest({ params: entryParamsSchema, body: reactionBodySchema }),
  asyncHandler(async (req, res) => toggleReactionController(req, res))
);

router.delete(
  "/competitions/:competitionId/entries/:entryId",
  requireAuth,
  competitionWriteLimiter,
  validateRequest({ params: entryParamsSchema }),
  asyncHandler(async (req, res) => deleteEntryController(req, res))
);

router.get(
  "/competitions/:competitionId/entries/:entryId/comments",
  requireAuth,
  competitionReadLimiter,
  validateRequest({ params: entryParamsSchema }),
  asyncHandler(async (req, res) => listEntryCommentsController(req, res))
);

router.post(
  "/competitions/:competitionId/entries/:entryId/comments",
  requireAuth,
  competitionWriteLimiter,
  validateRequest({ params: entryParamsSchema, body: postEntryCommentBodySchema }),
  asyncHandler(async (req, res) => postEntryCommentController(req, res))
);

router.delete(
  "/competitions/:competitionId/entries/:entryId/comments/:commentId",
  requireAuth,
  competitionWriteLimiter,
  validateRequest({ params: entryCommentParamsSchema }),
  asyncHandler(async (req, res) => deleteEntryCommentController(req, res))
);

router.get(
  "/competitions/:competitionId/chat",
  requireAuth,
  competitionReadLimiter,
  validateRequest({ params: competitionParamsSchema, query: listChatQuerySchema }),
  asyncHandler(async (req, res) => listChatController(req, res))
);

router.post(
  "/competitions/:competitionId/chat",
  requireAuth,
  competitionWriteLimiter,
  validateRequest({ params: competitionParamsSchema, body: postChatBodySchema }),
  asyncHandler(async (req, res) => postChatController(req, res))
);

router.delete(
  "/competitions/:competitionId/chat/:messageId",
  requireAuth,
  competitionWriteLimiter,
  validateRequest({ params: chatParamsSchema }),
  asyncHandler(async (req, res) => deleteChatController(req, res))
);

router.get(
  "/competitions/:competitionId/invitable-friends",
  requireAuth,
  competitionReadLimiter,
  validateRequest({ params: competitionParamsSchema }),
  asyncHandler(async (req, res) => listInvitableFriendsController(req, res))
);

router.post(
  "/competitions/:competitionId/members/:userId/admin",
  requireAuth,
  competitionWriteLimiter,
  validateRequest({ params: memberParamsSchema }),
  asyncHandler(async (req, res) => promoteMemberController(req, res))
);

router.delete(
  "/competitions/:competitionId/members/:userId/admin",
  requireAuth,
  competitionWriteLimiter,
  validateRequest({ params: memberParamsSchema }),
  asyncHandler(async (req, res) => demoteMemberController(req, res))
);

router.delete(
  "/competitions/:competitionId/members/:userId",
  requireAuth,
  competitionWriteLimiter,
  validateRequest({ params: memberParamsSchema }),
  asyncHandler(async (req, res) => kickMemberController(req, res))
);

router.post(
  "/competitions/:competitionId/leave",
  requireAuth,
  competitionWriteLimiter,
  validateRequest({ params: competitionParamsSchema }),
  asyncHandler(async (req, res) => leaveCompetitionController(req, res))
);

export default router;
