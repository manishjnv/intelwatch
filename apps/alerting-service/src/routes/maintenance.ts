import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { MaintenanceStore, CreateMaintenanceDto, UpdateMaintenanceDto } from '../services/maintenance-store.js';
import { z } from 'zod';
import { validate } from '../utils/validate.js';

export interface MaintenanceRouteDeps {
  maintenanceStore: MaintenanceStore;
}

const CreateMaintenanceSchema = z.object({
  name: z.string().min(1).max(200),
  tenantId: z.string().min(1).default('default'),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  suppressAllRules: z.boolean().default(true),
  ruleIds: z.array(z.string()).optional(),
  reason: z.string().max(500).optional(),
  createdBy: z.string().max(100).optional(),
});

const UpdateMaintenanceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  suppressAllRules: z.boolean().optional(),
  ruleIds: z.array(z.string()).optional(),
  reason: z.string().max(500).optional(),
});

export function maintenanceRoutes(deps: MaintenanceRouteDeps) {
  const { maintenanceStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    // POST /api/v1/alerts/maintenance-windows — Create window
    app.post('/', async (req: FastifyRequest<{ Body: CreateMaintenanceDto }>, reply: FastifyReply) => {
      const body = validate(CreateMaintenanceSchema, req.body);
      const window = maintenanceStore.create(body);
      return reply.status(201).send({ data: window });
    });

    // GET /api/v1/alerts/maintenance-windows — List windows
    app.get('/', async (req: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) => {
      const tenantId = req.query.tenantId || 'default';
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '20', 10);
      const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;

      const result = maintenanceStore.list(tenantId, { active, page, limit });
      return reply.send({
        data: result.data,
        meta: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages },
      });
    });

    // PUT /api/v1/alerts/maintenance-windows/:id — Update window
    app.put(
      '/:id',
      async (req: FastifyRequest<{ Params: { id: string }; Body: UpdateMaintenanceDto }>, reply: FastifyReply) => {
        const body = validate(UpdateMaintenanceSchema, req.body);
        const window = maintenanceStore.update(req.params.id, body);
        if (!window) throw new AppError(404, `Maintenance window not found: ${req.params.id}`, 'NOT_FOUND');
        return reply.send({ data: window });
      },
    );

    // DELETE /api/v1/alerts/maintenance-windows/:id — Delete window
    app.delete('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const deleted = maintenanceStore.delete(req.params.id);
      if (!deleted) throw new AppError(404, `Maintenance window not found: ${req.params.id}`, 'NOT_FOUND');
      return reply.status(204).send();
    });
  };
}
