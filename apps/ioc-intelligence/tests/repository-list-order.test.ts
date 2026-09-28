import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { IOCRepository } from '../src/repository.js';
import { ListIocsQuerySchema } from '../src/schemas/ioc.js';

function mockPrisma() {
  const findMany = vi.fn().mockReturnValue('findMany-query');
  const count = vi.fn().mockReturnValue('count-query');
  const groupBy = vi.fn();
  const prisma = {
    ioc: { findMany, count, groupBy },
    $transaction: vi.fn().mockResolvedValue([[], 0]),
  } as unknown as PrismaClient;
  return { prisma, findMany, groupBy };
}

describe('IOCRepository.findMany ordering', () => {
  it('adds an id tie-breaker so offset pages are stable when timestamps tie', async () => {
    const { prisma, findMany } = mockPrisma();
    const query = ListIocsQuerySchema.parse({ sort: 'updatedAt', order: 'asc', limit: '500', page: '2' });

    await new IOCRepository(prisma).findMany('11111111-1111-1111-1111-111111111111', query);

    const args = findMany.mock.calls[0]![0];
    expect(args.orderBy).toEqual([{ updatedAt: 'asc' }, { id: 'asc' }]);
    expect(args.skip).toBe(500);
    expect(args.take).toBe(500);
  });

  it('applies updatedSince as updatedAt >= instant', async () => {
    const { prisma, findMany } = mockPrisma();
    const query = ListIocsQuerySchema.parse({ updatedSince: '2026-09-28T00:00:00.000Z' });

    await new IOCRepository(prisma).findMany('11111111-1111-1111-1111-111111111111', query);

    expect(findMany.mock.calls[0]![0].where.updatedAt).toEqual({ gte: new Date('2026-09-28T00:00:00.000Z') });
  });
});

describe('IOCRepository.groupByTenant', () => {
  it('maps Prisma groupBy rows to tenant summaries', async () => {
    const { prisma, groupBy } = mockPrisma();
    const at = new Date('2026-09-28T01:00:00.000Z');
    groupBy.mockResolvedValue([{ tenantId: 't-1', _count: { _all: 42 }, _max: { updatedAt: at } }]);

    const rows = await new IOCRepository(prisma).groupByTenant();

    expect(rows).toEqual([{ tenantId: 't-1', iocCount: 42, lastUpdatedAt: at }]);
    expect(groupBy).toHaveBeenCalledWith({ by: ['tenantId'], _count: { _all: true }, _max: { updatedAt: true } });
  });
});
