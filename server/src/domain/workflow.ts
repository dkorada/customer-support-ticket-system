import { STATUSES, type Status } from './constants';

/**
 * The ticket status state machine. A status may only move to one of the
 * statuses listed for it. CLOSED is terminal.
 *
 *   OPEN ───────────────► IN_PROGRESS ◄──────────────┐
 *    │                    │   ▲   │                  │
 *    │                    │   │   ▼                  │
 *    │                    │  WAITING_FOR_CUSTOMER    │ (reopen)
 *    │                    ▼   │                      │
 *    │                  RESOLVED ────────────────────┘
 *    ▼                    │
 *  CLOSED ◄───────────────┘ (also from WAITING_FOR_CUSTOMER)
 */
export const TRANSITIONS: Record<Status, readonly Status[]> = {
  OPEN: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['WAITING_FOR_CUSTOMER', 'RESOLVED', 'OPEN'],
  WAITING_FOR_CUSTOMER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: [],
};

/** Statuses where the ticket still needs work from the support team. */
export const ACTIVE_STATUSES: readonly Status[] = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER'];

/** Statuses that stop the SLA clock. */
export const DONE_STATUSES: readonly Status[] = ['RESOLVED', 'CLOSED'];

export class WorkflowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

export function allowedTransitions(from: Status): readonly Status[] {
  return TRANSITIONS[from];
}

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface TicketState {
  status: Status;
  assigneeId: string | null;
}

/**
 * Validates a status change. Throws a WorkflowError explaining why the change
 * is not allowed; returns normally when it is.
 */
export function assertTransition(ticket: TicketState, to: Status): void {
  const from = ticket.status;
  if (from === to) {
    throw new WorkflowError(`Ticket is already ${from}.`, 'NO_OP');
  }
  if (!canTransition(from, to)) {
    const allowed = TRANSITIONS[from];
    throw new WorkflowError(
      allowed.length
        ? `Cannot move a ticket from ${from} to ${to}. Allowed: ${allowed.join(', ')}.`
        : `${from} is a final status; the ticket cannot change any more.`,
      'INVALID_TRANSITION',
    );
  }
  if (to === 'IN_PROGRESS' && !ticket.assigneeId) {
    throw new WorkflowError('Assign the ticket to an agent before moving it to IN_PROGRESS.', 'ASSIGNEE_REQUIRED');
  }
}

/**
 * Validates an assignment change. Reassigning to another agent is allowed in
 * any non-final status; removing the assignee is only allowed while OPEN,
 * because every other active status means someone owns the ticket.
 */
export function assertAssignment(ticket: TicketState, assigneeId: string | null): void {
  if (ticket.status === 'CLOSED') {
    throw new WorkflowError('Closed tickets cannot be reassigned.', 'TICKET_CLOSED');
  }
  if (ticket.assigneeId === assigneeId) {
    throw new WorkflowError(
      assigneeId ? 'Ticket is already assigned to this agent.' : 'Ticket is already unassigned.',
      'NO_OP',
    );
  }
  if (assigneeId === null && ticket.status !== 'OPEN') {
    throw new WorkflowError(
      `Only OPEN tickets can be unassigned. Move it back to OPEN or reassign it instead.`,
      'ASSIGNEE_REQUIRED',
    );
  }
}

/** Replies and notes are allowed on everything except closed tickets. */
export function assertCanReply(ticket: TicketState): void {
  if (ticket.status === 'CLOSED') {
    throw new WorkflowError('This ticket is closed. Please open a new ticket instead.', 'TICKET_CLOSED');
  }
}

/**
 * When a customer replies, a ticket that was waiting on them (or already
 * resolved) goes back to the agent: it automatically returns to IN_PROGRESS.
 * Returns the new status, or null when no automatic change applies.
 */
export function statusAfterCustomerReply(ticket: TicketState): Status | null {
  if ((ticket.status === 'WAITING_FOR_CUSTOMER' || ticket.status === 'RESOLVED') && ticket.assigneeId) {
    return 'IN_PROGRESS';
  }
  return null;
}

/**
 * Computes the new resolvedAt value (the moment the SLA clock stopped) after
 * a status change.
 */
export function resolvedAtAfter(to: Status, current: Date | null, now: Date): Date | null {
  if (DONE_STATUSES.includes(to)) return current ?? now;
  return null;
}
