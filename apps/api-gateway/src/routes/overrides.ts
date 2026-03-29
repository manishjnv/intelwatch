/**
 * @module api-gateway/routes/overrides
 * @description Tenant Feature Override CRUD — super_admin only.
 * 4 endpoints for per-tenant feature limit overrides.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import { TenantFeatureOverrideCreateSchema, TenantFeatureOverrideUpdateSchema } from '@etip/shared-types';
import { authenticate, getUser } from '../plugins/auth.js';
import { rbac } from '../plugins/rbac.js';
import { invalidatePlanCache } from '../plugins/quota-enforcement.js';
import * as repo from './override-repository.js';

const superAdmin = [authenticate, rbac('admin:*')];

export async function overrideRoutes(app: FastifyInstance): Promise<void> {
  /** GET /api/v1/admin/tenants/:tenantId/overrides — List all overrides for tenant */
  app.get('/:tenantId/overrides', { preHandler: superAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = req.params as { tenantId: string };

    const exists = await repo.tenantExists(tenantId);
    if (!exists) throw new AppError(404, `Tenant '${tenantId}' not found`, 'TENANT_NOT_FOUND');

    const overrides = await repo.findOverridesForTenant(tenantId);
    return reply.status(200).send({ data: overrides, total: overrides.length });
  });

  /** POST /api/v1/admin/tenants/:tenantId/overrides — Create feature override */
  app.post('/:tenantId/overrides', { preHandler: superAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = req.params as { tenantId: string };
    const body = TenantFeatureOverrideCreateSchema.parse(req.body);

    const exists = await repo.tenantExists(tenantId);
    if (!exists) throw new AppError(404, `Tenant '${tenantId}' not found`, 'TENANT_NOT_FOUND');

    const user = getUser(req);
    try {
      const override = await repo.createOverride(tenantId, body, user.email ?? user.sub);
      await invalidatePlanCache(tenantId);
      return reply.status(201).send({ data: override });
    } catch (err: unknown) {
      // Handle unique constraint violation (override already exists for this feature)
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
        throw new AppError(409, `Override for '${body.featureKey}' already exists on tenant`, 'OVERRIDE_ALREADY_EXISTS');
      }
      throw err;
    }
  });

  /** PUT /api/v1/admin/tenants/:tenantId/overrides/:featureKey — Update override */
  app.put('/:tenantId/overrides/:featureKey', { preHandler: superAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, featureKey } = req.params as { tenantId: string; featureKey: string };
    const body = TenantFeatureOverrideUpdateSchema.parse(req.body);

    const updated = await repo.updateOverride(tenantId, featureKey, body);
    if (!updated) {
      throw new AppError(404, `Override for '${featureKey}' not found on tenant '${tenantId}'`, 'OVERRIDE_NOT_FOUND');
    }
    await invalidatePlanCache(tenantId);
    return reply.status(200).send({ data: updated });
  });

  /** DELETE /api/v1/admin/tenants/:tenantId/overrides/:featureKey — Remove override */
  app.delete('/:tenantId/overrides/:featureKey', { preHandler: superAdmin }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, featureKey } = req.params as { tenantId: string; featureKey: string };

    const deleted = await repo.deleteOverride(tenantId, featureKey);
    if (!deleted) {
      throw new AppError(404, `Override for '${featureKey}' not found on tenant '${tenantId}'`, 'OVERRIDE_NOT_FOUND');
    }
    await invalidatePlanCache(tenantId);
    return reply.status(204).send();
  });
}
