import { PrismaClient } from '@prisma/client';
import { createApp } from './app';

const prisma = new PrismaClient();
const port = Number(process.env.PORT ?? 4000);

createApp(prisma, { allowDemoReset: true }).listen(port, () => {
  console.log(`Beacon API listening on http://localhost:${port}/api`);
});
