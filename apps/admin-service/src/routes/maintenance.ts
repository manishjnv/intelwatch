import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { MaintenanceStore, ListMaintenanceFilter } from '../services/maintenance-store.js';
import { validateMaintenanceInput } from '../services/maintenance-store.js';
import {
  CreateMaintenanceSchema,
  UpdateMaintenanceSchema,
  type CreateMaintenanceDto,
  type UpdateMaintenanceDto,
} from '../schemas/admin.js';
import { validate } from '../utils/validate.js';

export interface MaintenanceRouteDeps {
  maintenanceStore: MaintenanceStore;
}

/** Maintenance window CRUD routes (core feature 2). */
export function maintenanceRoutes(deps: MaintenanceRouteDeps) {
  const { maintenanceStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET / — list maintenance windows. */
    app.get(
      '/',
      async (req: FastifyRequest<{ Querystring: { status?: string } }>, reply: FastifyReply) => {
        const filter: ListMaintenanceFilter = {};
        if (req.query.status) filter.status = req.query.status as ListMaintenanceFilter['status'];
        return reply.send({ data: maintenanceStore.list(filter) });
      },
    );

    /** POST / — create a maintenance window. */
    app.post(
      '/',
      async (req: FastifyRequest<{ Body: CreateMaintenanceDto }>, reply: FastifyReply) => {
        const body = validate(CreateMaintenanceSchema, req.body);
        validateMaintenanceInput(body);
        const adminId = (req.headers['x-admin-id'] as string) || 'system';
        const win = maintenanceStore.create({ ...body, createdBy: adminId });
        return reply.status(201).send({ data: win });
      },
    );

    /** GET /:id — get a single window. */
    app.get(
      '/:id',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const win = maintenanceStore.getById(req.params.id);
        if (!win) throw new AppError(404, `Maintenance window not found: ${req.params.id}`, 'NOT_FOUND');
        return reply.send({ data: win });
      },
    );

    /** PUT /:id — update a window. */
    app.put(
      '/:id',
      async (req: FastifyRequest<{ Params: { id: string }; Body: UpdateMaintenanceDto }>, reply: FastifyReply) => {
        const body = validate(UpdateMaintenanceSchema, req.body);
        const updated = maintenanceStore.update(req.params.id, body);
        if (!updated) throw new AppError(404, `Maintenance window not found: ${req.params.id}`, 'NOT_FOUND');
        return reply.send({ data: updated });
      },
    );

    /** DELETE /:id — delete a window. */
    app.delete(
      '/:id',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const deleted = maintenanceStore.delete(req.params.id);
        if (!deleted) throw new AppError(404, `Maintenance window not found: ${req.params.id}`, 'NOT_FOUND');
        return reply.status(204).send();
      },
    );

    /** POST /:id/activate — force-activate a window. */
    app.post(
      '/:id/activate',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const win = maintenanceStore.activate(req.params.id);
        if (!win) throw new AppError(404, `Maintenance window not found: ${req.params.id}`, 'NOT_FOUND');
        return reply.send({ data: win });
      },
    );

    /** POST /:id/deactivate — complete a window. */
    app.post(
      '/:id/deactivate',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const win = maintenanceStore.deactivate(req.params.id);
        if (!win) throw new AppError(404, `Maintenance window not found: ${req.params.id}`, 'NOT_FOUND');
        return reply.send({ data: win });
      },
    );
  };
}
