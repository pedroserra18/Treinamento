import { z } from "zod";
import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH, HANDLE_REGEX, isHandleReserved } from "../../shared/utils/handle";

// Reusable zod field for `@handle`. Lowercased on input so users can type
// `Pedro_82` and we store/serve `pedro_82`; format and reserved checks run
// against the lowercased value.
const handleField = z
  .string()
  .trim()
  .toLowerCase()
  .min(HANDLE_MIN_LENGTH, `Mínimo ${HANDLE_MIN_LENGTH} caracteres`)
  .max(HANDLE_MAX_LENGTH, `Máximo ${HANDLE_MAX_LENGTH} caracteres`)
  .regex(HANDLE_REGEX, "Use apenas letras, números, '.', '_' ou '-' — sem começar ou terminar com separador")
  .refine((v) => !isHandleReserved(v), "Handle reservado");

export const registerBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    handle: handleField,
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(128)
  })
  .strict();

export const registerRequestCodeBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email()
  })
  .strict();

export const registerVerifyCodeBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    handle: handleField,
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(128),
    verificationCode: z.string().trim().regex(/^\d{6}$/)
  })
  .strict();

// PATCH /auth/me/handle — change my handle later (e.g. from settings page).
export const updateHandleBodySchema = z
  .object({ handle: handleField })
  .strict();

// DELETE /auth/profile — the body carries the user's current @handle typed
// back as a confirmation token, mirroring the GitHub "delete repository" UX.
// The server also validates it against the row in the DB so a malicious
// client can't skip the check.
export const deleteProfileBodySchema = z
  .object({ confirmHandle: handleField })
  .strict();

export const forgotPasswordRequestCodeBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email()
  })
  .strict();

export const forgotPasswordConfirmBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    verificationCode: z.string().trim().regex(/^\d{6}$/),
    newPassword: z.string().min(8).max(128)
  })
  .strict();

export const loginBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(128)
  })
  .strict();

export const refreshBodySchema = z
  .object({
    refreshToken: z.string().min(16)
  })
  .strict();

export const googleCallbackQuerySchema = z
  .object({
    code: z.string().min(10),
    state: z.string().uuid()
  })
  .strict();

export const googleLinkBodySchema = z
  .object({
    code: z.string().min(10),
    state: z.string().uuid()
  })
  .strict();

export const onboardingCompleteBodySchema = z
  .object({
    sex: z.enum(["MALE", "FEMALE", "OTHER"]),
    availableDaysPerWeek: z.number().int().min(1).max(7)
  })
  .strict();

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type RegisterRequestCodeBody = z.infer<typeof registerRequestCodeBodySchema>;
export type RegisterVerifyCodeBody = z.infer<typeof registerVerifyCodeBodySchema>;
export type UpdateHandleBody = z.infer<typeof updateHandleBodySchema>;
export type DeleteProfileBody = z.infer<typeof deleteProfileBodySchema>;
export type ForgotPasswordRequestCodeBody = z.infer<typeof forgotPasswordRequestCodeBodySchema>;
export type ForgotPasswordConfirmBody = z.infer<typeof forgotPasswordConfirmBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
export type GoogleCallbackQuery = z.infer<typeof googleCallbackQuerySchema>;
export type GoogleLinkBody = z.infer<typeof googleLinkBodySchema>;
export type OnboardingCompleteBody = z.infer<typeof onboardingCompleteBodySchema>;
