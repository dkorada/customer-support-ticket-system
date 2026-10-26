import serverless from 'serverless-http';
import { createApp } from '../../server/src/app';
import { createFreshDatabase } from '../../server/src/bootstrap';

/**
 * The whole Express API runs as one Netlify Function. Netlify's filesystem is
 * read-only except /tmp, so each function instance creates its own SQLite
 * database there on cold start and seeds it with fresh demo data.
 */
const DB_PATH = '/tmp/beacon-support.db';

let handlerPromise: Promise<serverless.Handler> | undefined;

async function init() {
  const prisma = await createFreshDatabase(DB_PATH);
  return serverless(createApp(prisma, { allowDemoReset: true }));
}

export const handler: serverless.Handler = async (event, context) => {
  handlerPromise ??= init().catch((err) => {
    handlerPromise = undefined;
    throw err;
  });
  const handle = await handlerPromise;
  return handle(event, context);
};
