import { Request, Response } from "express";
import {
  cancelScheduledNotification,
  getPublicVapidKey,
  isPushConfigured,
  scheduleNotification,
  subscribeUserToPush,
  unsubscribeUserFromPush
} from "./push.service";
import type {
  ScheduleNotificationBody,
  ScheduleParams,
  SubscribePushBody,
  UnsubscribePushBody
} from "./push.schema";

export async function getVapidPublicKeyController(req: Request, res: Response): Promise<void> {
  const key = getPublicVapidKey();
  res.status(200).json({
    data: {
      publicKey: key,
      configured: isPushConfigured()
    },
    meta: { requestId: req.context.requestId }
  });
}

export async function subscribePushController(req: Request, res: Response): Promise<void> {
  if (!req.context.userId) {
    res.status(401).json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
    return;
  }

  const body = req.body as SubscribePushBody;
  await subscribeUserToPush(req.context.userId, body);

  res.status(204).end();
}

export async function unsubscribePushController(req: Request, res: Response): Promise<void> {
  if (!req.context.userId) {
    res.status(401).json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
    return;
  }

  const body = req.body as UnsubscribePushBody;
  await unsubscribeUserFromPush(req.context.userId, body);

  res.status(204).end();
}

export async function scheduleNotificationController(req: Request, res: Response): Promise<void> {
  if (!req.context.userId) {
    res.status(401).json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
    return;
  }

  const body = req.body as ScheduleNotificationBody;
  const created = await scheduleNotification(req.context.userId, body);

  res.status(201).json({
    data: created,
    meta: { requestId: req.context.requestId }
  });
}

export async function cancelScheduledNotificationController(
  req: Request,
  res: Response
): Promise<void> {
  if (!req.context.userId) {
    res.status(401).json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } });
    return;
  }

  const params = req.params as unknown as ScheduleParams;
  await cancelScheduledNotification(req.context.userId, params.scheduleId);

  res.status(204).end();
}
