import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as typeof globalThis & {
  umsPrisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.umsPrisma ??
  new PrismaClient({
    log:
      process.env['TI_NODE_ENV'] === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });

if (process.env['TI_NODE_ENV'] !== 'production') {
  globalForPrisma.umsPrisma = prisma;
}
