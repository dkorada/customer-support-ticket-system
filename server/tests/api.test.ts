import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createFreshDatabase } from '../src/bootstrap';

const DB = join(tmpdir(), `beacon-api-test-${process.pid}.db`);
let prisma: PrismaClient;
let app: ReturnType<typeof createApp>;

const as = (userId: string) => ({ 'x-user-id': userId });
const AGENT = as('agent-maya');
const SARAH = as('customer-sarah');
const OMAR = as('customer-omar');

beforeEach(async () => {
  await prisma?.$disconnect();
  prisma = await createFreshDatabase(DB);
  app = createApp(prisma, { allowDemoReset: true });
});

afterAll(async () => {
  await prisma?.$disconnect();
});

async function newTicket(headers = SARAH) {
  const res = await request(app)
    .post('/api/tickets')
    .set(headers)
    .send({ subject: 'Cannot log in', description: 'The login page spins forever.', priority: 'HIGH', category: 'ACCOUNT' });
  expect(res.status).toBe(201);
  return res.body.ticket.id as string;
}

describe('authentication and visibility', () => {
  it('requires a user', async () => {
    expect((await request(app).get('/api/tickets')).status).toBe(401);
  });

  it('customers only see their own tickets', async () => {
    const res = await request(app).get('/api/tickets').set(SARAH);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((t: { customer: { id: string } }) => t.customer.id === 'customer-sarah')).toBe(true);
  });

  it("returns 404 for another customer's ticket", async () => {
    const id = await newTicket(SARAH);
    expect((await request(app).get(`/api/tickets/${id}`).set(OMAR)).status).toBe(404);
    expect((await request(app).get(`/api/tickets/${id}`).set(SARAH)).status).toBe(200);
  });

  it('hides internal notes from customers', async () => {
    const id = await newTicket();
    await request(app).post(`/api/tickets/${id}/replies`).set(AGENT).send({ body: 'Secret note', internal: true });
    const agentView = await request(app).get(`/api/tickets/${id}`).set(AGENT);
    const customerView = await request(app).get(`/api/tickets/${id}`).set(SARAH);
    expect(agentView.body.timeline.some((e: { type: string }) => e.type === 'NOTE')).toBe(true);
    expect(customerView.body.timeline.some((e: { type: string }) => e.type === 'NOTE')).toBe(false);
  });

  it('customers cannot change status or assignment', async () => {
    const id = await newTicket();
    expect((await request(app).patch(`/api/tickets/${id}/status`).set(SARAH).send({ status: 'CLOSED' })).status).toBe(403);
    expect(
      (await request(app).patch(`/api/tickets/${id}/assignee`).set(SARAH).send({ assigneeId: 'agent-maya' })).status,
    ).toBe(403);
  });
});

