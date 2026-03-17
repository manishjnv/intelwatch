/**
 * @module @etip/user-service/prisma
 * @description Prisma client singleton.
 * Ensures a single PrismaClient instance across the application.
 * In development, stores on globalThis to survive HMR reloads.
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as typeof globalThis & {
  prisma: PrismaClient | undefined;
};

/**
 * Singleton Prisma client.
 * - In development: reuses across HMR reloads via globalThis
 * - In production: creates a single instance
 */
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

/**
 * Disconnect Prisma on shutdown.
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
