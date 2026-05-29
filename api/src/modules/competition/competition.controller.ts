import { Request, Response } from "express";
import {
  acceptInvite,
  createCompetition,
  declineInvite,
  deleteChatMessage,
  deleteCompetitionEntry,
  deleteEntryComment,
  getCompetitionById,
  getCompetitionFeed,
  getInvitePreview,
  getMyActiveCompetition,
  getStandings,
  inviteMember,
  kickMember,
  leaveCompetition,
  listChatMessages,
  listEntryComments,
  listInvitableFriends,
  listMyCompetitions,
  listMyInvites,
  postChatMessage,
  postCompetitionEntry,
  postEntryComment,
  setMemberRole,
  startCompetition,
  toggleReaction
} from "./competition.service";
import type {
  ChatParams,
  CompetitionParams,
  CreateCompetitionBody,
  EntryCommentParams,
  EntryParams,
  InviteMemberBody,
  InviteTokenParams,
  ListChatQuery,
  ListFeedQuery,
  MemberParams,
  PostChatBody,
  PostEntryBody,
  PostEntryCommentBody,
  ReactionBody
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
  const query = req.query as unknown as ListFeedQuery;
  const data = await getCompetitionFeed(userId, params.competitionId, query);
  send(res, 200, data);
}

export async function listInvitableFriendsController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as CompetitionParams;
  const data = await listInvitableFriends(userId, params.competitionId);
  send(res, 200, data);
}

export async function promoteMemberController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as MemberParams;
  const data = await setMemberRole(userId, params.competitionId, params.userId, "ADMIN");
  send(res, 200, data);
}

export async function demoteMemberController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as MemberParams;
  const data = await setMemberRole(userId, params.competitionId, params.userId, "MEMBER");
  send(res, 200, data);
}

export async function kickMemberController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as MemberParams;
  const data = await kickMember(userId, params.competitionId, params.userId);
  send(res, 200, data);
}

export async function listChatController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as CompetitionParams;
  const query = req.query as unknown as ListChatQuery;
  const data = await listChatMessages(userId, params.competitionId, query);
  send(res, 200, data);
}

export async function postChatController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as CompetitionParams;
  const data = await postChatMessage(userId, params.competitionId, req.body as PostChatBody);
  send(res, 201, data);
}

export async function deleteChatController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as ChatParams;
  const data = await deleteChatMessage(userId, params.competitionId, params.messageId);
  send(res, 200, data);
}

export async function toggleReactionController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as EntryParams;
  const data = await toggleReaction(userId, params.competitionId, params.entryId, req.body as ReactionBody);
  send(res, 200, data);
}

export async function listEntryCommentsController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as EntryParams;
  const data = await listEntryComments(userId, params.competitionId, params.entryId);
  send(res, 200, data);
}

export async function postEntryCommentController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as EntryParams;
  const data = await postEntryComment(
    userId,
    params.competitionId,
    params.entryId,
    req.body as PostEntryCommentBody
  );
  send(res, 201, data);
}

export async function deleteEntryCommentController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as EntryCommentParams;
  const data = await deleteEntryComment(userId, params.competitionId, params.entryId, params.commentId);
  send(res, 200, data);
}

export async function deleteEntryController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as EntryParams;
  const data = await deleteCompetitionEntry(userId, params.competitionId, params.entryId);
  send(res, 200, data);
}

export async function leaveCompetitionController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const params = req.params as unknown as CompetitionParams;
  const data = await leaveCompetition(userId, params.competitionId);
  send(res, 200, data);
}
