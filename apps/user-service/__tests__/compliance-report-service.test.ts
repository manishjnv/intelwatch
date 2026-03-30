/**
 * @module compliance-report-service.test
 * @description Tests for I-18 Compliance Report Generation — SOC 2,
 * GDPR DSAR, privileged access reports.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────

const mockPrisma = {
  complianceReport: {
    create: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
  session: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  auditLog: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn(),
    findFirst: vi.fn().mockResolvedValue(null),
  },
  accessReview: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
  },
  apiKey: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  scimToken: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  tenant: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
  },
  $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
};

vi.mock('../src/prisma.js', () => ({ prisma: mockPrisma }));

const now = new Date('2026-03-30T12:00:00Z');
const period = { from: '2026-01-01T00:00:00Z', to: '2026-03-31T23:59:59Z' };

// ── I-18 Tests ──────────────────────────────────────────────────────

describe('ComplianceReportService', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now });
  });

  // ── 2A: Report creation ───────────────────────────────────────────

  describe('createReport', () => {
    it('creates report record with status generating', async () => {
      mockPrisma.complianceReport.create.mockResolvedValueOnce({
        id: 'rpt-1', reportType: 'soc2_access_review', status: 'generating',
        generatedBy: 'admin-1', periodFrom: new Date(period.from),
        periodTo: new Date(period.to),
      });

      const { ComplianceReportService } = await import('../src/compliance-report-service.js');
      const svc = new ComplianceReportService();
      const result = await svc.createReport({
        type: 'soc2_access_review',
        periodFrom: period.from,
        periodTo: period.to,
      }, 'admin-1');

      expect(result.status).toBe('generating');
      expect(mockPrisma.complianceReport.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reportType: 'soc2_access_review', status: 'generating',
        }),
      });
    });
  });

  // ── 2B: SOC 2 report generation ───────────────────────────────────

  describe('generateSoc2Report', () => {
    it('produces correct structure with role distribution', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: 'u-1', email: 'a@test.com', role: 'tenant_admin', mfaEnabled: true, active: true, lastLoginAt: now, createdAt: new Date(period.from) },
        { id: 'u-2', email: 'b@test.com', role: 'analyst', mfaEnabled: false, active: true, lastLoginAt: now, createdAt: new Date(period.from) },
      ]);
      // Added in period
      mockPrisma.user.count.mockResolvedValueOnce(2);
      // Removed in period
      mockPrisma.user.count.mockResolvedValueOnce(0);
      // Role changes (audit logs)
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);
      // Stale accounts
      mockPrisma.session.findMany.mockResolvedValueOnce([]);
      // Access reviews
      mockPrisma.accessReview.count
        .mockResolvedValueOnce(1)  // confirmed
        .mockResolvedValueOnce(0)  // disabled
        .mockResolvedValueOnce(0)  // pending
        .mockResolvedValueOnce(0); // autoDisabled

      const { ComplianceReportService } = await import('../src/compliance-report-service.js');
      const svc = new ComplianceReportService();
      const report = await svc.generateSoc2Report(
        new Date(period.from), new Date(period.to),
      );

      expect(report.totalUsers).toBe(2);
      expect(report.roleDistribution).toEqual({ tenant_admin: 1, analyst: 1 });
      expect(report.mfaAdoptionRate).toBeCloseTo(50);
      expect(report.accessChanges.added).toBe(2);
    });
  });

  // ── 2C: Privileged access report ──────────────────────────────────

  describe('generatePrivilegedAccessReport', () => {
    it('lists all super_admins with session details', async () => {
      mockPrisma.user.findMany
        // super_admins
        .mockResolvedValueOnce([
          { id: 'sa-1', email: 'sa@test.com', lastLoginAt: now, mfaEnabled: true, tenant: { name: 'Platform' } },
        ])
        // tenant_admins
        .mockResolvedValueOnce([
          { id: 'ta-1', email: 'ta@test.com', lastLoginAt: now, mfaEnabled: false, tenant: { name: 'Acme' } },
        ]);
      // Sessions for sa-1
      mockPrisma.session.findMany.mockResolvedValueOnce([
        { id: 's-1', geoCountry: 'IN', geoCity: 'Mumbai' },
        { id: 's-2', geoCountry: 'US', geoCity: 'NYC' },
      ]);
      // API keys
      mockPrisma.apiKey.findMany.mockResolvedValueOnce([]);
      // SCIM tokens
      mockPrisma.scimToken.findMany.mockResolvedValueOnce([]);
      // Tenants for grouping
      mockPrisma.tenant.findMany.mockResolvedValueOnce([]);

      const { ComplianceReportService } = await import('../src/compliance-report-service.js');
      const svc = new ComplianceReportService();
      const report = await svc.generatePrivilegedAccessReport(
        new Date(period.from), new Date(period.to),
      );

      expect(report.superAdmins).toHaveLength(1);
      expect(report.superAdmins[0].geoLocations).toContain('IN');
      expect(report.tenantAdmins).toHaveLength(1);
    });
  });

  // ── 2D: GDPR DSAR export ─────────────────────────────────────────

  describe('generateDsarExport', () => {
    it('collects all user data into JSON bundle', async () => {
      const user = {
        id: 'u-1', email: 'data-subject@test.com', displayName: 'DS',
        role: 'analyst', tenantId: 'tenant-1', mfaEnabled: false,
        createdAt: now, active: true, authProvider: 'email',
      };
      mockPrisma.user.findUnique.mockResolvedValueOnce(user);
      mockPrisma.session.findMany.mockResolvedValueOnce([
        { id: 's-1', ipAddress: '1.2.3.4', geoCountry: 'IN', createdAt: now },
      ]);
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([
        { id: 'a-1', action: 'USER_LOGIN', createdAt: now },
      ]);
      mockPrisma.apiKey.findMany.mockResolvedValueOnce([
        { id: 'k-1', name: 'My Key', scopes: ['ioc:read'], createdAt: now },
      ]);

      const { ComplianceReportService } = await import('../src/compliance-report-service.js');
      const svc = new ComplianceReportService();
      const dsar = await svc.generateDsarExport('u-1', 'admin-1');

      expect(dsar.dataSubject.email).toBe('data-subject@test.com');
      expect(dsar.sessions).toHaveLength(1);
      expect(dsar.auditLogs).toHaveLength(1);
      expect(dsar.apiKeys).toHaveLength(1);
      expect(dsar.exportedAt).toBeDefined();
      expect(dsar.requestedBy).toBe('admin-1');
    });

    it('returns 404 for non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const { ComplianceReportService } = await import('../src/compliance-report-service.js');
      const svc = new ComplianceReportService();
      await expect(svc.generateDsarExport('no-exist', 'admin-1'))
        .rejects.toThrow('User not found');
    });
  });

  // ── 2E: Report CRUD ──────────────────────────────────────────────

  describe('listReports', () => {
    it('returns paginated report list', async () => {
      mockPrisma.complianceReport.findMany.mockResolvedValueOnce([
        { id: 'rpt-1', reportType: 'soc2_access_review', status: 'completed' },
      ]);
      mockPrisma.complianceReport.count.mockResolvedValueOnce(1);

      const { ComplianceReportService } = await import('../src/compliance-report-service.js');
      const svc = new ComplianceReportService();
      const result = await svc.listReports({ page: 1, limit: 50 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('filters by report type', async () => {
      mockPrisma.complianceReport.findMany.mockResolvedValueOnce([]);
      mockPrisma.complianceReport.count.mockResolvedValueOnce(0);

      const { ComplianceReportService } = await import('../src/compliance-report-service.js');
      const svc = new ComplianceReportService();
      const result = await svc.listReports({ page: 1, limit: 50, type: 'gdpr_dsar' });

      expect(result.data).toHaveLength(0);
    });
  });

  describe('getReport', () => {
    it('returns report by ID', async () => {
      mockPrisma.complianceReport.findUnique.mockResolvedValueOnce({
        id: 'rpt-1', reportType: 'soc2_access_review', status: 'completed',
        reportData: { totalUsers: 10 },
      });

      const { ComplianceReportService } = await import('../src/compliance-report-service.js');
      const svc = new ComplianceReportService();
      const result = await svc.getReport('rpt-1');

      expect(result.id).toBe('rpt-1');
      expect(result.reportData).toBeDefined();
    });

    it('returns 404 for non-existent report', async () => {
      mockPrisma.complianceReport.findUnique.mockResolvedValueOnce(null);

      const { ComplianceReportService } = await import('../src/compliance-report-service.js');
      const svc = new ComplianceReportService();
      await expect(svc.getReport('no-exist'))
        .rejects.toThrow('Compliance report not found');
    });
  });

  // ── Audit logging ────────────────────────────────────────────────

  describe('audit logging', () => {
    it('logs audit event on DSAR export', async () => {
      const user = {
        id: 'u-1', email: 'ds@test.com', displayName: 'DS',
        role: 'analyst', tenantId: 'tenant-1', mfaEnabled: false,
        createdAt: now, active: true, authProvider: 'email',
      };
      mockPrisma.user.findUnique.mockResolvedValueOnce(user);
      mockPrisma.session.findMany.mockResolvedValueOnce([]);
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);
      mockPrisma.apiKey.findMany.mockResolvedValueOnce([]);

      const { ComplianceReportService } = await import('../src/compliance-report-service.js');
      const svc = new ComplianceReportService();
      await svc.generateDsarExport('u-1', 'admin-1', 'tenant-1');

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'compliance.dsar_exported',
          entityType: 'user',
          entityId: 'u-1',
        }),
      });
    });
  });
});
