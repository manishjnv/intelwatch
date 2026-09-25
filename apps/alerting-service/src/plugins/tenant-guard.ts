import type { FastifyRequest } from 'fastify';
import { AppError } from '@etip/shared-utils';

/**
 * Tenant guard (roadmap STEP_00B U1–U3; same file in alerting, reporting, es-indexing).
 *
 * nginx validates the caller's JWT (auth_request → api-gateway /auth/verify) and OVERWRITES
 * x-tenant-id / x-user-role with the verified identity (docker/nginx/conf.d/service-auth.inc).
 * Routes in this service read tenantId from the query string or body, so without this guard a
 * logged-in user could read another tenant's data by changing `tenantId=`.
 *
 * - Header present (external call through nginx): a query/body tenantId that differs from the
 *   header is rejected with 403; a missing one is filled in from the header. super_admin may
 *   choose a tenant (Command Center).
 * - Header absent: internal Docker-network call (ports are bound to 127.0.0.1). Unchanged.
 */
function applyTenant(target: unknown, tenantId: string, isSuperAdmin: boolean): void {
  if (!target || typeof target !== 'object' || Array.isArray(target)) return;
  const obj = target as Record<string, unknown>;
  const requested = obj.tenantId;
  if (requested === undefined || requested === null || requested === '') {
    obj.tenantId = tenantId;
    return;
  }
  if (requested !== tenantId && !isSuperAdmin) {
    throw new AppError(403, 'tenantId does not match the authenticated tenant', 'TENANT_MISMATCH');
  }
}

export function enforceTenant(req: FastifyRequest): void {
  const header = req.headers['x-tenant-id'];
  if (typeof header !== 'string' || header.length === 0) return;
  const isSuperAdmin = req.headers['x-user-role'] === 'super_admin';
  applyTenant(req.query, header, isSuperAdmin);
  applyTenant(req.body, header, isSuperAdmin);
  const params = req.params as Record<string, unknown> | undefined;
  if (params && typeof params.tenantId === 'string' && params.tenantId !== header && !isSuperAdmin) {
    throw new AppError(403, 'tenantId does not match the authenticated tenant', 'TENANT_MISMATCH');
  }
}

