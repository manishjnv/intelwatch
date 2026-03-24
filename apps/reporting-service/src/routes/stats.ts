import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ReportStore } from '../services/report-store.js';
import type { ScheduleStore } from '../services/schedule-store.js';

export interface StatsRouteDeps {
  reportStore: ReportStore;
  scheduleStore: ScheduleStore;
}

export function statsRoutes(deps: StatsRouteDeps) {
  const { reportStore, scheduleStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    // GET /api/v1/reports/stats — Report generation statistics
    app.get('/', async (req: FastifyRequest<{ Querystring: { tenantId?: string } }>, reply: FastifyReply) => {
      const tenantId = (req.query as { tenantId?: string }).tenantId;
      const reportStats = reportStore.getStats(tenantId);

      return reply.send({
        data: {
          reports: reportStats,
          schedules: {
            activeSchedules: scheduleStore.getActiveCount(),
          },
        },
      });
    });
  };
}
