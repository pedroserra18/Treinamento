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

export type ListExercisesQuery = z.infer<typeof listExercisesQuerySchema>;
export type ExerciseParams = z.infer<typeof exerciseParamsSchema>;
export type UpdateExerciseBody = z.infer<typeof updateExerciseBodySchema>;
