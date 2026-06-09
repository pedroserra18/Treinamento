import { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../../shared/errors/app-error";
import {
  getNotificationPreferences,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences
} from "./notification.service";

export async function listNotificationsController(req: Request, res: Response) {
  const userId = req.context.userId!;
  const data = await listMyNotifications(userId);
  res.json({ data });
}

export async function markNotificationReadController(req: Request, res: Response) {
  const userId = req.context.userId!;
  const id = req.params["id"] as string;
  await markNotificationRead(userId, id);
  res.status(204).end();
}

export async function markAllNotificationsReadController(req: Request, res: Response) {
  const userId = req.context.userId!;
  await markAllNotificationsRead(userId);
  res.status(204).end();
}

export async function getPreferencesController(req: Request, res: Response) {
  const userId = req.context.userId!;
  const data = await getNotificationPreferences(userId);
  res.json({ data, meta: { requestId: req.context.requestId } });
}

// Schema do PATCH — todos os campos opcionais (parcial). Strict pra
// rejeitar keys desconhecidas e prevenir injection de preferences extras
// que ainda não estão no schema do banco.
const updatePreferencesSchema = z
  .object({
    pushSocial: z.boolean().optional(),
    pushCompetition: z.boolean().optional(),
    pushSupport: z.boolean().optional(),
    pushEngagement: z.boolean().optional()
  })
  .strict();

export async function updatePreferencesController(req: Request, res: Response) {
  const userId = req.context.userId!;
  const parsed = updatePreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("Payload inválido", {
      statusCode: 400,
      code: "INVALID_PAYLOAD",
      details: parsed.error.flatten()
    });
  }
  const data = await updateNotificationPreferences(userId, parsed.data);
  res.json({ data, meta: { requestId: req.context.requestId } });
}
