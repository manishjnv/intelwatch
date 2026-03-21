import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as typeof globalThis & {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env['TI_NODE_ENV'] === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });

if (process.env['TI_NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** Disconnects the Prisma client gracefully. */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
