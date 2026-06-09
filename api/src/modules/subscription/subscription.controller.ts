import { Request, Response } from "express";
import { env } from "../../config/env";
import {
  createProInvite,
  getPlanSummary,
  listProInvites,
  previewProInvite,
  redeemProInvite,
  revokeProInvite
} from "./subscription.service";
import type {
  CreateProInviteBody,
  ProInviteIdParams,
  ProInviteTokenParams
} from "./subscription.schema";

export async function getPlanSummaryController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const data = await getPlanSummary(userId);
  res.status(200).json({ data, meta: { requestId: req.context.requestId } });
}

// ─── Admin endpoints ────────────────────────────────────────────────────

export async function createProInviteController(req: Request, res: Response): Promise<void> {
  const adminUserId = req.context.userId as string;
  const body = req.body as CreateProInviteBody;
  const data = await createProInvite(adminUserId, body, env.clientUrl);
  res.status(201).json({ data, meta: { requestId: req.context.requestId } });
}

export async function listProInvitesController(req: Request, res: Response): Promise<void> {
  const adminUserId = req.context.userId as string;
  const limitParam = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
  const limit = Number.isFinite(limitParam) ? limitParam : 50;
  const data = await listProInvites(adminUserId, env.clientUrl, limit);
  res.status(200).json({ data, meta: { requestId: req.context.requestId } });
}

export async function revokeProInviteController(req: Request, res: Response): Promise<void> {
  const adminUserId = req.context.userId as string;
  const params = req.params as unknown as ProInviteIdParams;
  await revokeProInvite(adminUserId, params.inviteId);
  res.status(204).end();
}

// ─── Public endpoints ───────────────────────────────────────────────────

export async function previewProInviteController(req: Request, res: Response): Promise<void> {
  const params = req.params as unknown as ProInviteTokenParams;
  const data = await previewProInvite(params.token);
  res.status(200).json({ data, meta: { requestId: req.context.requestId } });
}

export async function redeemProInviteController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as ProInviteTokenParams;
  const data = await redeemProInvite(userId, params.token);
  res.status(200).json({ data, meta: { requestId: req.context.requestId } });
}
