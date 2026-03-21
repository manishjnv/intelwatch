import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.TI_NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
