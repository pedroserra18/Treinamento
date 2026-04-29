import { z } from "zod";

export const createPostSchema = z.object({
  workoutSessionId: z.string().optional(),
  caption: z.string().max(500).optional(),
  photoUrl: z.string().url().optional(),
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

export type CreatePostBody = z.infer<typeof createPostSchema>;
export type UpdatePostPrivacyBody = z.infer<typeof updatePostPrivacySchema>;
export type FeedQuery = z.infer<typeof feedQuerySchema>;
export type UserPostsQuery = z.infer<typeof userPostsQuerySchema>;
export type SearchUsersQuery = z.infer<typeof searchUsersSchema>;
