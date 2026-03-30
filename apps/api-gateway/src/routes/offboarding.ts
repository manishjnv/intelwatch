/**
 * @module offboarding routes
 * @description I-19 Offboarding + I-20 Retention + I-21 Ownership Transfer — gateway routes.
 *   POST /admin/tenants/:tenantId/offboard          — super_admin: initiate offboarding
 *   POST /admin/tenants/:tenantId/cancel-offboard    — super_admin: cancel offboarding
 *   GET  /admin/tenants/:tenantId/offboard-status    — super_admin: check progress
 *   GET  /admin/offboarding                          — super_admin: list pipeline
 *   GET  /admin/retention/status                     — super_admin: retention stats
 *   GET  /admin/retention/history                    — super_admin: past runs
 *   GET  /billing/retention                          — tenant_admin: own retention info
 *   POST /settings/users/:userId/transfer-ownership  — tenant_admin: manual transfer
 *   POST /admin/users/:userId/transfer-ownership     — super_admin: manual transfer any org
 */
import type { FastifyInstance } from 'fastify';
import { authenticate, getUser } from '../plugins/auth.js';
import { rbac } from '../plugins/rbac.js';
import { TransferOwnershipInputSchema } from '@etip/shared-types';

export async function offboardingGatewayRoutes(app: FastifyInstance) {
  // Lazy-load services from user-service package
  const {
    OffboardingService,
    RetentionService,
    OwnershipTransferService,
    AuditLogger: AuditLoggerClass,
    SessionManager: SessionManagerClass,
    prisma,
  } = await import('@etip/user-service');

  const auditLogger = new AuditLoggerClass();
  const sessionManager = new SessionManagerClass();
  const ownershipTransfer = new OwnershipTransferService({ prisma, auditLogger });
  const offboardingService = new OffboardingService({
    prisma, auditLogger, sessionManager, offboardingQueue: null,
  });
  const retentionService = new RetentionService({ prisma, auditLogger });

  // ── I-19: Offboarding Lifecycle ─────────────────────────────────

  /** POST /admin/tenants/:tenantId/offboard */
  app.post<{ Params: { tenantId: string } }>('/admin/tenants/:tenantId/offboard', {
    preHandler: [authenticate, rbac('admin:*')],
  }, async (req) => {
    const user = getUser(req);
    const result = await offboardingService.initiateOffboarding(
      req.params.tenantId, user.email ?? user.sub, user.tenantId,
    );
    return { status: 'ok', data: result };
  });

  /** POST /admin/tenants/:tenantId/cancel-offboard */
  app.post<{ Params: { tenantId: string } }>('/admin/tenants/:tenantId/cancel-offboard', {
    preHandler: [authenticate, rbac('admin:*')],
  }, async (req) => {
    const user = getUser(req);
    const result = await offboardingService.cancelOffboarding(
      req.params.tenantId, user.email ?? user.sub,
    );
    return { status: 'ok', data: result };
  });

  /** GET /admin/tenants/:tenantId/offboard-status */
  app.get<{ Params: { tenantId: string } }>('/admin/tenants/:tenantId/offboard-status', {
    preHandler: [authenticate, rbac('admin:*')],
  }, async (req) => {
    const result = await offboardingService.getStatus(req.params.tenantId);
    return { status: 'ok', data: result };
  });

  /** GET /admin/offboarding */
  app.get('/admin/offboarding', {
    preHandler: [authenticate, rbac('admin:*')],
  }, async () => {
    const result = await offboardingService.listPipeline();
    return { status: 'ok', data: result, total: result.length };
  });

  // ── I-20: Data Retention ────────────────────────────────────────

  /** GET /admin/retention/status */
  app.get('/admin/retention/status', {
    preHandler: [authenticate, rbac('admin:*')],
  }, async () => {
    const result = await retentionService.getAdminStatus();
    return { status: 'ok', data: result };
  });

  /** GET /admin/retention/history */
  app.get('/admin/retention/history', {
    preHandler: [authenticate, rbac('admin:*')],
  }, async () => {
    const history = retentionService.getHistory();
    return { status: 'ok', data: history, total: history.length };
  });

  /** GET /billing/retention — tenant_admin's own retention info */
  app.get('/billing/retention', {
    preHandler: [authenticate, rbac('billing:read')],
  }, async (req) => {
    const user = getUser(req);
    const result = await retentionService.getTenantRetentionInfo(user.tenantId);
    return { status: 'ok', data: result };
  });

  // ── I-21: Ownership Transfer ────────────────────────────────────

  /** POST /settings/users/:userId/transfer-ownership — tenant_admin */
  app.post<{ Params: { userId: string } }>('/settings/users/:userId/transfer-ownership', {
    preHandler: [authenticate, rbac('user:write')],
  }, async (req) => {
    const user = getUser(req);
    const input = TransferOwnershipInputSchema.parse(req.body);
    const result = await ownershipTransfer.manualTransfer(
      req.params.userId, input.targetUserId, user.tenantId, user.sub, input.resourceTypes,
    );
    return { status: 'ok', data: result };
  });

  /** POST /admin/users/:userId/transfer-ownership — super_admin */
  app.post<{ Params: { userId: string } }>('/admin/users/:userId/transfer-ownership', {
    preHandler: [authenticate, rbac('admin:*')],
  }, async (req) => {
    const user = getUser(req);
    const input = TransferOwnershipInputSchema.parse(req.body);
    // Look up source user's tenant
    const sourceUser = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { tenantId: true },
    });
    if (!sourceUser) {
      return { status: 'error', error: { code: 'USER_NOT_FOUND', message: 'User not found' } };
    }
    const result = await ownershipTransfer.manualTransfer(
      req.params.userId, input.targetUserId, sourceUser.tenantId, user.sub, input.resourceTypes,
    );
    return { status: 'ok', data: result };
  });
}
