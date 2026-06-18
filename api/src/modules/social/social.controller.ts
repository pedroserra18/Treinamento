import { Request, Response } from "express";
import {
  createPost, deletePost, updatePostPrivacy, toggleLike, getFeed, getPostById, getUserPosts,
  reportPost, adminListReports, adminResolveReport,
  followUser, unfollowUser, getFollowers, getFollowing,
  searchUsers, getPublicProfile, getPublicFollowers, getPublicFollowing, getMutualFollowers,
  sharePlan, createAndSharePlan, getSharedPlan, saveSharedPlan, compareUsers, compareExercise,
  adminListRemovedPostsByUser, adminRestorePost,
  listComments, createComment, deleteComment,
} from "./social.service";
import {
  CreatePostBody, FeedQuery, UserPostsQuery, SearchUsersQuery, UpdatePostPrivacyBody,
  CreateCommentBody, CommentsQuery, ReportPostBody, ResolveReportBody,
} from "./social.schema";

export async function createPostController(req: Request, res: Response) {
  const userId = req.context.userId!;
  const post = await createPost(userId, req.body as CreatePostBody);
  res.status(201).json({ data: post });
}

export async function deletePostController(req: Request, res: Response) {
  await deletePost(req.context.userId!, req.params["postId"] as string, req.context.userRole);
  res.status(204).end();
}

export async function updatePostPrivacyController(req: Request, res: Response) {
  const { privacy } = req.body as UpdatePostPrivacyBody;
  const post = await updatePostPrivacy(req.context.userId!, req.params["postId"] as string, privacy);
  res.json({ data: post });
}

export async function toggleLikeController(req: Request, res: Response) {
  const result = await toggleLike(req.context.userId!, req.params["postId"] as string);
  res.json({ data: result });
}

export async function getFeedController(req: Request, res: Response) {
  const { page, pageSize } = req.query as unknown as FeedQuery;
  const posts = await getFeed(req.context.userId!, page, pageSize);
  res.json({ data: posts });
}

export async function getPostController(req: Request, res: Response) {
  const post = await getPostById(req.context.userId!, req.params["postId"] as string);
  res.json({ data: post });
}

export async function getUserPostsController(req: Request, res: Response) {
  const { page, pageSize } = req.query as unknown as UserPostsQuery;
  const posts = await getUserPosts(req.context.userId, req.params["userId"] as string, page, pageSize);
  res.json({ data: posts });
}

export async function followController(req: Request, res: Response) {
  await followUser(req.context.userId!, req.params["userId"] as string);
  res.status(204).end();
}

export async function unfollowController(req: Request, res: Response) {
  await unfollowUser(req.context.userId!, req.params["userId"] as string);
  res.status(204).end();
}

export async function getFollowersController(req: Request, res: Response) {
  const followers = await getFollowers(req.context.userId!);
  res.json({ data: followers });
}

export async function getFollowingController(req: Request, res: Response) {
  const following = await getFollowing(req.context.userId!);
  res.json({ data: following });
}

export async function searchUsersController(req: Request, res: Response) {
  const { q, page, pageSize } = req.query as unknown as SearchUsersQuery;
  const users = await searchUsers(req.context.userId!, q, page, pageSize);
  res.json({ data: users });
}

export async function getPublicProfileController(req: Request, res: Response) {
  const viewerId = req.context?.userId;
  const profile = await getPublicProfile(viewerId, req.params["userId"] as string);
  res.json({ data: profile });
}

export async function getPublicFollowersController(req: Request, res: Response) {
  const viewerId = req.context?.userId;
  const users = await getPublicFollowers(viewerId, req.params["userId"] as string);
  res.json({ data: users });
}

export async function getPublicFollowingController(req: Request, res: Response) {
  const viewerId = req.context?.userId;
  const users = await getPublicFollowing(viewerId, req.params["userId"] as string);
  res.json({ data: users });
}

export async function getMutualFollowersController(req: Request, res: Response) {
  const result = await getMutualFollowers(req.context.userId!, req.params["userId"] as string);
  res.json({ data: result });
}

export async function sharePlanController(req: Request, res: Response) {
  const result = await sharePlan(req.context.userId!, req.params["planId"] as string);
  res.json({ data: result });
}

export async function createAndSharePlanController(req: Request, res: Response) {
  const result = await createAndSharePlan(req.context.userId!, req.body);
  res.status(201).json({ data: result });
}

export async function getSharedPlanController(req: Request, res: Response) {
  const plan = await getSharedPlan(req.params["token"] as string);
  res.json({ data: plan });
}

export async function saveSharedPlanController(req: Request, res: Response) {
  const result = await saveSharedPlan(req.context.userId!, req.params["token"] as string);
  res.status(201).json({ data: result });
}

export async function compareUsersController(req: Request, res: Response) {
  const result = await compareUsers(req.context.userId!, req.params["userId"] as string);
  res.json({ data: result });
}

export async function compareExerciseController(req: Request, res: Response) {
  const { exerciseId } = req.query as { exerciseId: string };
  const result = await compareExercise(req.context.userId!, req.params["userId"] as string, exerciseId);
  res.json({ data: result });
}

export async function adminListRemovedPostsController(req: Request, res: Response) {
  const items = await adminListRemovedPostsByUser(req.params["userId"] as string);
  res.json({ data: { items } });
}

export async function adminRestorePostController(req: Request, res: Response) {
  await adminRestorePost(req.params["postId"] as string);
  res.status(204).end();
}

export async function reportPostController(req: Request, res: Response) {
  const { reason, details } = req.body as ReportPostBody;
  const result = await reportPost(req.context.userId!, req.params["postId"] as string, reason, details);
  res.status(201).json({ data: result });
}

export async function adminListReportsController(_req: Request, res: Response) {
  const items = await adminListReports();
  res.json({ data: { items } });
}

export async function adminResolveReportController(req: Request, res: Response) {
  const { action } = req.body as ResolveReportBody;
  const result = await adminResolveReport(req.context.userId!, req.params["reportId"] as string, action);
  res.json({ data: result });
}

export async function listCommentsController(req: Request, res: Response) {
  const { page, pageSize } = req.query as unknown as CommentsQuery;
  const items = await listComments(req.context.userId!, req.params["postId"] as string, page, pageSize);
  res.json({ data: items });
}

export async function createCommentController(req: Request, res: Response) {
  const { content } = req.body as CreateCommentBody;
  const comment = await createComment(req.context.userId!, req.params["postId"] as string, content);
  res.status(201).json({ data: comment });
}

export async function deleteCommentController(req: Request, res: Response) {
  await deleteComment(
    req.context.userId!,
    req.params["postId"] as string,
    req.params["commentId"] as string,
    req.context.userRole,
  );
  res.status(204).end();
}
