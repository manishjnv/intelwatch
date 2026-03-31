/**
 * @module routes/public/stats
 * @description Public API IOC stats summary — aggregated counts by type, severity, TLP, lifecycle.
 * Auth: API key (ioc:read scope). TLP:RED always excluded.
 * Useful for: Sentinel dashboard widgets, client reporting, feed health monitoring.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PublicIocStatsDto } from '@etip/shared-types';
import { prisma } from '../../prisma.js';
import { apiKeyAuth } from '../../plugins/api-key-auth.js';
import { getUser } from '../../plugins/auth.js';

export async function publicStatsRoutes(app: FastifyInstance): Promise<void> {
  const auth = apiKeyAuth('ioc:read');

  // ── GET /stats — IOC aggregate stats ─────────────────────────────
  app.get('/stats', {
    schema: { tags: ['Stats'], summary: 'Aggregate IOC statistics by type, severity, TLP, lifecycle' },
    preHandler: [auth],
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);

    const baseWhere = {
      tenantId: user.tenantId,
      tlp: { not: 'red' as const },
      archivedAt: null,
    };

    const [total, byType, bySeverity, byTlp, byLifecycle, lastUpdatedRow] = await Promise.all([
      prisma.ioc.count({ where: baseWhere }),
      prisma.ioc.groupBy({ by: ['iocType'], where: baseWhere, _count: true }),
      prisma.ioc.groupBy({ by: ['severity'], where: baseWhere, _count: true }),
      prisma.ioc.groupBy({ by: ['tlp'], where: baseWhere, _count: true }),
      prisma.ioc.groupBy({ by: ['lifecycle'], where: baseWhere, _count: true }),
      prisma.ioc.findFirst({
        where: baseWhere,
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true },
      }),
    ]);

    const toMap = <T extends { _count: number }>(rows: T[], key: keyof T): Record<string, number> =>
      Object.fromEntries(rows.map((r) => [String(r[key]), r._count]));

    const result: PublicIocStatsDto = {
      total,
      byType: toMap(byType, 'iocType'),
      bySeverity: toMap(bySeverity, 'severity'),
      byTlp: toMap(byTlp, 'tlp'),
      byLifecycle: toMap(byLifecycle, 'lifecycle'),
      lastUpdated: lastUpdatedRow?.updatedAt?.toISOString() ?? null,
    };

    return reply.send({ data: result });
  });
}
