import { describe, expect, it } from 'vitest';
import { STATUSES, type Status } from '../src/domain/constants';
import {
  TRANSITIONS,
  WorkflowError,
  assertAssignment,
  assertCanReply,
  assertTransition,
  canTransition,
  resolvedAtAfter,
  statusAfterCustomerReply,
} from '../src/domain/workflow';

const VALID: [Status, Status][] = [
  ['OPEN', 'IN_PROGRESS'],
  ['OPEN', 'CLOSED'],
  ['IN_PROGRESS', 'WAITING_FOR_CUSTOMER'],
  ['IN_PROGRESS', 'RESOLVED'],
  ['IN_PROGRESS', 'OPEN'],
  ['WAITING_FOR_CUSTOMER', 'IN_PROGRESS'],
  ['WAITING_FOR_CUSTOMER', 'RESOLVED'],
  ['WAITING_FOR_CUSTOMER', 'CLOSED'],
  ['RESOLVED', 'IN_PROGRESS'],
  ['RESOLVED', 'CLOSED'],
];

const isValid = (from: Status, to: Status) => VALID.some(([f, t]) => f === from && t === to);

function errorCode(fn: () => void): string | undefined {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(WorkflowError);
    return (err as WorkflowError).code;
  }
  return undefined;
}

describe('status transitions', () => {
  it('defines exactly the documented transitions', () => {
    const defined = Object.entries(TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => [from, to]));
    expect(defined.sort()).toEqual([...VALID].sort());
  });

  // Exhaustive: every (from, to) pair in the 5×5 status matrix.
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      if (from === to) continue;
      const expected = isValid(from, to);
      it(`${from} → ${to} is ${expected ? 'allowed' : 'rejected'}`, () => {
        expect(canTransition(from, to)).toBe(expected);
        const code = errorCode(() => assertTransition({ status: from, assigneeId: 'agent-1' }, to));
        expect(code).toBe(expected ? undefined : 'INVALID_TRANSITION');
      });
    }
  }

  it('rejects moving to the same status', () => {
    for (const s of STATUSES) {
      expect(errorCode(() => assertTransition({ status: s, assigneeId: 'agent-1' }, s))).toBe('NO_OP');
    }
  });

  it('treats CLOSED as final', () => {
    expect(TRANSITIONS.CLOSED).toEqual([]);
    expect(() => assertTransition({ status: 'CLOSED', assigneeId: 'a' }, 'OPEN')).toThrow(/final status/);
  });

  it('requires an assignee before work can start', () => {
    expect(errorCode(() => assertTransition({ status: 'OPEN', assigneeId: null }, 'IN_PROGRESS'))).toBe(
      'ASSIGNEE_REQUIRED',
    );
    expect(errorCode(() => assertTransition({ status: 'RESOLVED', assigneeId: null }, 'IN_PROGRESS'))).toBe(
      'ASSIGNEE_REQUIRED',
    );
    // Closing does not need an assignee (e.g. spam or duplicates).
    expect(errorCode(() => assertTransition({ status: 'OPEN', assigneeId: null }, 'CLOSED'))).toBeUndefined();
  });
});

describe('assignment rules', () => {
  it('allows assigning and reassigning in any non-final status', () => {
    for (const status of ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED'] as const) {
      expect(errorCode(() => assertAssignment({ status, assigneeId: 'a' }, 'b'))).toBeUndefined();
    }
  });

  it('only allows unassigning OPEN tickets', () => {
    expect(errorCode(() => assertAssignment({ status: 'OPEN', assigneeId: 'a' }, null))).toBeUndefined();
    for (const status of ['IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED'] as const) {
      expect(errorCode(() => assertAssignment({ status, assigneeId: 'a' }, null))).toBe('ASSIGNEE_REQUIRED');
    }
  });

  it('rejects reassigning closed tickets and no-op assignments', () => {
    expect(errorCode(() => assertAssignment({ status: 'CLOSED', assigneeId: 'a' }, 'b'))).toBe('TICKET_CLOSED');
    expect(errorCode(() => assertAssignment({ status: 'OPEN', assigneeId: 'a' }, 'a'))).toBe('NO_OP');
    expect(errorCode(() => assertAssignment({ status: 'OPEN', assigneeId: null }, null))).toBe('NO_OP');
  });
});

describe('replies', () => {
  it('are blocked only on closed tickets', () => {
    for (const status of STATUSES) {
      const code = errorCode(() => assertCanReply({ status, assigneeId: 'a' }));
      expect(code).toBe(status === 'CLOSED' ? 'TICKET_CLOSED' : undefined);
    }
  });

  it('a customer reply moves waiting/resolved tickets back to IN_PROGRESS', () => {
    expect(statusAfterCustomerReply({ status: 'WAITING_FOR_CUSTOMER', assigneeId: 'a' })).toBe('IN_PROGRESS');
    expect(statusAfterCustomerReply({ status: 'RESOLVED', assigneeId: 'a' })).toBe('IN_PROGRESS');
    expect(statusAfterCustomerReply({ status: 'OPEN', assigneeId: null })).toBeNull();
    expect(statusAfterCustomerReply({ status: 'IN_PROGRESS', assigneeId: 'a' })).toBeNull();
  });
});

describe('resolvedAt (SLA clock stop)', () => {
  const now = new Date('2026-01-01T12:00:00Z');
  const earlier = new Date('2026-01-01T10:00:00Z');

  it('is set when a ticket is resolved or closed', () => {
    expect(resolvedAtAfter('RESOLVED', null, now)).toEqual(now);
    expect(resolvedAtAfter('CLOSED', null, now)).toEqual(now);
  });

  it('keeps the original resolution time when a resolved ticket is closed', () => {
    expect(resolvedAtAfter('CLOSED', earlier, now)).toEqual(earlier);
  });

  it('is cleared when a ticket is reopened', () => {
    expect(resolvedAtAfter('IN_PROGRESS', earlier, now)).toBeNull();
  });
});
