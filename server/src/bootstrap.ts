import { rmSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { SCHEMA_STATEMENTS } from './generated/schema-sql';
import { seedDatabase } from './seed';

/**
 * Creates a brand-new SQLite database file with the schema applied and demo
 * data seeded. Used by the Netlify Function (which can only write to /tmp) and
 * by the API tests.
 */
export async function createFreshDatabase(filePath: string, options: { seed?: boolean } = {}) {
  for (const suffix of ['', '-journal']) rmSync(filePath + suffix, { force: true });
  const prisma = new PrismaClient({ datasourceUrl: `file:${filePath}` });
  for (const statement of SCHEMA_STATEMENTS) {
    await prisma.$executeRawUnsafe(statement);
  }
  if (options.seed ?? true) await seedDatabase(prisma);
  return prisma;
}
