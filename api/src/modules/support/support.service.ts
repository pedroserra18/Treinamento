import { Prisma, SupportTicketStatus, SupportTicketTopic } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../shared/errors/app-error";
import { createNotification } from "../notification/notification.service";
import {
  AdminListQuery,
  AdminReplyInput,
  AdminUpdateStatusInput,
  CreateTicketInput,
  SUPPORT_LIMITS,
  TemplateBodyInput,
  UserReplyInput,
} from "./support.schema";

const ADMIN_DISPLAY_NAME = "Equipe SerraAthlo";

const ticketSelect = {
  id: true,
  publicId: true,
  userId: true,
  topic: true,
  subject: true,
  status: true,
  lastActivityAt: true,
  resolvedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: { id: true, name: true, email: true, avatarUrl: true },
  },
} satisfies Prisma.SupportTicketSelect;

function publicTicketCode(publicId: number): string {
  return `#${String(publicId).padStart(4, "0")}`;
}

function serializeMessage(message: {
  id: string;
  ticketId: string;
  authorId: string | null;
  authorRole: "USER" | "ADMIN" | "SYSTEM";
  body: string;
  attachments: Prisma.JsonValue;
  isInternalNote: boolean;
  createdAt: Date;
  author?: { id: string; name: string | null; avatarUrl: string | null } | null;
}, viewerIsAdmin: boolean) {
  const attachments = Array.isArray(message.attachments) ? (message.attachments as string[]) : [];
  const isAdmin = message.authorRole === "ADMIN";
  return {
    id: message.id,
    ticketId: message.ticketId,
    body: message.body,
    attachments,
    authorRole: message.authorRole,
    isInternalNote: message.isInternalNote,
    createdAt: message.createdAt,
    author: isAdmin
      ? { displayName: ADMIN_DISPLAY_NAME }
      : message.author
        ? {
            id: message.author.id,
            displayName: message.author.name ?? "Usuário",
            avatarUrl: message.author.avatarUrl ?? null,
          }
        : { displayName: message.authorRole === "SYSTEM" ? "Sistema" : "Usuário" },
    viewerCanSeeInternalNote: viewerIsAdmin || !message.isInternalNote,
  };
}

function serializeTicket(ticket: Prisma.SupportTicketGetPayload<{ select: typeof ticketSelect }>) {
  return {
    id: ticket.id,
    publicId: ticket.publicId,
    code: publicTicketCode(ticket.publicId),
    topic: ticket.topic,
    subject: ticket.subject,
    status: ticket.status,
    lastActivityAt: ticket.lastActivityAt,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    createdAt: ticket.createdAt,
    user: ticket.user,
  };
}

async function ensureUserCanCreateTicket(userId: string) {
  const openCount = await prisma.supportTicket.count({
    where: {
      userId,
      status: { in: ["OPEN", "IN_PROGRESS", "AWAITING_USER"] },
    },
  });
  if (openCount >= SUPPORT_LIMITS.MAX_OPEN_TICKETS_PER_USER) {
    throw new AppError("Você já atingiu o limite de tickets abertos. Aguarde um ser resolvido antes de criar outro.", {
      statusCode: 429,
      code: "SUPPORT_OPEN_TICKETS_LIMIT",
    });
  }

  const cooldownStart = new Date(Date.now() - SUPPORT_LIMITS.TICKET_CREATION_COOLDOWN_MS);
  const recent = await prisma.supportTicket.findFirst({
    where: { userId, createdAt: { gte: cooldownStart } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent) {
    const elapsedMs = Date.now() - recent.createdAt.getTime();
    const waitMs = Math.max(0, SUPPORT_LIMITS.TICKET_CREATION_COOLDOWN_MS - elapsedMs);
    const waitMin = Math.ceil(waitMs / 60_000);
    throw new AppError(`Aguarde ${waitMin} minuto(s) antes de abrir outro ticket.`, {
      statusCode: 429,
      code: "SUPPORT_COOLDOWN",
    });
  }
}

export async function createTicket(userId: string, input: CreateTicketInput) {
  await ensureUserCanCreateTicket(userId);

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: {
        userId,
        topic: input.topic as SupportTicketTopic,
        subject: input.subject,
        status: "OPEN",
      },
      select: ticketSelect,
    });

    await tx.supportMessage.create({
      data: {
        ticketId: created.id,
        authorId: userId,
        authorRole: "USER",
        body: input.body,
        attachments: input.attachments && input.attachments.length > 0 ? (input.attachments as never) : Prisma.JsonNull,
      },
    });

    await tx.supportMessage.create({
      data: {
        ticketId: created.id,
        authorId: null,
        authorRole: "SYSTEM",
        body: "Recebemos seu pedido. Respondemos em até 48 horas.",
      },
    });

    return created;
  });

  await createNotification({
    userId,
    type: "SUPPORT_TICKET_CREATED",
    title: `Ticket ${publicTicketCode(ticket.publicId)} aberto`,
    body: "Recebemos seu pedido. Respondemos em até 48 horas.",
    metadata: { ticketId: ticket.id, publicId: ticket.publicId },
  });

  return serializeTicket(ticket);
}

