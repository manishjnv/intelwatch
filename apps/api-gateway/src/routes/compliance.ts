/**
 * @module compliance routes
 * @description I-18 Compliance Report Generation — admin + tenant DSAR endpoints.
 *   POST /admin/compliance/reports           — super_admin: generate report
 *   GET  /admin/compliance/reports           — super_admin: list reports
 *   GET  /admin/compliance/reports/:reportId — super_admin: download report
 *   POST /settings/compliance/dsar           — tenant_admin: generate DSAR for own org
 *   GET  /settings/compliance/dsar/:reportId — tenant_admin: download DSAR
 */
import type { FastifyInstance } from 'fastify';
import { authenticate, getUser } from '../plugins/auth.js';
import { rbac } from '../plugins/rbac.js';
import {
  GenerateReportInputSchema,
  ComplianceReportQuerySchema,
} from '@etip/shared-types';
import { z } from 'zod';

const DsarInputSchema = z.object({
  userId: z.string().uuid(),
});

export async function complianceRoutes(app: FastifyInstance) {
  const { ComplianceReportService } = await import('@etip/user-service');
  const svc = new ComplianceReportService();

  // ── Super Admin Routes ──────────────────────────────────────────

  /** POST /admin/compliance/reports — generate a compliance report */
  app.post('/admin/compliance/reports', {
    preHandler: [authenticate, rbac('admin:*')],
  }, async (req, reply) => {
    const user = getUser(req);
    const input = GenerateReportInputSchema.parse(req.body);

    const record = await svc.createReport({
      type: input.type,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      tenantId: input.tenantId,
      userId: input.userId,
    }, user.sub);

    // Generate inline — for large reports, move to BullMQ worker
    try {
      await svc.generateAndPersist(record.id);
      const completed = await svc.getReport(record.id);
      return reply.status(201).send({ status: 'ok', data: completed });
    } catch {
      const failed = await svc.getReport(record.id);
      return reply.status(500).send({ status: 'error', data: failed });
    }
  });

  /** GET /admin/compliance/reports — list generated reports */
  app.get('/admin/compliance/reports', {
    preHandler: [authenticate, rbac('admin:*')],
  }, async (req) => {
    const filters = ComplianceReportQuerySchema.parse(req.query);
    const result = await svc.listReports(filters);
    return { status: 'ok', ...result };
  });

  /** GET /admin/compliance/reports/:reportId — download report JSON */
  app.get<{ Params: { reportId: string } }>('/admin/compliance/reports/:reportId', {
    preHandler: [authenticate, rbac('admin:*')],
  }, async (req) => {
    const report = await svc.getReport(req.params.reportId);
    return { status: 'ok', data: report };
  });

  // ── Tenant Admin DSAR Routes ────────────────────────────────────

  /** POST /settings/compliance/dsar — generate DSAR export for own org user */
  app.post('/settings/compliance/dsar', {
    preHandler: [authenticate, rbac('org:read')],
  }, async (req, reply) => {
    const user = getUser(req);
    const { userId } = DsarInputSchema.parse(req.body);

    const dsar = await svc.generateDsarExport(userId, user.sub, user.tenantId);

    // Persist as a compliance report record
    const record = await svc.createReport({
      type: 'gdpr_dsar',
      periodFrom: new Date(0).toISOString(),
      periodTo: new Date().toISOString(),
      tenantId: user.tenantId,
      userId,
    }, user.sub);

    // Complete the report with DSAR data via service
    await svc.completeDsarReport(record.id, dsar);

    return reply.status(201).send({ status: 'ok', data: { reportId: record.id, dsar } });
  });

  /** GET /settings/compliance/dsar/:reportId — download DSAR export */
  app.get<{ Params: { reportId: string } }>('/settings/compliance/dsar/:reportId', {
    preHandler: [authenticate, rbac('org:read')],
  }, async (req) => {
    const user = getUser(req);
    const report = await svc.getReport(req.params.reportId);

    // Tenant isolation: ensure report belongs to this tenant
    if (report.tenantId && report.tenantId !== user.tenantId) {
      return { status: 'error', error: { code: 'FORBIDDEN', message: 'Report not found' } };
    }

    return { status: 'ok', data: report };
  });
}
