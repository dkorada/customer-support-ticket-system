import { describe, expect, it } from 'vitest';
import type { Priority, Status } from '../src/domain/constants';
import { SLA_TARGET_HOURS, computeSla } from '../src/domain/sla';

const NOW = new Date('2026-03-10T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const sla = (priority: Priority, ageHours: number, status: Status = 'OPEN', resolvedAfterHours?: number) =>
  computeSla(
    {
      priority,
      status,
      createdAt: hoursAgo(ageHours),
      resolvedAt: resolvedAfterHours === undefined ? null : hoursAgo(ageHours - resolvedAfterHours),
    },
    NOW,
  );

describe('SLA targets', () => {
  it('uses 4h / 24h / 72h for high / medium / low', () => {
    expect(SLA_TARGET_HOURS).toEqual({ HIGH: 4, MEDIUM: 24, LOW: 72 });
  });

  it('computes the due date from creation time and priority', () => {
    expect(sla('HIGH', 1).dueAt).toBe(new Date(hoursAgo(1).getTime() + 4 * 3_600_000).toISOString());
    expect(sla('LOW', 1).targetHours).toBe(72);
  });
});

describe('SLA flags for active tickets', () => {
  it.each([
    ['HIGH', 3.9, 'AT_RISK'],
    ['HIGH', 4.01, 'BREACHED'],
    ['HIGH', 1, 'ON_TRACK'],
    ['MEDIUM', 23, 'AT_RISK'],
    ['MEDIUM', 25, 'BREACHED'],
    ['MEDIUM', 10, 'ON_TRACK'],
    ['LOW', 71, 'AT_RISK'],
    ['LOW', 73, 'BREACHED'],
    ['LOW', 30, 'ON_TRACK'],
  ] as const)('%s ticket aged %sh is %s', (priority, age, expected) => {
    const result = sla(priority, age);
    expect(result.state).toBe(expected);
    expect(result.breached).toBe(expected === 'BREACHED');
  });

  it('is not breached at exactly the target', () => {
    expect(sla('HIGH', 4).state).toBe('AT_RISK');
  });

  it('flags "at risk" from 75% of the target', () => {
    expect(sla('HIGH', 2.99).state).toBe('ON_TRACK');
    expect(sla('HIGH', 3).state).toBe('AT_RISK');
  });

  it('applies to every active status', () => {
    for (const status of ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER'] as const) {
      expect(sla('HIGH', 6, status).state).toBe('BREACHED');
    }
  });

  it('reports remaining time, negative when overdue', () => {
    expect(sla('HIGH', 1).remainingMs).toBe(3 * 3_600_000);
    expect(sla('HIGH', 6).remainingMs).toBe(-2 * 3_600_000);
    expect(sla('HIGH', 2).ratio).toBe(0.5);
  });
});

describe('SLA for resolved and closed tickets', () => {
  it('stops the clock at resolution: MET within target', () => {
    const result = sla('HIGH', 100, 'RESOLVED', 3);
    expect(result.state).toBe('MET');
    expect(result.breached).toBe(false);
    expect(result.elapsedMs).toBe(3 * 3_600_000);
  });

  it('stops the clock at resolution: MISSED after target', () => {
    expect(sla('MEDIUM', 100, 'CLOSED', 30).state).toBe('MISSED');
    expect(sla('MEDIUM', 100, 'CLOSED', 30).breached).toBe(false);
  });

  it('is never flagged as breached once done, however old', () => {
    expect(sla('LOW', 1000, 'CLOSED', 10).state).toBe('MET');
  });
});
