import { Request, Response } from "express";
import {
  acceptInvite,
  createCompetition,
  declineInvite,
  getCompetitionById,
  getCompetitionFeed,
  getInvitePreview,
  getMyActiveCompetition,
  getStandings,
  inviteMember,
  leaveCompetition,
  listMyCompetitions,
  listMyInvites,
  postCompetitionEntry,
  startCompetition
} from "./competition.service";
import type {
  CompetitionParams,
  CreateCompetitionBody,
  InviteMemberBody,
  InviteTokenParams,
  PostEntryBody
} from "./competition.schema";

function send(res: Response, status: number, data: unknown) {
  res.status(status).json({ data, meta: { requestId: res.req.context.requestId } });
}

export async function createCompetitionController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const data = await createCompetition(userId, req.body as CreateCompetitionBody);
  send(res, 201, data);
}

export async function getActiveCompetitionController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const data = await getMyActiveCompetition(userId);
  send(res, 200, data);
}

export async function listMyCompetitionsController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const data = await listMyCompetitions(userId);
  send(res, 200, data);
}

export async function getCompetitionController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as CompetitionParams;
  const data = await getCompetitionById(userId, params.competitionId);
  send(res, 200, data);
}

export async function inviteMemberController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as CompetitionParams;
  const data = await inviteMember(userId, params.competitionId, req.body as InviteMemberBody);
  send(res, 201, data);
}

export async function listMyInvitesController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const data = await listMyInvites(userId);
  send(res, 200, data);
}

export async function getInvitePreviewController(req: Request, res: Response): Promise<void> {
  const params = req.params as unknown as InviteTokenParams;
  const data = await getInvitePreview(params.token);
  send(res, 200, data);
}

export async function acceptInviteController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as InviteTokenParams;
  const data = await acceptInvite(userId, params.token);
  send(res, 200, data);
}

export async function declineInviteController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as InviteTokenParams;
  const data = await declineInvite(userId, params.token);
  send(res, 200, data);
}

export async function startCompetitionController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as CompetitionParams;
  const data = await startCompetition(userId, params.competitionId);
  send(res, 200, data);
}

export async function postEntryController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as CompetitionParams;
  const data = await postCompetitionEntry(userId, params.competitionId, req.body as PostEntryBody);
  send(res, 201, data);
}

export async function getStandingsController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as CompetitionParams;
  const data = await getStandings(userId, params.competitionId);
  send(res, 200, data);
}

export async function getFeedController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as CompetitionParams;
  const data = await getCompetitionFeed(userId, params.competitionId);
  send(res, 200, data);
}

export async function leaveCompetitionController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as CompetitionParams;
  const data = await leaveCompetition(userId, params.competitionId);
  send(res, 200, data);
}
