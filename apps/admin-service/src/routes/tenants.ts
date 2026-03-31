import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { TenantStore, ListTenantFilter } from '../services/tenant-store.js';
import {
  CreateTenantSchema,
  SuspendTenantSchema,
  ChangePlanSchema,
  ExtendTrialSchema,
  type CreateTenantDto,
} from '../schemas/admin.js';
import { validate } from '../utils/validate.js';
import { sendInviteEmail, isEmailReady } from '../services/email-sender.js';
import { getConfig } from '../config.js';

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

    /** POST / — create a new tenant and send invite email. */
    app.post(
      '/',
      async (req: FastifyRequest<{ Body: CreateTenantDto }>, reply: FastifyReply) => {
        const body = validate(CreateTenantSchema, req.body);
        const tenant = tenantStore.create(body);

        // Send invite email (fire-and-forget — don't block response)
        if (isEmailReady()) {
          const config = getConfig();
          sendInviteEmail({
            to: tenant.ownerEmail,
            orgName: tenant.name,
            ownerName: tenant.ownerName,
            inviteToken: tenant.inviteToken,
            platformUrl: config.TI_PLATFORM_URL,
          }).catch((err) => app.log.error({ err }, 'Failed to send invite email'));
        }

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

    /** PUT /:id/extend-trial — extend a tenant's trial period. */
    app.put(
      '/:id/extend-trial',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const body = validate(ExtendTrialSchema, req.body);
        try {
          const tenant = tenantStore.extendTrial(req.params.id, body.days);
          return reply.send({ data: tenant });
        } catch (err) {
          if (err instanceof AppError) throw err;
          throw new AppError(500, 'Failed to extend trial', 'TRIAL_EXTEND_ERROR');
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

    /** GET /validate-invite — validate an invite token (public, called by api-gateway). */
    app.get(
      '/validate-invite',
      async (
        req: FastifyRequest<{ Querystring: { token?: string; email?: string } }>,
        reply: FastifyReply,
      ) => {
        const { token, email } = req.query;
        if (!token || !email) {
          return reply.status(400).send({ error: { code: 'MISSING_PARAMS', message: 'token and email are required' } });
        }
        const tenant = tenantStore.validateInvite(token, email);
        if (!tenant) {
          return reply.status(404).send({ error: { code: 'INVITE_INVALID', message: 'Invite link is invalid, expired, or already used' } });
        }
        return reply.send({ data: { valid: true, tenantName: tenant.name, ownerEmail: tenant.ownerEmail } });
      },
    );

    /** POST /claim-invite — mark an invite token as claimed (called by api-gateway after registration). */
    app.post(
      '/claim-invite',
      async (
        req: FastifyRequest<{ Body: { token: string } }>,
        reply: FastifyReply,
      ) => {
        const { token } = req.body ?? {};
        if (!token) {
          return reply.status(400).send({ error: { code: 'MISSING_TOKEN', message: 'token is required' } });
        }
        const claimed = tenantStore.claimInvite(token);
        if (!claimed) {
          return reply.status(404).send({ error: { code: 'CLAIM_FAILED', message: 'Invite not found or already claimed' } });
        }
        return reply.send({ data: { claimed: true } });
      },
    );

    /** GET /feed-usage/summary — aggregate feed usage stats across tenants. */
    app.get(
      '/feed-usage/summary',
      async (_req: FastifyRequest, reply: FastifyReply) => {
        const tenants = tenantStore.list();
        const byPlan: Record<string, number> = { free: 0, starter: 0, teams: 0, enterprise: 0 };
        let totalFeeds = 0;

        for (const t of tenants) {
          const plan = t.plan ?? 'free';
          byPlan[plan] = (byPlan[plan] ?? 0) + 1;
          try {
            const usage = tenantStore.getUsage(t.id);
            totalFeeds += usage.feedCount;
          } catch {
            // Usage record may not exist for some tenants
          }
        }

        return reply.send({
          data: {
            totalTenants: tenants.length,
            byPlan,
            totalFeeds,
          },
        });
      },
    );
  };
}
