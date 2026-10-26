import type { Prisma, PrismaClient, Ticket, TimelineEvent, User } from '@prisma/client';
import type { Category, EventType, Priority, Status } from '../domain/constants';
import { computeSla, type SlaState } from '../domain/sla';
import {
  allowedTransitions,
  assertAssignment,
  assertCanReply,
  assertTransition,
  resolvedAtAfter,
  statusAfterCustomerReply,
} from '../domain/workflow';
import { badRequest, forbidden, notFound } from '../errors';

type UserLike = Pick<User, 'id' | 'role'>;

const publicUser = { select: { id: true, name: true, email: true, role: true, title: true, company: true } } as const;

const ticketInclude = {
  customer: publicUser,
  assignee: publicUser,
  _count: { select: { events: { where: { type: 'REPLY' } } } },
} satisfies Prisma.TicketInclude;

type TicketWithRelations = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

export function serializeTicket(ticket: TicketWithRelations, viewer: UserLike, now = new Date()) {
  const status = ticket.status as Status;
  return {
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    description: ticket.description,
    priority: ticket.priority as Priority,
    category: ticket.category as Category,
    status,
    customer: ticket.customer,
    assignee: ticket.assignee,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    replyCount: ticket._count.events,
    sla: computeSla(
      { priority: ticket.priority as Priority, status, createdAt: ticket.createdAt, resolvedAt: ticket.resolvedAt },
      now,
    ),
    allowedTransitions: viewer.role === 'AGENT' ? allowedTransitions(status) : [],
  };
}

export type TicketDto = ReturnType<typeof serializeTicket>;

export interface TicketFilters {
  status?: Status[];
  priority?: Priority[];
  /** Agent id, "me", or "unassigned". */
  assignee?: string;
  sla?: SlaState[];
  q?: string;
  sort?: 'sla' | 'newest' | 'oldest' | 'priority' | 'updated';
}

