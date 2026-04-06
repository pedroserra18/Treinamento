import { z } from "zod";

export const registerBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
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
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(128),
    verificationCode: z.string().trim().regex(/^\d{6}$/)
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
export type LoginBody = z.infer<typeof loginBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
export type GoogleCallbackQuery = z.infer<typeof googleCallbackQuerySchema>;
export type GoogleLinkBody = z.infer<typeof googleLinkBodySchema>;
export type OnboardingCompleteBody = z.infer<typeof onboardingCompleteBodySchema>;