export async function listMyTickets(userId: string) {
  const tickets = await prisma.supportTicket.findMany({
    where: { userId },
    orderBy: [{ status: "asc" }, { lastActivityAt: "desc" }],
    select: {
      ...ticketSelect,
      messages: {
        where: { isInternalNote: false },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, authorRole: true },
      },
    },
  });
  return tickets.map((t) => {
    const last = t.messages[0];
    return {
      ...serializeTicket(t),
      // Prévia da última mensagem + quem a enviou (para indicador "Suporte respondeu").
      lastMessagePreview: last ? (last.body.length > 90 ? `${last.body.slice(0, 87)}...` : last.body) : null,
      lastMessageRole: last ? last.authorRole : null,
    };
  });
}

export async function getTicketForUser(userId: string, ticketId: string) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, userId },
    select: ticketSelect,
  });
  if (!ticket) {
    throw new AppError("Ticket não encontrado", { statusCode: 404, code: "SUPPORT_TICKET_NOT_FOUND" });
  }
  const messages = await prisma.supportMessage.findMany({
    where: { ticketId, isInternalNote: false },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
  return {
    ticket: serializeTicket(ticket),
    messages: messages.map((m) => serializeMessage(m, false)),
  };
}

export async function userReply(userId: string, ticketId: string, input: UserReplyInput) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, userId },
    select: { id: true, status: true, publicId: true },
  });
  if (!ticket) {
    throw new AppError("Ticket não encontrado", { statusCode: 404, code: "SUPPORT_TICKET_NOT_FOUND" });
  }
  if (ticket.status === "CLOSED") {
    throw new AppError("Este ticket está fechado. Abra um novo se precisar de ajuda.", {
      statusCode: 400,
      code: "SUPPORT_TICKET_CLOSED",
    });
  }

  const nextStatus: SupportTicketStatus = ticket.status === "RESOLVED" ? "OPEN" : "OPEN";

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.supportMessage.create({
      data: {
        ticketId,
        authorId: userId,
        authorRole: "USER",
        body: input.body,
        attachments: input.attachments && input.attachments.length > 0 ? (input.attachments as never) : Prisma.JsonNull,
      },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });
    await tx.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: nextStatus,
        lastActivityAt: new Date(),
        resolvedAt: null,
      },
    });
    return created;
  });

  return serializeMessage(message, false);
}

export async function userMarkResolved(userId: string, ticketId: string) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, userId },
    select: { id: true, status: true, publicId: true },
  });
  if (!ticket) {
    throw new AppError("Ticket não encontrado", { statusCode: 404, code: "SUPPORT_TICKET_NOT_FOUND" });
  }
  if (ticket.status === "CLOSED" || ticket.status === "RESOLVED") {
    return;
  }
  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      lastActivityAt: new Date(),
    },
  });
}

// ---------- Admin ----------

export async function adminListTickets(query: AdminListQuery) {
  const where: Prisma.SupportTicketWhereInput = {};
  if (query.status) where.status = query.status as SupportTicketStatus;
  if (query.search) {
    const search = query.search.trim();
    const numeric = Number.parseInt(search.replace(/^#/, ""), 10);
    where.OR = [
      { subject: { contains: search, mode: "insensitive" } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      { user: { name: { contains: search, mode: "insensitive" } } },
      ...(Number.isFinite(numeric) ? [{ publicId: numeric }] : []),
    ];
  }

  const total = await prisma.supportTicket.count({ where });
  const tickets = await prisma.supportTicket.findMany({
    where,
    orderBy: [{ status: "asc" }, { lastActivityAt: "desc" }],
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
    select: {
      ...ticketSelect,
      messages: {
        where: { isInternalNote: false },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, authorRole: true },
      },
    },
  });

  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    items: tickets.map((t) => {
      const last = t.messages[0];
      return {
        ...serializeTicket(t),
        lastMessagePreview: last ? (last.body.length > 90 ? `${last.body.slice(0, 87)}...` : last.body) : null,
        lastMessageRole: last ? last.authorRole : null,
      };
    }),
  };
}

// Contagem global por status (pros badges dos filtros). groupBy é 1 query só.
export async function adminTicketCounts(): Promise<Record<string, number>> {
  const grouped = await prisma.supportTicket.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const g of grouped) out[g.status] = g._count._all;
  return out;
}

export async function adminGetTicket(ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: ticketSelect,
  });
  if (!ticket) {
    throw new AppError("Ticket não encontrado", { statusCode: 404, code: "SUPPORT_TICKET_NOT_FOUND" });
  }
  const messages = await prisma.supportMessage.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });
  return {
    ticket: serializeTicket(ticket),
    messages: messages.map((m) => serializeMessage(m, true)),
  };
}

