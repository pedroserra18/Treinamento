import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { notifyUser } from "../notification/notification.service";

// ─── Comments ─────────────────────────────────────────────────────────────────

const COMMENT_SELECT = {
  id: true,
  content: true,
  createdAt: true,
  user: { select: { id: true, name: true, handle: true, avatarUrl: true } },
};

// Mirrors the feed's visibility rules so users can't read comments on a post
// they wouldn't be able to see in the feed itself.
async function ensureCanViewPost(viewerId: string, postId: string) {
  const post = await prisma.workoutPost.findUnique({
    where: { id: postId },
    select: { id: true, userId: true, privacy: true, removedAt: true, user: { select: { isPrivate: true } } },
  });
  if (!post || post.removedAt) {
    throw new AppError("Post não encontrado", { statusCode: 404, code: "POST_NOT_FOUND" });
  }
  if (post.userId === viewerId) return post;

  const isFollowing = !!(await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: post.userId } },
  }));

  if (post.privacy === "PRIVATE") {
    throw new AppError("Post privado", { statusCode: 403, code: "FORBIDDEN" });
  }
  if (post.privacy === "FRIENDS" && !isFollowing) {
    throw new AppError("Post restrito a amigos", { statusCode: 403, code: "FORBIDDEN" });
  }
  if (post.privacy === "PUBLIC" && post.user.isPrivate && !isFollowing) {
    throw new AppError("Conta privada", { statusCode: 403, code: "FORBIDDEN" });
  }
  return post;
}

export async function listComments(viewerId: string, postId: string, page: number, pageSize: number) {
  await ensureCanViewPost(viewerId, postId);
  return prisma.postComment.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: COMMENT_SELECT,
  });
}

export async function createComment(userId: string, postId: string, content: string) {
  const post = await ensureCanViewPost(userId, postId);
  const created = await prisma.postComment.create({
    data: { postId, userId, content },
    select: COMMENT_SELECT,
  });

  // Notify the post owner (skip self-comments to avoid noise).
  if (post.userId !== userId) {
    const commenter = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, handle: true } });
    const commenterLabel = commenter?.name?.split(" ")[0] || (commenter?.handle ? `@${commenter.handle}` : "Alguém");
    const preview = content.length > 80 ? `${content.slice(0, 77)}...` : content;
    await notifyUser({
      userId: post.userId,
      type: "POST_COMMENT",
      title: `${commenterLabel} comentou no seu post`,
      body: preview,
      metadata: { postId, commentId: created.id },
      url: `/post/${postId}`,
      tag: `comment-${postId}`
    });
  }

  return created;
}

export async function deleteComment(userId: string, postId: string, commentId: string, userRole?: string) {
  const comment = await prisma.postComment.findUnique({
    where: { id: commentId },
    select: { id: true, userId: true, postId: true, post: { select: { userId: true } } },
  });
  if (!comment || comment.postId !== postId) {
    throw new AppError("Comentário não encontrado", { statusCode: 404, code: "COMMENT_NOT_FOUND" });
  }
  const isAuthor = comment.userId === userId;
  const isPostOwner = comment.post.userId === userId;
  const isAdmin = userRole === "ADMIN";
  if (!isAuthor && !isPostOwner && !isAdmin) {
    throw new AppError("Sem permissão", { statusCode: 403, code: "FORBIDDEN" });
  }
  await prisma.postComment.delete({ where: { id: commentId } });
}
