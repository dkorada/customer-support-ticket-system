import type { Priority, Status } from './constants';
import { DONE_STATUSES } from './workflow';

/** Resolution targets per priority, in hours. */
export const SLA_TARGET_HOURS: Record<Priority, number> = {
  HIGH: 4,
  MEDIUM: 24,
  LOW: 72,
};

/** Share of the target after which an active ticket is flagged "at risk". */
export const SLA_AT_RISK_RATIO = 0.75;

const HOUR_MS = 60 * 60 * 1000;

export type SlaState =
  /** Active, less than 75% of the target used. */
  | 'ON_TRACK'
  /** Active, 75% or more of the target used. */
  | 'AT_RISK'
  /** Active and older than the target: flagged. */
  | 'BREACHED'
  /** Resolved/closed within the target. */
  | 'MET'
  /** Resolved/closed after the target. */
  | 'MISSED';

export interface SlaInput {
  priority: Priority;
  status: Status;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface SlaResult {
  state: SlaState;
  /** True for active tickets older than their priority's target. */
  breached: boolean;
  targetHours: number;
  dueAt: string;
  /** Time the clock has run: until now for active tickets, until resolution otherwise. */
  elapsedMs: number;
  /** Time left before the due date; negative once overdue. */
  remainingMs: number;
  /** elapsed / target, e.g. 0.5 = half the target used. */
  ratio: number;
}

export function computeSla(ticket: SlaInput, now: Date = new Date()): SlaResult {
  const targetHours = SLA_TARGET_HOURS[ticket.priority];
  const targetMs = targetHours * HOUR_MS;
  const created = ticket.createdAt.getTime();
  const dueAt = created + targetMs;

  const isDone = DONE_STATUSES.includes(ticket.status);
  const stoppedAt = isDone ? (ticket.resolvedAt ?? now).getTime() : now.getTime();
  const elapsedMs = Math.max(0, stoppedAt - created);
  const ratio = elapsedMs / targetMs;

  let state: SlaState;
  if (isDone) {
    state = elapsedMs <= targetMs ? 'MET' : 'MISSED';
  } else if (elapsedMs > targetMs) {
    state = 'BREACHED';
  } else if (ratio >= SLA_AT_RISK_RATIO) {
    state = 'AT_RISK';
  } else {
    state = 'ON_TRACK';
  }

  return {
    state,
    breached: state === 'BREACHED',
    targetHours,
    dueAt: new Date(dueAt).toISOString(),
    elapsedMs,
    remainingMs: dueAt - stoppedAt,
    ratio: Math.round(ratio * 1000) / 1000,
  };
}
