import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { TenantStore, ListTenantFilter } from '../services/tenant-store.js';
import {
  CreateTenantSchema,
  SuspendTenantSchema,
  ChangePlanSchema,
  type CreateTenantDto,
} from '../schemas/admin.js';
import { validate } from '../utils/validate.js';

export interface TenantRouteDeps {
  tenantStore: TenantStore;
}

/** Tenant administration routes (core feature 4). */
export function tenantRoutes(deps: TenantRouteDeps) {
  const { tenantStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET / — list all tenants. */
    app.get(
      '/',
      async (
        req: FastifyRequest<{ Querystring: { status?: string; plan?: string } }>,
        reply: FastifyReply,
      ) => {
        const filter: ListTenantFilter = {};
        if (req.query.status) filter.status = req.query.status as ListTenantFilter['status'];
        if (req.query.plan) filter.plan = req.query.plan as ListTenantFilter['plan'];
        return reply.send({ data: tenantStore.list(filter) });
      },
    );

    /** POST / — create a new tenant. */
    app.post(
      '/',
      async (req: FastifyRequest<{ Body: CreateTenantDto }>, reply: FastifyReply) => {
        const body = validate(CreateTenantSchema, req.body);
        const tenant = tenantStore.create(body);
        return reply.status(201).send({ data: tenant });
      },
    );

    /** GET /:id — get tenant details. */
    app.get(
      '/:id',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const tenant = tenantStore.getById(req.params.id);
        if (!tenant) throw new AppError(404, `Tenant not found: ${req.params.id}`, 'NOT_FOUND');
        return reply.send({ data: tenant });
      },
    );

    /** PUT /:id/suspend — suspend a tenant. */
    app.put(
      '/:id/suspend',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const body = validate(SuspendTenantSchema, req.body);
        try {
          const tenant = tenantStore.suspend(req.params.id, body.reason);
          return reply.send({ data: tenant });
        } catch (err) {
          if (err instanceof AppError) throw err;
          throw new AppError(500, 'Failed to suspend tenant', 'SUSPEND_ERROR');
        }
      },
    );

    /** PUT /:id/reinstate — reinstate a suspended tenant. */
    app.put(
      '/:id/reinstate',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
          const tenant = tenantStore.reinstate(req.params.id);
          return reply.send({ data: tenant });
        } catch (err) {
          if (err instanceof AppError) throw err;
          throw new AppError(500, 'Failed to reinstate tenant', 'REINSTATE_ERROR');
        }
      },
    );

    /** PUT /:id/plan — change tenant plan. */
    app.put(
      '/:id/plan',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const body = validate(ChangePlanSchema, req.body);
        try {
          const tenant = tenantStore.changePlan(req.params.id, body.plan);
          return reply.send({ data: tenant });
        } catch (err) {
          if (err instanceof AppError) throw err;
          throw new AppError(500, 'Failed to change plan', 'PLAN_CHANGE_ERROR');
        }
      },
    );

    /** GET /:id/usage — tenant usage overview. */
    app.get(
      '/:id/usage',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
          const usage = tenantStore.getUsage(req.params.id);
          return reply.send({ data: usage });
        } catch (err) {
          if (err instanceof AppError) throw err;
          throw new AppError(500, 'Failed to get usage', 'USAGE_ERROR');
        }
      },
    );

    /** DELETE /:id — delete a tenant. */
    app.delete(
      '/:id',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const deleted = tenantStore.delete(req.params.id);
        if (!deleted) throw new AppError(404, `Tenant not found: ${req.params.id}`, 'NOT_FOUND');
        return reply.status(204).send();
      },
    );
  };
}
