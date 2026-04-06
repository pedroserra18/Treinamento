import { z } from "zod";

const isoDateSchema = z
  .string()
  .datetime()
  .transform((value) => new Date(value));

export const startWorkoutBodySchema = z
  .object({
    workoutPlanId: z.string().cuid().optional(),
    scheduledAt: isoDateSchema.optional(),
    notes: z.string().trim().min(1).max(500).optional()
  })
  .strict();

export const completeWorkoutParamsSchema = z
  .object({
    sessionId: z.string().cuid()
  })
  .strict();

const historyEntryBodySchema = z
  .object({
    exerciseId: z.string().cuid(),
    setNumber: z.number().int().min(1).max(30),
    reps: z.number().int().min(1).max(200).optional(),
    weightKg: z.number().min(0).max(1000).optional(),
    durationSec: z.number().int().min(5).max(4 * 60 * 60).optional(),
    distanceMeters: z.number().min(0).max(100000).optional(),
    perceivedExertion: z.number().int().min(1).max(10).optional(),
    notes: z.string().trim().min(1).max(300).optional()
  })
  .strict();

export const completeWorkoutBodySchema = z
  .object({
    durationSec: z.number().int().min(60).max(8 * 60 * 60).optional(),
    caloriesBurned: z.number().int().min(0).max(5000).optional(),
    notes: z.string().trim().min(1).max(800).optional(),
    exercises: z.array(historyEntryBodySchema).max(150).optional()
  })
  .strict();

export const listWorkoutHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10)
  })
  .strict();

export const exploreWorkoutsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(30).default(12),
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
    difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
    search: z.string().trim().min(1).max(120).optional()
  })
  .strict();

export type StartWorkoutBody = z.infer<typeof startWorkoutBodySchema>;
export type CompleteWorkoutParams = z.infer<typeof completeWorkoutParamsSchema>;
export type CompleteWorkoutBody = z.infer<typeof completeWorkoutBodySchema>;
export type ListWorkoutHistoryQuery = z.infer<typeof listWorkoutHistoryQuerySchema>;
export type ExploreWorkoutsQuery = z.infer<typeof exploreWorkoutsQuerySchema>;
