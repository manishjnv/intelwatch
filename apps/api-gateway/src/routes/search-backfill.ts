/**
 * @module search-backfill routes
 * @description S154/S155: one-shot (re-runnable) backfill that enqueues an
 *   `index` job for every existing tenant IOC row, so es-indexing-service
 *   can catch up the ~12k rows written before normalization produced jobs.
 *   POST /search/backfill — super_admin only.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Queue } from 'bullmq';
import { withRls } from '@etip/shared-auth';
import { AppError, QUEUES, toIocDocument, iocIndexJobId, IOC_INDEX_JOB_OPTIONS, type IocRow } from '@etip/shared-utils';
import { authenticate, getUser } from '../plugins/auth.js';
import { prisma } from '../prisma.js';

const PAGE_SIZE = 500;

const BackfillBodySchema = z.object({
  tenantId: z.string().uuid().optional(),
  dryRun: z.boolean().default(false),
}).strict();

interface TenantResult { tenantId: string; dbCount: number; enqueued: number; skipped: number; }

let queue: Queue | null = null;
/** Lazily created so tests can mock `bullmq` before the route registers. */
function getQueue(): Queue {
  if (!queue) {
    const redisUrl = process.env['TI_REDIS_URL'];
    if (!redisUrl) throw new AppError(500, 'TI_REDIS_URL is not set', 'CONFIG_ERROR');
    const url = new URL(redisUrl);
    queue = new Queue(QUEUES.IOC_INDEX, {
      connection: {
        host: url.hostname,
        port: Number(url.port) || 6379,
        password: decodeURIComponent(url.password || '') || undefined,
        maxRetriesPerRequest: null,
      },
    });
  }
  return queue;
}

/** Runs the backfill for one tenant, paging 500 rows at a time. */
async function backfillTenant(tenantId: string, dryRun: boolean, log: FastifyRequest['log']): Promise<TenantResult> {
  const result: TenantResult = { tenantId, dbCount: 0, enqueued: 0, skipped: 0 };
  let cursor: string | undefined;

  for (;;) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: IocRow[] = await withRls(prisma as any, { tenantId, isSuperAdmin: false }, (tx) => {
      const client = tx as { ioc: { findMany: (args: Record<string, unknown>) => Promise<IocRow[]> } };
      return client.ioc.findMany({
        where: { tenantId },
        orderBy: { id: 'asc' },
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
    });

    if (rows.length === 0) break;
    result.dbCount += rows.length;

    const jobs: Array<{ name: string; data: Record<string, unknown>; opts: Record<string, unknown> }> = [];
    for (const row of rows) {
      try {
        const payload = toIocDocument(row);
        jobs.push({
          name: 'ioc-index',
          data: { action: 'index', iocId: row.id, tenantId, payload },
          opts: { ...IOC_INDEX_JOB_OPTIONS, jobId: iocIndexJobId('index', row.id, row.updatedAt) },
        });
      } catch (err) {
        result.skipped += 1;
        log.warn({ iocId: row.id, err: err instanceof Error ? err.message : String(err) }, 'search-backfill: skipped row failing toIocDocument');
      }
    }

    if (!dryRun && jobs.length > 0) {
      await getQueue().addBulk(jobs);
      result.enqueued += jobs.length;
    }

    cursor = rows[rows.length - 1]!.id;
    if (rows.length < PAGE_SIZE) break;
  }

  return result;
}

export async function searchBackfillRoutes(app: FastifyInstance): Promise<void> {
  app.post('/search/backfill', { preHandler: [authenticate] }, async (req) => {
    const user = getUser(req);
    if (user.role !== 'super_admin') {
      throw new AppError(403, 'Only super_admin may run the search backfill', 'FORBIDDEN');
    }
    const body = BackfillBodySchema.parse(req.body ?? {});

    let tenants: Array<{ id: string }>;
    if (body.tenantId) {
      const tenant = await prisma.tenant.findUnique({ where: { id: body.tenantId } });
      if (!tenant || tenant.offboardedAt != null) {
        throw new AppError(404, 'Tenant not found or offboarded', 'TENANT_NOT_FOUND');
      }
      tenants = [{ id: tenant.id }];
    } else {
      tenants = await prisma.tenant.findMany({ where: { offboardedAt: null }, select: { id: true } });
    }

    const tenantResults: TenantResult[] = [];
    for (const t of tenants) {
      tenantResults.push(await backfillTenant(t.id, body.dryRun, req.log));
    }

    const totals = tenantResults.reduce(
      (acc, r) => ({ dbCount: acc.dbCount + r.dbCount, enqueued: acc.enqueued + r.enqueued, skipped: acc.skipped + r.skipped }),
      { dbCount: 0, enqueued: 0, skipped: 0 },
    );

    try {
      const { AuditLogger } = await import('@etip/user-service');
      new AuditLogger().log({
        tenantId: user.tenantId,
        userId: user.sub,
        action: 'search.backfill',
        riskLevel: 'medium',
        details: { dryRun: body.dryRun, tenantId: body.tenantId ?? null, totals },
      });
    } catch {
      // audit failure must not fail the request
    }

    return { data: { dryRun: body.dryRun, tenants: tenantResults, totals } };
  });

  app.addHook('onClose', async () => {
    if (queue) await queue.close().catch(() => {});
    queue = null;
  });
}
