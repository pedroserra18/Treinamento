import { Request, Response } from "express";
import {
  AdminListQuery,
  AdminReplyInput,
  AdminUpdateStatusInput,
  CreateTicketInput,
  TemplateBodyInput,
  UserReplyInput,
} from "./support.schema";
import {
  adminGetTicket,
  adminListTickets,
  adminReply,
  adminUpdateStatus,
  autoCloseStaleTickets,
  createTemplate,
  createTicket,
  deleteTemplate,
  getTicketForUser,
  listMyTickets,
  listTemplates,
  updateTemplate,
  userMarkResolved,
  userReply,
} from "./support.service";

function meta(req: Request) {
  return { requestId: req.context.requestId };
}

export async function createTicketController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const ticket = await createTicket(userId, req.body as CreateTicketInput);
  res.status(201).json({ data: { ticket }, meta: meta(req) });
}

export async function listMyTicketsController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const items = await listMyTickets(userId);
  res.status(200).json({ data: { items }, meta: meta(req) });
}

export async function getMyTicketController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const data = await getTicketForUser(userId, req.params["ticketId"] as string);
  res.status(200).json({ data, meta: meta(req) });
}

export async function userReplyController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  const message = await userReply(userId, req.params["ticketId"] as string, req.body as UserReplyInput);
  res.status(201).json({ data: { message }, meta: meta(req) });
}

export async function userResolveController(req: Request, res: Response): Promise<void> {
  const userId = req.context.userId as string;
  await userMarkResolved(userId, req.params["ticketId"] as string);
  res.status(204).end();
}

// admin

export async function adminListTicketsController(req: Request, res: Response): Promise<void> {
  const data = await adminListTickets(req.query as unknown as AdminListQuery);
  res.status(200).json({ data, meta: meta(req) });
}

export async function adminGetTicketController(req: Request, res: Response): Promise<void> {
  const data = await adminGetTicket(req.params["ticketId"] as string);
  res.status(200).json({ data, meta: meta(req) });
}

export async function adminReplyController(req: Request, res: Response): Promise<void> {
  const adminId = req.context.userId as string;
  const message = await adminReply(adminId, req.params["ticketId"] as string, req.body as AdminReplyInput);
  res.status(201).json({ data: { message }, meta: meta(req) });
}

export async function adminUpdateStatusController(req: Request, res: Response): Promise<void> {
  await adminUpdateStatus(req.params["ticketId"] as string, req.body as AdminUpdateStatusInput);
  res.status(204).end();
}

export async function listTemplatesController(req: Request, res: Response): Promise<void> {
  const items = await listTemplates();
  res.status(200).json({ data: { items }, meta: meta(req) });
}

export async function createTemplateController(req: Request, res: Response): Promise<void> {
  const adminId = req.context.userId as string;
  const template = await createTemplate(adminId, req.body as TemplateBodyInput);
  res.status(201).json({ data: { template }, meta: meta(req) });
}

export async function updateTemplateController(req: Request, res: Response): Promise<void> {
  const template = await updateTemplate(req.params["templateId"] as string, req.body as TemplateBodyInput);
  res.status(200).json({ data: { template }, meta: meta(req) });
}

export async function deleteTemplateController(req: Request, res: Response): Promise<void> {
  await deleteTemplate(req.params["templateId"] as string);
  res.status(204).end();
}

export async function autoCloseController(req: Request, res: Response): Promise<void> {
  const result = await autoCloseStaleTickets();
  res.status(200).json({ data: result, meta: meta(req) });
}
