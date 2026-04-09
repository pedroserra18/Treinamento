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

export const workoutPlanParamsSchema = z
  .object({
    planId: z.string().cuid()
  })
  .strict();

export const planExerciseParamsSchema = z
  .object({
    planId: z.string().cuid(),
    planExerciseId: z.string().cuid()
  })
  .strict();

export const createWorkoutPlanBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().min(1).max(500).optional(),
    source: z.enum(["CUSTOM", "RECOMMENDATION"]).default("CUSTOM"),
    templateKey: z.string().trim().min(2).max(120).optional(),
    daysPerWeek: z.number().int().min(1).max(7).optional()
  })
  .strict();

export const updateWorkoutPlanBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().min(1).max(500).nullable().optional()
  })
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: "name or description is required"
  })
  .strict();

export const addPlanExerciseBodySchema = z
  .object({
    exerciseId: z.string().cuid(),
    sets: z.number().int().min(1).max(12).optional(),
    repsMin: z.number().int().min(1).max(100).optional(),
    repsMax: z.number().int().min(1).max(100).optional(),
    durationSec: z.number().int().min(5).max(4 * 60 * 60).optional(),
    restSec: z.number().int().min(5).max(15 * 60).optional(),
    notes: z.string().trim().min(1).max(300).optional(),
    insertAt: z.number().int().min(1).max(300).optional()
  })
  .strict();

export const updatePlanExerciseBodySchema = z
  .object({
    exerciseId: z.string().cuid().optional(),
    customName: z.string().trim().min(1).max(140).nullable().optional(),
    sets: z.number().int().min(1).max(12).nullable().optional(),
    repsMin: z.number().int().min(1).max(100).nullable().optional(),
    repsMax: z.number().int().min(1).max(100).nullable().optional(),
    durationSec: z.number().int().min(5).max(4 * 60 * 60).nullable().optional(),
    restSec: z.number().int().min(5).max(15 * 60).nullable().optional(),
    notes: z.string().trim().min(1).max(300).nullable().optional(),
    orderIndex: z.number().int().min(1).max(300).optional()
  })
  .strict();

export const reorderPlanExercisesBodySchema = z
  .object({
    orderedExerciseIds: z.array(z.string().cuid()).min(1).max(300)
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

export const searchExercisesQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(120).optional(),
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
    limit: z.coerce.number().int().min(1).max(30).default(10)
  })
  .refine((value) => Boolean(value.q || value.primaryMuscleGroup), {
    message: "q or primaryMuscleGroup is required",
    path: ["q"]
  })
  .strict();

export const recommendationTemplateQuerySchema = z
  .object({
    daysPerWeek: z.coerce.number().int().min(1).max(7),
    sex: z.enum(["MALE", "FEMALE", "OTHER"])
  })
  .strict();

export const historySessionParamsSchema = z
  .object({
    sessionId: z.string().cuid()
  })
  .strict();

export const updateWorkoutDurationBodySchema = z
  .object({
    durationSec: z.number().int().min(60).max(12 * 60 * 60)
  })
  .strict();

export const createManualHistoryBodySchema = z
  .object({
    workoutPlanId: z.string().cuid().optional(),
    title: z.string().trim().min(2).max(120).optional(),
    performedAt: isoDateSchema.optional(),
    durationSec: z.number().int().min(60).max(12 * 60 * 60),
    notes: z.string().trim().min(1).max(500).optional()
  })
  .strict();

export const latestExerciseHistoryBodySchema = z
  .object({
    exerciseIds: z.array(z.string().cuid()).min(1).max(120)
  })
  .strict();

export type StartWorkoutBody = z.infer<typeof startWorkoutBodySchema>;
export type WorkoutPlanParams = z.infer<typeof workoutPlanParamsSchema>;
export type PlanExerciseParams = z.infer<typeof planExerciseParamsSchema>;
export type CreateWorkoutPlanBody = z.infer<typeof createWorkoutPlanBodySchema>;
export type UpdateWorkoutPlanBody = z.infer<typeof updateWorkoutPlanBodySchema>;
export type AddPlanExerciseBody = z.infer<typeof addPlanExerciseBodySchema>;
export type UpdatePlanExerciseBody = z.infer<typeof updatePlanExerciseBodySchema>;
export type ReorderPlanExercisesBody = z.infer<typeof reorderPlanExercisesBodySchema>;
export type CompleteWorkoutParams = z.infer<typeof completeWorkoutParamsSchema>;
export type CompleteWorkoutBody = z.infer<typeof completeWorkoutBodySchema>;
export type ListWorkoutHistoryQuery = z.infer<typeof listWorkoutHistoryQuerySchema>;
export type ExploreWorkoutsQuery = z.infer<typeof exploreWorkoutsQuerySchema>;
export type SearchExercisesQuery = z.infer<typeof searchExercisesQuerySchema>;
export type RecommendationTemplateQuery = z.infer<typeof recommendationTemplateQuerySchema>;
export type HistorySessionParams = z.infer<typeof historySessionParamsSchema>;
export type UpdateWorkoutDurationBody = z.infer<typeof updateWorkoutDurationBodySchema>;
export type CreateManualHistoryBody = z.infer<typeof createManualHistoryBodySchema>;
export type LatestExerciseHistoryBody = z.infer<typeof latestExerciseHistoryBodySchema>;
