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

// "Criar e enviar rotina": o criador monta uma rotina e gera um link, sem que
// a rotina entre nas rotinas dele. O backend cria um template oculto + o
// shared link numa transação. Limites espelham o builder do app.
export const createAndSharePlanSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(120),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string().min(1),
        sets: z.coerce.number().int().min(1).max(20),
        repsMin: z.coerce.number().int().min(1).max(100).optional(),
        repsMax: z.coerce.number().int().min(1).max(100).optional(),
        restSec: z.coerce.number().int().min(0).max(3600).optional(),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .min(1, "Adicione ao menos 1 exercício")
    .max(50),
});

export type CreateAndSharePlanBody = z.infer<typeof createAndSharePlanSchema>;

export type CreatePostBody = z.infer<typeof createPostSchema>;
export type UpdatePostPrivacyBody = z.infer<typeof updatePostPrivacySchema>;
export type FeedQuery = z.infer<typeof feedQuerySchema>;
export type UserPostsQuery = z.infer<typeof userPostsQuerySchema>;
export type SearchUsersQuery = z.infer<typeof searchUsersSchema>;
export type CreateCommentBody = z.infer<typeof createCommentSchema>;
export type CommentsQuery = z.infer<typeof commentsQuerySchema>;
