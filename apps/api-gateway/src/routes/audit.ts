import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, getUser } from '../plugins/auth.js';
import { rbac } from '../plugins/rbac.js';

const AuditQuerySchema = z.object({
  action: z.string().optional(),
  userId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

const VerifyIntegritySchema = z.object({
  tenantId: z.string().uuid().optional(),
});

export async function auditRoutes(app: FastifyInstance) {
  const { AuditService } = await import('@etip/user-service');
  const svc = new AuditService();

  /** GET /admin/audit — super_admin cross-tenant audit log */
  app.get('/admin/audit', { preHandler: [authenticate, rbac('admin:*')] }, async (req) => {
    const filters = AuditQuerySchema.parse(req.query);
    const result = await svc.queryAllAuditLogs({
      ...filters,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
    });
    return { status: 'ok', data: result };
  });

  /** GET /admin/tenants/:tenantId/audit — super_admin tenant-scoped */
  app.get('/admin/tenants/:tenantId/audit', { preHandler: [authenticate, rbac('admin:*')] }, async (req) => {
    const { tenantId } = req.params as { tenantId: string };
    const filters = AuditQuerySchema.parse(req.query);
    const result = await svc.queryTenantAuditLogs(tenantId, {
      ...filters,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
    });
    return { status: 'ok', data: result };
  });

  /** GET /settings/audit — tenant_admin own-tenant audit log */
  app.get('/settings/audit', { preHandler: [authenticate, rbac('org:read')] }, async (req) => {
    const user = getUser(req);
    const filters = AuditQuerySchema.parse(req.query);
    const result = await svc.queryTenantAuditLogs(user.tenantId, {
      ...filters,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
    });
    return { status: 'ok', data: result };
  });

  /** POST /admin/audit/verify-integrity — super_admin integrity check */
  app.post('/admin/audit/verify-integrity', { preHandler: [authenticate, rbac('admin:*')] }, async (req) => {
    const { tenantId } = VerifyIntegritySchema.parse(req.body ?? {});
    const result = await svc.verifyIntegrity(tenantId);
    return { status: 'ok', data: result };
  });
}
