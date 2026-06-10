import { z } from "zod";

export const listUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    includeTest: z.coerce.boolean().default(false),
    accountScope: z.enum(["REAL", "TEST", "ALL"]).optional(),
    // Mantido por retrocompatibilidade; sortBy/sortOrder têm precedência.
    registrationOrder: z.enum(["desc", "asc"]).default("desc"),
    // Ordenação server-side por coluna.
    sortBy: z.enum(["createdAt", "lastLoginAt", "name", "email", "status", "role"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
    // Busca server-side por nome, e-mail, handle ou ID.
    search: z.string().trim().max(120).optional(),
    // Filtros opcionais.
    role: z.enum(["USER", "COACH", "ADMIN"]).optional(),
    status: z.enum(["ACTIVE", "PENDING", "SUSPENDED", "DISABLED"]).optional(),
    onboarding: z.enum(["completed", "pending"]).optional(),
    // Filtro pelo tier denormalizado em User.plan. ADMIN é mostrado como
    // 'admin' na UI (não cai em FREE nem PRO) — o filtro aqui só atua sobre
    // o campo plan, sem promoção de role.
    plan: z.enum(["FREE", "PRO"]).optional()
  })
  .strict();

export const deactivateUserParamsSchema = z
  .object({
    userId: z.string().cuid()
  })
  .strict();

export const deleteUserParamsSchema = deactivateUserParamsSchema;
export const reactivateUserParamsSchema = deactivateUserParamsSchema;
export const userDetailParamsSchema = deactivateUserParamsSchema;
export const updateRoleParamsSchema = deactivateUserParamsSchema;

export const updateRoleBodySchema = z
  .object({
    role: z.enum(["USER", "COACH", "ADMIN"])
  })
  .strict();

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type DeactivateUserParams = z.infer<typeof deactivateUserParamsSchema>;
export type DeleteUserParams = z.infer<typeof deleteUserParamsSchema>;
export type ReactivateUserParams = z.infer<typeof reactivateUserParamsSchema>;
export type UserDetailParams = z.infer<typeof userDetailParamsSchema>;
export type UpdateRoleParams = z.infer<typeof updateRoleParamsSchema>;
export type UpdateRoleBody = z.infer<typeof updateRoleBodySchema>;
