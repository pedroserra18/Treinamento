import { Request, Response } from "express";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
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
