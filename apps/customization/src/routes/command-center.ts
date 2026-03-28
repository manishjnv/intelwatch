/**
 * @module command-center-routes
 * @description API routes for Command Center dashboard queries.
 * Prefix: /api/v1/customization/command-center
 *
 * Routes:
 *   GET /global-stats      — Total cost, items processed (super_admin)
 *   GET /tenant-stats      — Tenant's consumption + attributed cost (tenant_admin)
 *   GET /tenant-list       — All tenants with consumption (super_admin)
 *   GET /queue-stats       — Pending items, processing rate (super_admin)
 *   POST /consumption      — Record item consumption (internal)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z, ZodError } from 'zod';
import { AppError } from '@etip/shared-utils';
import type { CommandCenterQueries, DateRange } from '../services/command-center-queries.js';
import type { ConsumptionTracker } from '../services/consumption-tracker.js';

/** Safe Zod parse that throws AppError(400) on failure */
function safeParse<T>(schema: z.ZodType<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new AppError(400, 'Validation failed', 'VALIDATION_ERROR', err.issues);
    }
    throw err;
  }
}

const PeriodSchema = z.enum(['day', 'week', 'month']).default('month');

const ConsumptionBodySchema = z.object({
  tenantId: z.string().min(1),
  itemId: z.string().min(1),
  itemType: z.enum(['article', 'ioc', 'report']),
});

const ConsumptionBatchSchema = z.object({
  records: z.array(ConsumptionBodySchema).min(1).max(100),
});

export interface CommandCenterRouteDeps {
  queries: CommandCenterQueries;
  consumptionTracker: ConsumptionTracker;
}

/** Parse period query param into a date range */
function parsePeriod(period: string): DateRange {
  const until = new Date();
  const since = new Date();

  switch (period) {
    case 'day':
      since.setDate(since.getDate() - 1);
      break;
    case 'week':
      since.setDate(since.getDate() - 7);
      break;
    case 'month':
    default:
      since.setMonth(since.getMonth() - 1);
      break;
  }

  return { since, until };
}

function requireSuperAdmin(req: FastifyRequest): void {
  const role = (req.headers['x-user-role'] as string) ?? '';
  if (role !== 'super_admin') {
    throw new AppError(403, 'Super admin access required', 'FORBIDDEN');
  }
}

function getTenantId(req: FastifyRequest): string {
  const tenantId = (req.headers['x-tenant-id'] as string) ?? '';
  if (!tenantId) {
    throw new AppError(400, 'Missing x-tenant-id header', 'MISSING_TENANT');
  }
  return tenantId;
}

export function commandCenterRoutes(deps: CommandCenterRouteDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    const { queries, consumptionTracker } = deps;

    /** GET /global-stats — Global processing costs (super-admin) */
    app.get<{ Querystring: { period?: string } }>(
      '/global-stats',
      async (req, reply) => {
        requireSuperAdmin(req);
        const period = safeParse(PeriodSchema, req.query.period ?? 'month');
        const range = parsePeriod(period as string);

        const stats = await queries.getGlobalStats(range);
        return reply.send({ data: stats });
      },
    );

    /** GET /tenant-stats — Tenant's own consumption (tenant-admin) */
    app.get<{ Querystring: { period?: string } }>(
      '/tenant-stats',
      async (req, reply) => {
        const tenantId = getTenantId(req);
        const period = safeParse(PeriodSchema, req.query.period ?? 'month');
        const range = parsePeriod(period as string);

        const stats = await queries.getTenantStats(tenantId, range);
        return reply.send({ data: stats });
      },
    );

    /** GET /tenant-list — All tenants with consumption (super-admin) */
    app.get<{ Querystring: { period?: string } }>(
      '/tenant-list',
      async (req, reply) => {
        requireSuperAdmin(req);
        const period = safeParse(PeriodSchema, req.query.period ?? 'month');
        const range = parsePeriod(period as string);

        const list = await queries.getTenantList(range);
        return reply.send({ data: list, total: list.length });
      },
    );

    /** GET /queue-stats — Queue depth + processing rate (super-admin) */
    app.get('/queue-stats', async (req, reply) => {
      requireSuperAdmin(req);

      // Queue stats from admin-service — for now, return from local AI processing costs
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentCount = await (deps.queries as any)['prisma'].aiProcessingCost.count({
        where: { processedAt: { gte: oneHourAgo } },
      }).catch(() => 0);

      return reply.send({
        data: {
          pendingItems: 0,
          processingRate: Math.round(recentCount / 60), // items per minute
          bySubtask: {},
        },
      });
    });

    /** POST /consumption — Record item consumption (service-to-service) */
    app.post('/consumption', async (req: FastifyRequest, reply: FastifyReply) => {
      const body = safeParse(ConsumptionBodySchema, req.body);
      const isNew = await consumptionTracker.trackConsumption(body);
      return reply.status(isNew ? 201 : 200).send({ data: { recorded: isNew } });
    });

    /** POST /consumption/batch — Batch record consumption */
    app.post('/consumption/batch', async (req: FastifyRequest, reply: FastifyReply) => {
      const body = safeParse(ConsumptionBatchSchema, req.body);
      const created = await consumptionTracker.trackBatch(body.records);
      return reply.send({ data: { created, total: body.records.length } });
    });
  };
}
