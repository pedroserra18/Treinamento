import { Router } from "express";
import { asyncHandler } from "../../shared/utils/async-handler";
import { requireAuth, optionalAuth } from "../../middlewares/auth.middleware";
import { validateRequest as validate } from "../../middlewares/validation.middleware";
import {
  createPostSchema, feedQuerySchema, userPostsQuerySchema, searchUsersSchema, updatePostPrivacySchema,
  createCommentSchema, commentsQuerySchema, createAndSharePlanSchema,
} from "./social.schema";
import {
  createPostController, deletePostController, updatePostPrivacyController, toggleLikeController,
  getFeedController, getUserPostsController, followController,
  unfollowController, getFollowersController, getFollowingController,
  searchUsersController, getPublicProfileController,
  getPublicFollowersController, getPublicFollowingController, getMutualFollowersController,
  sharePlanController, createAndSharePlanController, getSharedPlanController, saveSharedPlanController,
  compareUsersController, compareExerciseController,
  listCommentsController, createCommentController, deleteCommentController,
} from "./social.controller";

const router = Router();

// Feed
router.get("/feed", requireAuth, validate({ query: feedQuerySchema }), asyncHandler(getFeedController));

// Posts
router.post("/posts", requireAuth, validate({ body: createPostSchema }), asyncHandler(createPostController));
router.delete("/posts/:postId", requireAuth, asyncHandler(deletePostController));
router.patch("/posts/:postId/privacy", requireAuth, validate({ body: updatePostPrivacySchema }), asyncHandler(updatePostPrivacyController));
router.post("/posts/:postId/like", requireAuth, asyncHandler(toggleLikeController));

// Comments
router.get("/posts/:postId/comments", requireAuth, validate({ query: commentsQuerySchema }), asyncHandler(listCommentsController));
router.post("/posts/:postId/comments", requireAuth, validate({ body: createCommentSchema }), asyncHandler(createCommentController));
router.delete("/posts/:postId/comments/:commentId", requireAuth, asyncHandler(deleteCommentController));

// User posts (public profile posts)
router.get("/users/:userId/posts", optionalAuth, validate({ query: userPostsQuerySchema }), asyncHandler(getUserPostsController));

// Public profile
router.get("/users/:userId/profile", optionalAuth, asyncHandler(getPublicProfileController));

// Follow
router.post("/users/:userId/follow", requireAuth, asyncHandler(followController));
router.delete("/users/:userId/follow", requireAuth, asyncHandler(unfollowController));
router.get("/followers", requireAuth, asyncHandler(getFollowersController));
router.get("/following", requireAuth, asyncHandler(getFollowingController));

// Search
router.get("/users/search", requireAuth, validate({ query: searchUsersSchema }), asyncHandler(searchUsersController));

// Public followers/following lists
router.get("/users/:userId/followers", optionalAuth, asyncHandler(getPublicFollowersController));
router.get("/users/:userId/following", optionalAuth, asyncHandler(getPublicFollowingController));

// Mutual followers
router.get("/users/:userId/mutual", requireAuth, asyncHandler(getMutualFollowersController));

// Compare
router.get("/users/:userId/compare", requireAuth, asyncHandler(compareUsersController));
router.get("/users/:userId/compare-exercise", requireAuth, asyncHandler(compareExerciseController));

// Share plan
router.post("/plans/share-new", requireAuth, validate({ body: createAndSharePlanSchema }), asyncHandler(createAndSharePlanController));
router.post("/plans/:planId/share", requireAuth, asyncHandler(sharePlanController));
router.get("/shared/:token", asyncHandler(getSharedPlanController));
router.post("/shared/:token/save", requireAuth, asyncHandler(saveSharedPlanController));

export { router as socialRouter };