export async function adminReply(adminId: string, ticketId: string, input: AdminReplyInput) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, userId: true, status: true, publicId: true, subject: true },
  });
  if (!ticket) {
    throw new AppError("Ticket não encontrado", { statusCode: 404, code: "SUPPORT_TICKET_NOT_FOUND" });
  }

  const updates: Prisma.SupportTicketUpdateInput = { lastActivityAt: new Date() };
  if (!input.isInternalNote) {
    if (input.nextStatus) {
      updates.status = input.nextStatus as SupportTicketStatus;
      if (input.nextStatus === "RESOLVED") updates.resolvedAt = new Date();
      if (input.nextStatus === "CLOSED") updates.closedAt = new Date();
    } else if (ticket.status === "OPEN" || ticket.status === "AWAITING_USER") {
      updates.status = "AWAITING_USER";
    }
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.supportMessage.create({
      data: {
        ticketId,
        authorId: adminId,
        authorRole: "ADMIN",
        body: input.body,
        attachments: input.attachments && input.attachments.length > 0 ? (input.attachments as never) : Prisma.JsonNull,
        isInternalNote: input.isInternalNote,
      },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });
    await tx.supportTicket.update({
      where: { id: ticketId },
      data: updates,
    });
    return created;
  });

  if (!input.isInternalNote) {
    const isResolved = updates.status === "RESOLVED";
    await createNotification({
      userId: ticket.userId,
      type: isResolved ? "SUPPORT_TICKET_RESOLVED" : "SUPPORT_TICKET_REPLIED",
      title: isResolved
        ? `Ticket ${publicTicketCode(ticket.publicId)} resolvido`
        : `Nova resposta no ticket ${publicTicketCode(ticket.publicId)}`,
      body: input.body.length > 140 ? `${input.body.slice(0, 137)}...` : input.body,
      metadata: { ticketId: ticket.id, publicId: ticket.publicId },
    });
  }

  return serializeMessage(message, true);
}

export async function adminUpdateStatus(ticketId: string, input: AdminUpdateStatusInput) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true },
  });
  if (!ticket) {
    throw new AppError("Ticket não encontrado", { statusCode: 404, code: "SUPPORT_TICKET_NOT_FOUND" });
  }

  const data: Prisma.SupportTicketUpdateInput = {
    status: input.status as SupportTicketStatus,
    lastActivityAt: new Date(),
  };
  if (input.status === "RESOLVED") data.resolvedAt = new Date();
  if (input.status === "CLOSED") data.closedAt = new Date();

  await prisma.supportTicket.update({ where: { id: ticketId }, data });
}

// ---------- Templates ----------

export async function listTemplates() {
  return prisma.supportTemplate.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, body: true, updatedAt: true },
  });
}

export async function createTemplate(adminId: string, input: TemplateBodyInput) {
  return prisma.supportTemplate.create({
    data: {
      title: input.title,
      body: input.body,
      createdById: adminId,
    },
    select: { id: true, title: true, body: true, updatedAt: true },
  });
}

export async function updateTemplate(templateId: string, input: TemplateBodyInput) {
  const exists = await prisma.supportTemplate.findUnique({ where: { id: templateId } });
  if (!exists) {
    throw new AppError("Template não encontrado", { statusCode: 404, code: "SUPPORT_TEMPLATE_NOT_FOUND" });
  }
  return prisma.supportTemplate.update({
    where: { id: templateId },
    data: { title: input.title, body: input.body },
    select: { id: true, title: true, body: true, updatedAt: true },
  });
}

export async function deleteTemplate(templateId: string) {
  await prisma.supportTemplate.deleteMany({ where: { id: templateId } });
}

// ---------- Auto-close ----------

export async function autoCloseStaleTickets() {
  const cutoff = new Date(Date.now() - SUPPORT_LIMITS.AUTO_CLOSE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const stale = await prisma.supportTicket.findMany({
    where: {
      status: "AWAITING_USER",
      lastActivityAt: { lt: cutoff },
    },
    select: { id: true, userId: true, publicId: true },
  });
  if (stale.length === 0) return { closed: 0 };

  await prisma.$transaction(
    stale.map((t) =>
      prisma.supportTicket.update({
        where: { id: t.id },
        data: { status: "CLOSED", closedAt: new Date(), lastActivityAt: new Date() },
      })
    )
  );

  await Promise.all(
    stale.map((t) =>
      createNotification({
        userId: t.userId,
        type: "SUPPORT_TICKET_AUTO_CLOSED",
        title: `Ticket ${publicTicketCode(t.publicId)} fechado por inatividade`,
        body: `Seu ticket foi fechado após ${SUPPORT_LIMITS.AUTO_CLOSE_AFTER_DAYS} dias sem resposta. Abra um novo se ainda precisar de ajuda.`,
        metadata: { ticketId: t.id, publicId: t.publicId },
      })
    )
  );

  return { closed: stale.length };
}