describe('status workflow over the API', () => {
  it('runs a full lifecycle and records every step in the timeline', async () => {
    const id = await newTicket();
    const patch = (path: string, body: object) => request(app).patch(`/api/tickets/${id}/${path}`).set(AGENT).send(body);

    expect((await patch('assignee', { assigneeId: 'agent-maya' })).status).toBe(200);
    expect((await patch('status', { status: 'IN_PROGRESS' })).status).toBe(200);
    const reply = await request(app)
      .post(`/api/tickets/${id}/replies`)
      .set(AGENT)
      .send({ body: 'Can you try clearing cookies?', status: 'WAITING_FOR_CUSTOMER' });
    expect(reply.body.ticket.status).toBe('WAITING_FOR_CUSTOMER');

    // The customer's answer hands the ticket back to the agent automatically.
    const answer = await request(app).post(`/api/tickets/${id}/replies`).set(SARAH).send({ body: 'That fixed it!' });
    expect(answer.body.ticket.status).toBe('IN_PROGRESS');

    const resolved = await patch('status', { status: 'RESOLVED' });
    expect(resolved.body.ticket.status).toBe('RESOLVED');
    expect(resolved.body.ticket.resolvedAt).not.toBeNull();
    expect(resolved.body.ticket.sla.state).toBe('MET');

    const closed = await patch('status', { status: 'CLOSED' });
    expect(closed.body.ticket.allowedTransitions).toEqual([]);

    const types = closed.body.timeline.map((e: { type: string; toValue: string | null }) =>
      e.type === 'STATUS_CHANGED' ? `STATUS:${e.toValue}` : e.type,
    );
    expect(types).toEqual([
      'CREATED',
      'ASSIGNED',
      'STATUS:IN_PROGRESS',
      'REPLY',
      'STATUS:WAITING_FOR_CUSTOMER',
      'REPLY',
      'STATUS:IN_PROGRESS',
      'STATUS:RESOLVED',
      'STATUS:CLOSED',
    ]);
  });

  it('rejects invalid transitions with 409 and leaves the ticket unchanged', async () => {
    const id = await newTicket();
    const res = await request(app).patch(`/api/tickets/${id}/status`).set(AGENT).send({ status: 'RESOLVED' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    const detail = await request(app).get(`/api/tickets/${id}`).set(AGENT);
    expect(detail.body.ticket.status).toBe('OPEN');
    expect(detail.body.timeline).toHaveLength(1);
  });

  it('requires an assignee to start work', async () => {
    const id = await newTicket();
    const res = await request(app).patch(`/api/tickets/${id}/status`).set(AGENT).send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ASSIGNEE_REQUIRED');
  });

  it('does not save a reply when its status change is invalid', async () => {
    const id = await newTicket();
    const res = await request(app)
      .post(`/api/tickets/${id}/replies`)
      .set(AGENT)
      .send({ body: 'Hello', status: 'RESOLVED' });
    expect(res.status).toBe(409);
    const detail = await request(app).get(`/api/tickets/${id}`).set(AGENT);
    expect(detail.body.timeline).toHaveLength(1);
  });

  it('blocks replies on closed tickets', async () => {
    const id = await newTicket();
    await request(app).patch(`/api/tickets/${id}/status`).set(AGENT).send({ status: 'CLOSED' });
    const res = await request(app).post(`/api/tickets/${id}/replies`).set(SARAH).send({ body: 'Hello?' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TICKET_CLOSED');
  });

  it('only assigns tickets to agents', async () => {
    const id = await newTicket();
    const res = await request(app).patch(`/api/tickets/${id}/assignee`).set(AGENT).send({ assigneeId: 'customer-omar' });
    expect(res.status).toBe(400);
  });
});

describe('filters', () => {
  it('filters by status, priority and assignee', async () => {
    const res = await request(app).get('/api/tickets?status=OPEN,IN_PROGRESS&priority=HIGH').set(AGENT);
    expect(res.body.length).toBeGreaterThan(0);
    for (const t of res.body) {
      expect(['OPEN', 'IN_PROGRESS']).toContain(t.status);
      expect(t.priority).toBe('HIGH');
    }
    const unassigned = await request(app).get('/api/tickets?assignee=unassigned').set(AGENT);
    expect(unassigned.body.every((t: { assignee: unknown }) => t.assignee === null)).toBe(true);
    const daniel = await request(app).get('/api/tickets?assignee=agent-daniel').set(AGENT);
    expect(daniel.body.length).toBeGreaterThan(0);
    expect(daniel.body.every((t: { assignee: { id: string } }) => t.assignee.id === 'agent-daniel')).toBe(true);
  });

  it('filters by SLA state and validates filter values', async () => {
    const breached = await request(app).get('/api/tickets?sla=BREACHED').set(AGENT);
    expect(breached.body.length).toBeGreaterThan(0);
    expect(breached.body.every((t: { sla: { breached: boolean } }) => t.sla.breached)).toBe(true);
    expect((await request(app).get('/api/tickets?status=NOPE').set(AGENT)).status).toBe(400);
  });
});

describe('seed data', () => {
  it('produces a realistic spread of statuses and SLA states', async () => {
    const stats = (await request(app).get('/api/stats').set(AGENT)).body;
    expect(stats.total).toBeGreaterThanOrEqual(20);
    for (const count of Object.values(stats.byStatus)) expect(count).toBeGreaterThan(0);
    expect(stats.breached).toBeGreaterThan(0);
    expect(stats.atRisk).toBeGreaterThan(0);
  });
});
