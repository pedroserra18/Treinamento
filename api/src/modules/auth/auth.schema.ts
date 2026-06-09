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

// PATCH /auth/profile/name — display name, min 2 / max 120 (same shape as
// registration). No verification; the field is purely cosmetic.
export const updateNameBodySchema = z
  .object({ name: z.string().trim().min(2).max(120) })
  .strict();

// PATCH /auth/profile/birthdate — data de nascimento (YYYY-MM-DD ou null).
// Usada para calcular a idade automaticamente no quiz da IA.
export const updateBirthDateBodySchema = z
  .object({
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD)")
      .nullable(),
  })
  .strict();

// PATCH /auth/profile/gender — gênero (campo sex). Salvo a partir do quiz da IA
// pra não reperguntar.
export const updateGenderBodySchema = z
  .object({
    gender: z.enum(["Masculino", "Feminino"]),
  })
  .strict();

// POST /auth/profile/email/request-code — kicks off email change. Code goes
// to the NEW email so we prove ownership before swapping.
export const requestEmailChangeBodySchema = z
  .object({ email: z.string().trim().toLowerCase().email() })
  .strict();

// POST /auth/profile/email/confirm — verifies the code emitted above and
// commits the new email to the user row.
export const confirmEmailChangeBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    verificationCode: z.string().trim().regex(/^\d{6}$/)
  })
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
    // Sempre obrigatório — define todo o tom das recomendações (TMB,
    // sugestões de carga padrão, recommendations cross-feature).
    sex: z.enum(["MALE", "FEMALE", "OTHER"]),
    availableDaysPerWeek: z.number().int().min(1).max(7),
    experienceLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
    primaryGoal: z.enum([
      "STRENGTH",
      "HYPERTROPHY",
      "WEIGHT_LOSS",
      "ENDURANCE",
      "GENERAL_FITNESS"
    ]),
    // YYYY-MM-DD pra evitar timezone gotchas. Backend converte pra Date
    // garantindo meia-noite UTC.
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    // Opcionais — usuário pode pular nessas duas. Sane ranges pra evitar
    // bug de input acidental (220cm seria erro, mas 250cm passa em casos
    // muito raros — limites generosos).
    heightCm: z.number().min(100).max(250).optional(),
    weightKg: z.number().min(25).max(300).optional()
  })
  .strict();

// Patch genérico de perfil — usado pelo Settings → Perfil e pela
// WorkoutRecommendationsPage pra editar campos do perfil sem refazer
// onboarding. Todos opcionais (partial update). NÃO inclui birthDate
// (tem endpoint dedicado) nem campos de autenticação (email/password).
export const profileUpdateBodySchema = z
  .object({
    sex: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
    availableDaysPerWeek: z.number().int().min(1).max(7).optional(),
    heightCm: z.number().min(100).max(250).nullable().optional(),
    weightKg: z.number().min(25).max(300).nullable().optional(),
    experienceLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).nullable().optional(),
    primaryGoal: z.enum([
      "STRENGTH",
      "HYPERTROPHY",
      "WEIGHT_LOSS",
      "ENDURANCE",
      "GENERAL_FITNESS"
    ]).nullable().optional()
  })
  .strict();

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type RegisterRequestCodeBody = z.infer<typeof registerRequestCodeBodySchema>;
export type RegisterVerifyCodeBody = z.infer<typeof registerVerifyCodeBodySchema>;
export type UpdateHandleBody = z.infer<typeof updateHandleBodySchema>;
export type DeleteProfileBody = z.infer<typeof deleteProfileBodySchema>;
export type UpdateNameBody = z.infer<typeof updateNameBodySchema>;
export type UpdateBirthDateBody = z.infer<typeof updateBirthDateBodySchema>;
export type UpdateGenderBody = z.infer<typeof updateGenderBodySchema>;
export type RequestEmailChangeBody = z.infer<typeof requestEmailChangeBodySchema>;
export type ConfirmEmailChangeBody = z.infer<typeof confirmEmailChangeBodySchema>;
export type ForgotPasswordRequestCodeBody = z.infer<typeof forgotPasswordRequestCodeBodySchema>;
export type ForgotPasswordConfirmBody = z.infer<typeof forgotPasswordConfirmBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
export type GoogleCallbackQuery = z.infer<typeof googleCallbackQuerySchema>;
export type GoogleLinkBody = z.infer<typeof googleLinkBodySchema>;
export type OnboardingCompleteBody = z.infer<typeof onboardingCompleteBodySchema>;
export type ProfileUpdateBody = z.infer<typeof profileUpdateBodySchema>;
