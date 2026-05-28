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

export type CompetitionParams = z.infer<typeof competitionParamsSchema>;
export type CreateCompetitionBody = z.infer<typeof createCompetitionBodySchema>;
export type InviteMemberBody = z.infer<typeof inviteMemberBodySchema>;
export type InviteTokenParams = z.infer<typeof inviteTokenParamsSchema>;
