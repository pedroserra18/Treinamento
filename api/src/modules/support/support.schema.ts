import { z } from "zod";

const TICKET_TOPICS = ["ACCOUNT", "POST_REMOVED", "LOGIN", "BUG", "OTHER"] as const;
const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "AWAITING_USER", "RESOLVED", "CLOSED"] as const;

const MAX_BODY_LENGTH = 2000;
const MAX_SUBJECT_LENGTH = 120;
const MAX_ATTACHMENTS = 3;

function isAcceptedAttachment(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (/^https?:\/\//i.test(normalized)) return true;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(normalized)) return true;
  return false;
}

const attachmentArraySchema = z
  .array(
    z
      .string()
      .trim()
      .max(5_000_000)
      .refine(isAcceptedAttachment, { message: "Anexo deve ser uma URL http(s) ou data:image base64" })
  )
  .max(MAX_ATTACHMENTS, { message: `Máximo de ${MAX_ATTACHMENTS} anexos por mensagem` })
  .optional();

export const createTicketSchema = z
  .object({
    topic: z.enum(TICKET_TOPICS),
    subject: z.string().trim().min(3).max(MAX_SUBJECT_LENGTH),
    body: z.string().trim().min(5).max(MAX_BODY_LENGTH),
    attachments: attachmentArraySchema,
  })
  .strict();

export const ticketIdParamsSchema = z
  .object({ ticketId: z.string().min(1) })
  .strict();

export const userReplySchema = z
  .object({
    body: z.string().trim().min(1).max(MAX_BODY_LENGTH),
    attachments: attachmentArraySchema,
  })
  .strict();

export const adminReplySchema = z
  .object({
    body: z.string().trim().min(1).max(MAX_BODY_LENGTH),
    attachments: attachmentArraySchema,
    isInternalNote: z.boolean().default(false),
    nextStatus: z.enum(["IN_PROGRESS", "AWAITING_USER", "RESOLVED", "CLOSED"]).optional(),
  })
  .strict();

export const adminUpdateStatusSchema = z
  .object({
    status: z.enum(["OPEN", "IN_PROGRESS", "AWAITING_USER", "RESOLVED", "CLOSED"]),
  })
  .strict();

export const adminListQuerySchema = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export const templateBodySchema = z
  .object({
    title: z.string().trim().min(2).max(100),
    body: z.string().trim().min(2).max(MAX_BODY_LENGTH),
  })
  .strict();

export const templateIdParamsSchema = z
  .object({ templateId: z.string().min(1) })
  .strict();

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UserReplyInput = z.infer<typeof userReplySchema>;
export type AdminReplyInput = z.infer<typeof adminReplySchema>;
export type AdminUpdateStatusInput = z.infer<typeof adminUpdateStatusSchema>;
export type AdminListQuery = z.infer<typeof adminListQuerySchema>;
export type TemplateBodyInput = z.infer<typeof templateBodySchema>;

export const SUPPORT_LIMITS = {
  MAX_BODY_LENGTH,
  MAX_SUBJECT_LENGTH,
  MAX_ATTACHMENTS,
  MAX_OPEN_TICKETS_PER_USER: 3,
  TICKET_CREATION_COOLDOWN_MS: 10 * 60 * 1000,
  AUTO_CLOSE_AFTER_DAYS: 7,
};
