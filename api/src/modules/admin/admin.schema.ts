import { z } from "zod";

export const listUsersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    includeTest: z.coerce.boolean().default(false),
    accountScope: z.enum(["REAL", "TEST", "ALL"]).optional(),
    registrationOrder: z.enum(["desc", "asc"]).default("desc")
  })
  .strict();

export const deactivateUserParamsSchema = z
  .object({
    userId: z.string().cuid()
  })
  .strict();

export const deleteUserParamsSchema = deactivateUserParamsSchema;

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type DeactivateUserParams = z.infer<typeof deactivateUserParamsSchema>;
export type DeleteUserParams = z.infer<typeof deleteUserParamsSchema>;
