import { Request } from "express";

// Contexto leve do request usado para correlacionar audit logs (EventLog na
// DB) com a requisição que originou a ação. Movido para shared/ porque vários
// módulos (workout, auth, admin, password-recovery) precisam logar eventos
// e duplicar essa estrutura em cada módulo seria desperdício.
export type EventContext = {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
};

export function eventContextFromRequest(req: Request): EventContext {
  return {
    requestId: req.context?.requestId,
    ipAddress: req.ip ?? "unknown",
    userAgent: req.header("user-agent") ?? undefined,
  };
}
