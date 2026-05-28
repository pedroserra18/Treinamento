import { z } from "zod";

export const competitionParamsSchema = z
  .object({ competitionId: z.string().cuid() })
  .strict();

export const createCompetitionBodySchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    type: z.enum(["TRAINING", "CARDIO", "BOTH"]),
    durationDays: z.union([z.literal(30), z.literal(60), z.literal(90)])
  })
  .strict();

export const inviteMemberBodySchema = z
  .object({
    // Either invite a specific friend (in-app notification) or generate a
    // link-only invite (invitedUserId omitted) for external sharing.
    invitedUserId: z.string().cuid().optional()
  })
  .strict();

export const inviteTokenParamsSchema = z
  .object({ token: z.string().min(8).max(64) })
  .strict();

export const postEntryBodySchema = z
  .object({
    kind: z.enum(["TRAINING", "CARDIO"]),
    // Pre-uploaded by the client via /uploads/competition-photo. Sending
    // the raw data here would make the entry endpoint pay the upload cost
    // synchronously which would slow the workout completion flow.
    photoUrl: z.string().url(),
    photoPath: z.string().min(1).max(500).optional(),
    // SHA-256 of the photo bytes. Used to ensure each day's proof is a
    // fresh photo (not a copy of yesterday's).
    photoHash: z.string().regex(/^[a-f0-9]{64}$/i),
    workoutSessionId: z.string().cuid().optional()
  })
  .strict();

export type CompetitionParams = z.infer<typeof competitionParamsSchema>;
export type CreateCompetitionBody = z.infer<typeof createCompetitionBodySchema>;
export type InviteMemberBody = z.infer<typeof inviteMemberBodySchema>;
export type InviteTokenParams = z.infer<typeof inviteTokenParamsSchema>;
export type PostEntryBody = z.infer<typeof postEntryBodySchema>;
