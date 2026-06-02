import { z } from "zod";

const scopeSchema = z.enum(["GLOBAL", "PRIVATE"]);
const muscleGroupSchema = z.enum([
  "CHEST",
  "BACK",
  "SHOULDERS",
  "ARMS",
  "BICEPS",
  "TRICEPS",
  "CORE",
  "LEGS",
  "QUADS",
  "HAMSTRINGS",
  "ADDUCTORS",
  "GLUTES",
  "CALVES",
  "ABDOMEN",
  "FOREARM",
  "FULL_BODY"
]);

export const listExercisesQuerySchema = z
  .object({
    scope: scopeSchema.optional(),
    difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
    primaryMuscleGroup: muscleGroupSchema.optional(),
    equipment: z.string().trim().min(1).max(80).optional(),
    search: z.string().trim().min(1).max(120).optional()
  })
  .strict();

export const exerciseParamsSchema = z
  .object({
    exerciseId: z.string().cuid()
  })
  .strict();

export const updateExerciseBodySchema = z
  .object({
    secondaryMuscleGroup: z
      .union([muscleGroupSchema, z.null(), z.literal(""), z.literal("null"), z.literal("NULL")])
      .transform((value) => {
        if (value === null || value === "" || value === "null" || value === "NULL") {
          return null;
        }

        return value;
      })
  })
  .strict();

// Schema do POST /exercises — usuários comuns criam exercícios PRIVATE
// próprios. O service força scope=PRIVATE e ownerUserId=req.user.id, então
// não aceitamos esses dois aqui no body (evita user mal-intencionado tentar
// criar exercício GLOBAL ou em nome de outro usuário).
export const createExerciseBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    equipment: z.string().trim().min(1).max(80),
    primaryMuscleGroup: muscleGroupSchema,
    secondaryMuscleGroup: muscleGroupSchema.nullable().optional(),
    difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).default("INTERMEDIATE"),
    trackingType: z.enum(["REPS", "TIME", "DISTANCE", "REPS_AND_TIME"]).default("REPS"),
    isBodyweight: z.boolean().default(false),
    allowsExtraLoad: z.boolean().default(false),
    isCompound: z.boolean().default(false),
    instructions: z.string().trim().max(2000).nullable().optional(),
    // Pre-uploaded thumbnail (passou pelo /uploads/exercise-photo).
    thumbnailUrl: z.string().url().nullable().optional()
  })
  .strict();

export type ListExercisesQuery = z.infer<typeof listExercisesQuerySchema>;
export type ExerciseParams = z.infer<typeof exerciseParamsSchema>;
export type UpdateExerciseBody = z.infer<typeof updateExerciseBodySchema>;
export type CreateExerciseBody = z.infer<typeof createExerciseBodySchema>;
