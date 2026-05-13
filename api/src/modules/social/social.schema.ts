import { z } from "zod";

function isAcceptedPhotoValue(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (/^https?:\/\//i.test(normalized)) return true;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(normalized)) return true;
  return false;
}

export const createPostSchema = z.object({
  workoutSessionId: z.string().optional(),
  caption: z.string().max(500).optional(),
  photoUrl: z
    .string()
    .trim()
    .max(5_000_000)
    .refine(isAcceptedPhotoValue, {
      message: "photoUrl must be a valid http(s) URL or data:image base64",
    })
    .optional(),
  privacy: z.enum(["PUBLIC", "FRIENDS", "PRIVATE"]).default("PUBLIC"),
});

export const updatePostPrivacySchema = z.object({
  privacy: z.enum(["PUBLIC", "FRIENDS", "PRIVATE"]),
});

export const feedQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

export const userPostsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

export const searchUsersSchema = z.object({
  q: z.string().min(1).max(100),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

// Comments. Listing pages 20 at a time to match the feed's feel; content matches
// the column limit (500) so we fail fast on the schema rather than at the DB.
export const createCommentSchema = z.object({
  content: z.string().trim().min(1, "Comentário vazio").max(500, "Máximo 500 caracteres"),
});

export const commentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

export type CreatePostBody = z.infer<typeof createPostSchema>;
export type UpdatePostPrivacyBody = z.infer<typeof updatePostPrivacySchema>;
export type FeedQuery = z.infer<typeof feedQuerySchema>;
export type UserPostsQuery = z.infer<typeof userPostsQuerySchema>;
export type SearchUsersQuery = z.infer<typeof searchUsersSchema>;
export type CreateCommentBody = z.infer<typeof createCommentSchema>;
export type CommentsQuery = z.infer<typeof commentsQuerySchema>;
