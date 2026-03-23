import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ZodType } from 'zod';
import { AppError } from '@etip/shared-utils';
import { TrackUsageSchema } from '../schemas/billing.js';
import type { UsageStore } from '../services/usage-store.js';
import type { PlanStore } from '../services/plan-store.js';
import { PLAN_DEFINITIONS } from '../services/plan-store.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validate<S extends ZodType<any, any, any>>(schema: S, data: unknown): ReturnType<S['parse']> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError(400, 'Request validation failed', 'VALIDATION_ERROR', details);
  }
  return result.data;
}

export interface UsageRouteDeps {
  usageStore: UsageStore;
  planStore: PlanStore;
}

/** Usage metering routes: track, get current, limits, history. */
export function usageRoutes(deps: UsageRouteDeps) {
  const { usageStore, planStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /usage — current usage counters for the tenant. */
    app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const usage = usageStore.getUsage(tenantId);
      return reply.send({ data: usage });
    });

    /** POST /usage/track — internal: track a usage event. */
    app.post('/track', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const { metric, count } = validate(TrackUsageSchema, req.body);
      const usage = usageStore.trackUsage(tenantId, metric, count);
      return reply.status(201).send({ data: usage });
    });

    /** GET /usage/limits — plan limits vs current usage with % utilisation. */
    app.get('/limits', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const state = planStore.getTenantPlan(tenantId);
      const planDef = PLAN_DEFINITIONS[state.planId];
      const usage = usageStore.getUsage(tenantId);

      const limits = planDef.limits;
      const metrics = {
        api_calls: {
          used: usage.api_calls,
          limit: limits.iocQueriesPerDay,
          percent: usageStore.getUsagePercent(tenantId, 'api_calls', limits.iocQueriesPerDay),
          unlimited: limits.iocQueriesPerDay === -1,
        },
        iocs_ingested: {
          used: usage.iocs_ingested,
          limit: limits.iocStorageK * 1000,
          percent: usageStore.getUsagePercent(tenantId, 'iocs_ingested', limits.iocStorageK * 1000),
          unlimited: limits.iocStorageK === -1,
        },
        enrichments: {
          used: usage.enrichments,
          limit: limits.enrichmentsPerDay,
          percent: usageStore.getUsagePercent(tenantId, 'enrichments', limits.enrichmentsPerDay),
          unlimited: limits.enrichmentsPerDay === -1,
        },
        storage_kb: {
          used: usage.storage_kb,
          limit: limits.iocStorageK * 1024,
          percent: usageStore.getUsagePercent(tenantId, 'storage_kb', limits.iocStorageK * 1024),
          unlimited: limits.iocStorageK === -1,
        },
      };

      return reply.send({ data: { planId: state.planId, metrics } });
    });

    /** GET /usage/history — usage snapshots for the past 30 days. */
    app.get('/history', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const history = usageStore.getUsageHistory(tenantId, 30);
      return reply.send({ data: history });
    });
  };
}
