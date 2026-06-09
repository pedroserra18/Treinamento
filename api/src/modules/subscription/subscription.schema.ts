import { z } from "zod";

export const createProInviteBodySchema = z
  .object({
    // Default 30 dias se omitido. null/0 = sem expiração.
    expiresInDays: z.number().int().min(0).max(365).optional(),
    // Pra admin lembrar quem é o destinatário do convite.
    note: z.string().trim().max(200).optional()
  })
  .strict();

export const proInviteTokenParamsSchema = z
  .object({
    token: z.string().trim().min(8).max(40)
  })
  .strict();

export const proInviteIdParamsSchema = z
  .object({
    inviteId: z.string().cuid()
  })
  .strict();

export type CreateProInviteBody = z.infer<typeof createProInviteBodySchema>;
export type ProInviteTokenParams = z.infer<typeof proInviteTokenParamsSchema>;
export type ProInviteIdParams = z.infer<typeof proInviteIdParamsSchema>;
