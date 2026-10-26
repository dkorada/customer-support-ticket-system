import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { PrismaClient, User } from '@prisma/client';
import { z } from 'zod';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  STATUSES,
  STATUS_LABELS,
} from './domain/constants';
import { SLA_AT_RISK_RATIO, SLA_TARGET_HOURS } from './domain/sla';
import { TRANSITIONS, WorkflowError } from './domain/workflow';
import { HttpError } from './errors';
import { seedDatabase } from './seed';
import {
  addReply,
  assignTicket,
  changeStatus,
  createTicket,
  getStats,
  getTicketDetail,
  listTickets,
} from './services/tickets';

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

const csv = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : undefined))
    .pipe(z.array(z.enum(values)).optional());

const listQuery = z.object({
  status: csv(STATUSES),
  priority: csv(PRIORITIES),
  sla: csv(['ON_TRACK', 'AT_RISK', 'BREACHED', 'MET', 'MISSED'] as const),
  assignee: z.string().optional(),
  q: z.string().max(200).optional(),
  sort: z.enum(['sla', 'newest', 'oldest', 'priority', 'updated']).optional(),
});

const createBody = z.object({
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters.').max(160),
  description: z.string().trim().min(10, 'Please describe the issue in at least 10 characters.').max(5000),
  priority: z.enum(PRIORITIES),
  category: z.enum(CATEGORIES),
});

const statusBody = z.object({ status: z.enum(STATUSES) });
const assignBody = z.object({ assigneeId: z.string().min(1).nullable() });
const replyBody = z.object({
  body: z.string().trim().min(1, 'Reply cannot be empty.').max(5000),
  internal: z.boolean().optional(),
  status: z.enum(STATUSES).optional(),
});

export interface AppOptions {
  /** Allow POST /api/demo/reset (enabled for the hosted demo and local dev). */
  allowDemoReset?: boolean;
}

export function createApp(prisma: PrismaClient, options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();

  api.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Workflow metadata, so the UI renders exactly the rules the server enforces.
  api.get('/meta', (_req, res) => {
    res.json({
      statuses: STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
      priorities: PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value], slaHours: SLA_TARGET_HOURS[value] })),
      categories: CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })),
      transitions: TRANSITIONS,
      slaAtRiskRatio: SLA_AT_RISK_RATIO,
    });
  });

  // Demo sign-in: the persona list is public so the login screen can show it.
  api.get('/users', async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, email: true, role: true, title: true, company: true },
    });
    res.json(users);
  });

  // Everything below requires a signed-in user (X-User-Id header).
  api.use(async (req: Request, _res: Response, next: NextFunction) => {
    const id = req.header('x-user-id');
    if (!id) return next(new HttpError(401, 'Sign in to continue.', 'UNAUTHENTICATED'));
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return next(new HttpError(401, 'Your session has expired. Please sign in again.', 'UNAUTHENTICATED'));
    req.user = user;
    next();
  });

  api.get('/me', (req, res) => {
    const { id, name, email, role, title, company } = req.user!;
    res.json({ id, name, email, role, title, company });
  });

  api.get('/agents', async (_req, res) => {
    res.json(
      await prisma.user.findMany({
        where: { role: 'AGENT' },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, email: true, role: true, title: true, company: true },
      }),
    );
  });

  api.get('/stats', async (req, res) => {
    res.json(await getStats(prisma, req.user!));
  });

  api.get('/tickets', async (req, res) => {
    res.json(await listTickets(prisma, req.user!, listQuery.parse(req.query)));
  });

  api.post('/tickets', async (req, res) => {
    res.status(201).json(await createTicket(prisma, req.user!, createBody.parse(req.body)));
  });

  api.get('/tickets/:id', async (req, res) => {
    res.json(await getTicketDetail(prisma, req.params.id, req.user!));
  });

  api.patch('/tickets/:id/status', async (req, res) => {
    res.json(await changeStatus(prisma, req.user!, req.params.id, statusBody.parse(req.body).status));
  });

  api.patch('/tickets/:id/assignee', async (req, res) => {
    res.json(await assignTicket(prisma, req.user!, req.params.id, assignBody.parse(req.body).assigneeId));
  });

  api.post('/tickets/:id/replies', async (req, res) => {
    res.status(201).json(await addReply(prisma, req.user!, req.params.id, replyBody.parse(req.body)));
  });

  api.post('/demo/reset', async (req, res) => {
    if (!options.allowDemoReset) throw new HttpError(404, 'Not found.', 'NOT_FOUND');
    if (req.user!.role !== 'AGENT') throw new HttpError(403, 'Only agents can reset the demo.', 'FORBIDDEN');
    await seedDatabase(prisma);
    res.json({ ok: true });
  });

  // Mounted at both paths so the same app works locally and behind the Netlify Functions redirect.
  app.use('/api', api);
  app.use('/.netlify/functions/api', api);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      const issue = err.issues[0];
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: issue?.message ?? 'Invalid request.', issues: err.issues },
      });
      return;
    }
    if (err instanceof WorkflowError) {
      res.status(409).json({ error: { code: err.code, message: err.message } });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
  });

  return app;
}
