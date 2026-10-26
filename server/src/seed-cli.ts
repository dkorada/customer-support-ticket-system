import { PrismaClient } from '@prisma/client';
import { seedDatabase } from './seed';

const prisma = new PrismaClient();

seedDatabase(prisma)
  .then(({ users, tickets }) => console.log(`Seeded ${users} users and ${tickets} tickets.`))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
