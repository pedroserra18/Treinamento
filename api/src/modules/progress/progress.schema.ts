import { z } from "zod";

const isoDateSchema = z
  .string()
  .datetime()
  .transform((value) => new Date(value));

export const pinnedExerciseBodySchema = z
  .object({
    exerciseId: z.string().cuid()
  })
  .strict();

export const reorderPinnedExercisesBodySchema = z
  .object({
    orderedExerciseIds: z.array(z.string().cuid()).min(1).max(20)
  })
  .strict();

export const exerciseParamsSchema = z
  .object({
    exerciseId: z.string().cuid()
  })
  .strict();

export const bodyMeasurementParamsSchema = z
  .object({
    measurementId: z.string().trim().min(1).max(128)
  })
  .strict();

export const listBodyMeasurementsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(60).default(20)
  })
  .strict();

function isAcceptedPhotoValue(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return true;
  }

  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(normalized)) {
    return true;
  }

  return false;
}

export const createBodyMeasurementBodySchema = z
  .object({
    date: isoDateSchema,
    photoUrl: z
      .string()
      .trim()
      .max(12_000_000)
      .refine((value) => isAcceptedPhotoValue(value), {
        message: "photoUrl must be a valid http(s) URL or data:image base64"
      }),
    weight: z.number().min(20).max(400),
    chest: z.number().min(10).max(250).optional(),
    shoulders: z.number().min(10).max(250).optional(),
    arms: z.number().min(10).max(100).optional(),
    forearms: z.number().min(10).max(100).optional(),
    waist: z.number().min(20).max(250).optional(),
    hips: z.number().min(20).max(250).optional(),
    thighs: z.number().min(15).max(150).optional(),
    calves: z.number().min(10).max(100).optional(),
    neck: z.number().min(10).max(80).optional(),
    bmi: z.number().min(10).max(80).optional(),
    bodyFatPercentage: z.number().min(1).max(80).optional()
  })
  .strict();

export type PinnedExerciseBody = z.infer<typeof pinnedExerciseBodySchema>;
export type ReorderPinnedExercisesBody = z.infer<typeof reorderPinnedExercisesBodySchema>;
export type ExerciseParams = z.infer<typeof exerciseParamsSchema>;
export type BodyMeasurementParams = z.infer<typeof bodyMeasurementParamsSchema>;
export type ListBodyMeasurementsQuery = z.infer<typeof listBodyMeasurementsQuerySchema>;
export type CreateBodyMeasurementBody = z.infer<typeof createBodyMeasurementBodySchema>;