const PRIORITY_RANK: Record<Priority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export async function listTickets(prisma: PrismaClient, viewer: UserLike, filters: TicketFilters = {}) {
  const where: Prisma.TicketWhereInput = {};
  // Customers can only ever see their own tickets.
  if (viewer.role === 'CUSTOMER') where.customerId = viewer.id;
  if (filters.status?.length) where.status = { in: filters.status };
  if (filters.priority?.length) where.priority = { in: filters.priority };
  if (filters.assignee === 'unassigned') where.assigneeId = null;
  else if (filters.assignee === 'me') where.assigneeId = viewer.id;
  else if (filters.assignee) where.assigneeId = filters.assignee;
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    const asNumber = Number(q.replace(/^#/, ''));
    where.OR = [
      { subject: { contains: q } },
      { description: { contains: q } },
      { customer: { name: { contains: q } } },
      ...(Number.isInteger(asNumber) && asNumber > 0 ? [{ number: asNumber }] : []),
    ];
  }

  const now = new Date();
  const rows = await prisma.ticket.findMany({ where, include: ticketInclude });
  let tickets = rows.map((t) => serializeTicket(t, viewer, now));
  if (filters.sla?.length) tickets = tickets.filter((t) => filters.sla!.includes(t.sla.state));

  const sort = filters.sort ?? 'sla';
  tickets.sort((a, b) => {
    switch (sort) {
      case 'newest':
        return b.createdAt.localeCompare(a.createdAt);
      case 'oldest':
        return a.createdAt.localeCompare(b.createdAt);
      case 'updated':
        return b.updatedAt.localeCompare(a.updatedAt);
      case 'priority':
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt.localeCompare(b.createdAt);
      case 'sla':
      default: {
        // Active tickets first, ordered by how soon (or how long ago) they are due.
        const aDone = a.sla.state === 'MET' || a.sla.state === 'MISSED';
        const bDone = b.sla.state === 'MET' || b.sla.state === 'MISSED';
        if (aDone !== bDone) return aDone ? 1 : -1;
        if (aDone) return b.updatedAt.localeCompare(a.updatedAt);
        return a.sla.remainingMs - b.sla.remainingMs;
      }
    }
  });
  return tickets;
}

async function loadTicket(prisma: Prisma.TransactionClient | PrismaClient, id: string, viewer: UserLike) {
  const ticket = await prisma.ticket.findUnique({ where: { id }, include: ticketInclude });
  // A customer asking for someone else's ticket gets a 404, not a 403, so ids can't be probed.
  if (!ticket || (viewer.role === 'CUSTOMER' && ticket.customerId !== viewer.id)) throw notFound('Ticket');
  return ticket;
}

export async function getTicketDetail(prisma: PrismaClient, id: string, viewer: UserLike) {
  const ticket = await loadTicket(prisma, id, viewer);
  const events = await prisma.timelineEvent.findMany({
    where: {
      ticketId: id,
      // Internal notes are for agents only.
      ...(viewer.role === 'CUSTOMER' ? { type: { not: 'NOTE' } } : {}),
    },
    include: { actor: publicUser },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  // Resolve assignee ids in ASSIGNED events to names for display.
  const userIds = new Set<string>();
  for (const e of events) {
    if (e.type === 'ASSIGNED') {
      if (e.fromValue) userIds.add(e.fromValue);
      if (e.toValue) userIds.add(e.toValue);
    }
  }
  const users = userIds.size
    ? await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((u) => [u.id, u.name]));

  return {
    ticket: serializeTicket(ticket, viewer),
    timeline: events.map((e) => serializeEvent(e, names)),
  };
}

function serializeEvent(
  e: TimelineEvent & { actor: Pick<User, 'id' | 'name' | 'email' | 'role' | 'title' | 'company'> },
  names: Map<string, string>,
) {
  const label = (id: string | null) => (id ? (names.get(id) ?? 'Unknown agent') : null);
  return {
    id: e.id,
    type: e.type as EventType,
    actor: e.actor,
    fromValue: e.fromValue,
    toValue: e.toValue,
    fromLabel: e.type === 'ASSIGNED' ? label(e.fromValue) : e.fromValue,
    toLabel: e.type === 'ASSIGNED' ? label(e.toValue) : e.toValue,
    body: e.body,
    createdAt: e.createdAt.toISOString(),
  };
}

export interface CreateTicketInput {
  subject: string;
  description: string;
  priority: Priority;
  category: Category;
}

export async function createTicket(prisma: PrismaClient, viewer: UserLike, input: CreateTicketInput) {
  if (viewer.role !== 'CUSTOMER') throw forbidden('Only customers can submit tickets.');
  const id = await prisma.$transaction(async (tx) => {
    const last = await tx.ticket.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
    const ticket = await tx.ticket.create({
      data: { ...input, number: (last?.number ?? 1000) + 1, status: 'OPEN', customerId: viewer.id },
    });
    await tx.timelineEvent.create({
      data: { ticketId: ticket.id, actorId: viewer.id, type: 'CREATED', toValue: 'OPEN' },
    });
    return ticket.id;
  });
  return getTicketDetail(prisma, id, viewer);
}

function requireAgent(viewer: UserLike) {
  if (viewer.role !== 'AGENT') throw forbidden('Only agents can do this.');
}

/** Applies a validated status change and writes it to the timeline. */
async function applyStatusChange(
  tx: Prisma.TransactionClient,
  ticket: Pick<Ticket, 'id' | 'status' | 'resolvedAt'>,
  to: Status,
  actorId: string,
  at: Date,
) {
  await tx.ticket.update({
    where: { id: ticket.id },
    data: { status: to, resolvedAt: resolvedAtAfter(to, ticket.resolvedAt, at) },
  });
  await tx.timelineEvent.create({
    data: { ticketId: ticket.id, actorId, type: 'STATUS_CHANGED', fromValue: ticket.status, toValue: to, createdAt: at },
  });
}

export async function changeStatus(prisma: PrismaClient, viewer: UserLike, id: string, to: Status) {
  requireAgent(viewer);
  await prisma.$transaction(async (tx) => {
    const ticket = await loadTicket(tx, id, viewer);
    assertTransition({ status: ticket.status as Status, assigneeId: ticket.assigneeId }, to);
    await applyStatusChange(tx, ticket, to, viewer.id, new Date());
  });
  return getTicketDetail(prisma, id, viewer);
}

export async function assignTicket(prisma: PrismaClient, viewer: UserLike, id: string, assigneeId: string | null) {
  requireAgent(viewer);
  await prisma.$transaction(async (tx) => {
    const ticket = await loadTicket(tx, id, viewer);
    if (assigneeId) {
      const agent = await tx.user.findUnique({ where: { id: assigneeId } });
      if (!agent || agent.role !== 'AGENT') throw badRequest('Tickets can only be assigned to agents.');
    }
    assertAssignment({ status: ticket.status as Status, assigneeId: ticket.assigneeId }, assigneeId);
    await tx.ticket.update({ where: { id }, data: { assigneeId } });
    await tx.timelineEvent.create({
      data: { ticketId: id, actorId: viewer.id, type: 'ASSIGNED', fromValue: ticket.assigneeId, toValue: assigneeId },
    });
  });
  return getTicketDetail(prisma, id, viewer);
}

export interface ReplyInput {
  body: string;
  /** Agents only: write an internal note that customers never see. */
  internal?: boolean;
  /** Agents only: change status in the same step (e.g. reply + wait for customer). */
  status?: Status;
}

export async function addReply(prisma: PrismaClient, viewer: UserLike, id: string, input: ReplyInput) {
  const isAgent = viewer.role === 'AGENT';
  if (!isAgent && (input.internal || input.status)) throw forbidden('Customers can only post replies.');

  await prisma.$transaction(async (tx) => {
    const ticket = await loadTicket(tx, id, viewer);
    const state = { status: ticket.status as Status, assigneeId: ticket.assigneeId };
    assertCanReply(state);
    // Validate the requested status change up front so nothing is written if it is invalid.
    if (input.status) assertTransition(state, input.status);

    const now = new Date();
    await tx.timelineEvent.create({
      data: { ticketId: id, actorId: viewer.id, type: input.internal ? 'NOTE' : 'REPLY', body: input.body, createdAt: now },
    });

    const next = isAgent ? (input.status ?? null) : statusAfterCustomerReply(state);
    if (next) {
      // 1 ms later so the status change always sorts after the reply that caused it.
      await applyStatusChange(tx, ticket, next, viewer.id, new Date(now.getTime() + 1));
    } else {
      await tx.ticket.update({ where: { id }, data: { updatedAt: now } });
    }
  });
  return getTicketDetail(prisma, id, viewer);
}

export async function getStats(prisma: PrismaClient, viewer: UserLike) {
  requireAgent(viewer);
  const tickets = await listTickets(prisma, viewer);
  const count = (fn: (t: TicketDto) => boolean) => tickets.filter(fn).length;
  const active = tickets.filter((t) => ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER'].includes(t.status));
  const done = tickets.filter((t) => t.sla.state === 'MET' || t.sla.state === 'MISSED');
  return {
    total: tickets.length,
    byStatus: {
      OPEN: count((t) => t.status === 'OPEN'),
      IN_PROGRESS: count((t) => t.status === 'IN_PROGRESS'),
      WAITING_FOR_CUSTOMER: count((t) => t.status === 'WAITING_FOR_CUSTOMER'),
      RESOLVED: count((t) => t.status === 'RESOLVED'),
      CLOSED: count((t) => t.status === 'CLOSED'),
    },
    active: active.length,
    breached: count((t) => t.sla.state === 'BREACHED'),
    atRisk: count((t) => t.sla.state === 'AT_RISK'),
    unassigned: active.filter((t) => !t.assignee).length,
    mine: active.filter((t) => t.assignee?.id === viewer.id).length,
    slaMetRate: done.length ? done.filter((t) => t.sla.state === 'MET').length / done.length : null,
  };
}
