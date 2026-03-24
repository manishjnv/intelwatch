import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { ScheduleStore } from '../services/schedule-store.js';
import {
  CreateScheduleSchema,
  UpdateScheduleSchema,
  BulkToggleSchedulesSchema,
  type CreateScheduleDto,
  type UpdateScheduleDto,
  type BulkToggleSchedulesDto,
} from '../schemas/report.js';
import { validate } from '../utils/validate.js';

export interface ScheduleRouteDeps {
  scheduleStore: ScheduleStore;
}

export function scheduleRoutes(deps: ScheduleRouteDeps) {
  const { scheduleStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    // POST /api/v1/reports/schedule — Create recurring report schedule
    app.post('/', async (req: FastifyRequest<{ Body: CreateScheduleDto }>, reply: FastifyReply) => {
      const body = validate(CreateScheduleSchema, req.body);
      const schedule = scheduleStore.create(body);
      return reply.status(201).send({ data: schedule });
    });

    // GET /api/v1/reports/schedule — List schedules
    app.get('/', async (req: FastifyRequest<{ Querystring: { tenantId?: string } }>, reply: FastifyReply) => {
      const tenantId = (req.query as { tenantId?: string }).tenantId || 'default';
      const schedules = scheduleStore.list(tenantId);
      return reply.send({ data: schedules });
    });

    // PUT /api/v1/reports/schedule/:id — Update schedule
    app.put(
      '/:id',
      async (req: FastifyRequest<{ Params: { id: string }; Body: UpdateScheduleDto }>, reply: FastifyReply) => {
        const body = validate(UpdateScheduleSchema, req.body);
        const schedule = scheduleStore.update(req.params.id, body);
        return reply.send({ data: schedule });
      },
    );

    // PUT /api/v1/reports/schedule/bulk-toggle — Enable or disable multiple schedules
    app.put(
      '/bulk-toggle',
      async (req: FastifyRequest<{ Body: BulkToggleSchedulesDto }>, reply: FastifyReply) => {
        const body = validate(BulkToggleSchedulesSchema, req.body);
        let toggled = 0;
        const notFound: string[] = [];

        for (const id of body.ids) {
          try {
            scheduleStore.update(id, { enabled: body.enabled });
            toggled++;
          } catch {
            notFound.push(id);
          }
        }

        return reply.send({ data: { toggled, enabled: body.enabled, notFound } });
      },
    );

    // DELETE /api/v1/reports/schedule/:id — Delete schedule
    app.delete('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const deleted = scheduleStore.delete(req.params.id);
      if (!deleted) throw new AppError(404, `Schedule not found: ${req.params.id}`, 'NOT_FOUND');
      return reply.status(204).send();
    });
  };
}
