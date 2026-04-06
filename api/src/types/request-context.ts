export type UserRole = "USER" | "COACH" | "ADMIN";

export type RequestContext = {
  requestId: string;
  userId?: string;
  userRole: UserRole;
};
