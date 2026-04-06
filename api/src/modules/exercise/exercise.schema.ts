import { z } from "zod";

const scopeSchema = z.enum(["GLOBAL", "PRIVATE"]);

export const listExercisesQuerySchema = z
  .object({
    scope: scopeSchema.optional(),
    difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
    primaryMuscleGroup: z
      .enum([
        "CHEST",
        "BACK",
        "SHOULDERS",
        "ARMS",
        "BICEPS",
        "TRICEPS",
        "CORE",
        "LEGS",
        "GLUTES",
        "CALVES",
        "ABDOMEN",
        "FOREARM",
        "FULL_BODY"
      ])
      .optional(),
    equipment: z.string().trim().min(1).max(80).optional(),
    search: z.string().trim().min(1).max(120).optional()
  })
  .strict();

export const exerciseParamsSchema = z
  .object({
    exerciseId: z.string().cuid()
  })
  .strict();

export type ListExercisesQuery = z.infer<typeof listExercisesQuerySchema>;
export type ExerciseParams = z.infer<typeof exerciseParamsSchema>;
