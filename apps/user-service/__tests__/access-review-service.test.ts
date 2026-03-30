/**
 * @module access-review-service.test
 * @description Tests for I-17 Access Review Automation — stale detection,
 * auto-disable, review actions, quarterly reports.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────

const mockPrisma = {
  accessReview: {
    create: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
  session: {
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn(),
  },
  tenant: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
    findFirst: vi.fn().mockResolvedValue(null),
  },
  $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
};

vi.mock('../src/prisma.js', () => ({ prisma: mockPrisma }));

const now = new Date('2026-03-30T12:00:00Z');

function daysAgo(n: number): Date {
  return new Date(now.getTime() - n * 86400_000);
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1', email: 'test@example.com', displayName: 'Test',
    role: 'analyst', tenantId: 'tenant-1', active: true,
    mfaEnabled: false, authProvider: 'email',
    createdAt: daysAgo(120), lastLoginAt: daysAgo(100),
    ...overrides,
  };
}

// ── I-17 Tests ──────────────────────────────────────────────────────

describe('AccessReviewService', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now });
  });

  // ── 1A: Stale Super Admin Detection ──────────────────────────────

  describe('scanStaleSuperAdmins', () => {
    it('flags super_admin inactive 65 days with pending review', async () => {
      const staleAdmin = makeUser({
        id: 'sa-1', role: 'super_admin', lastLoginAt: daysAgo(65),
      });
      mockPrisma.user.findMany.mockResolvedValueOnce([staleAdmin]);
      mockPrisma.session.findMany.mockResolvedValueOnce([
        { id: 's-1', createdAt: daysAgo(65) },
      ]);
      mockPrisma.accessReview.create.mockResolvedValueOnce({
        id: 'rev-1', userId: 'sa-1', reviewType: 'stale_super_admin',
        action: 'pending', autoDisabled: false,
      });

      const { AccessReviewService } = await import('../src/access-review-service.js');
      const svc = new AccessReviewService();
      const result = await svc.scanStaleSuperAdmins();

      expect(result.flagged).toBe(1);
      expect(mockPrisma.accessReview.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'sa-1', reviewType: 'stale_super_admin', action: 'pending',
        }),
      });
    });

    it('skips super_admin active 30 days ago — no review created', async () => {
      const activeAdmin = makeUser({
        id: 'sa-2', role: 'super_admin', lastLoginAt: daysAgo(30),
      });
      mockPrisma.user.findMany.mockResolvedValueOnce([activeAdmin]);
      mockPrisma.session.findMany.mockResolvedValueOnce([
        { id: 's-2', createdAt: daysAgo(30) },
      ]);

      const { AccessReviewService } = await import('../src/access-review-service.js');
      const svc = new AccessReviewService();
      const result = await svc.scanStaleSuperAdmins();

      expect(result.flagged).toBe(0);
      expect(mockPrisma.accessReview.create).not.toHaveBeenCalled();
    });
  });

  // ── 1B: Auto-Disable ─────────────────────────────────────────────

  describe('processAutoDisable', () => {
    it('auto-disables user after 14-day pending review', async () => {
      const pendingReview = {
        id: 'rev-1', userId: 'sa-1', tenantId: 'tenant-1',
        reviewType: 'stale_super_admin', action: 'pending',
        autoDisabled: false, createdAt: daysAgo(15),
      };
      mockPrisma.accessReview.findMany.mockResolvedValueOnce([pendingReview]);
      // More than 1 active super_admin
      mockPrisma.user.count.mockResolvedValueOnce(3);
      mockPrisma.accessReview.update.mockResolvedValueOnce({
        ...pendingReview, action: 'disabled', autoDisabled: true,
      });
      mockPrisma.user.update.mockResolvedValueOnce({ id: 'sa-1', active: false });
      mockPrisma.session.updateMany.mockResolvedValueOnce({ count: 2 });

      const { AccessReviewService } = await import('../src/access-review-service.js');
      const svc = new AccessReviewService();
      const result = await svc.processAutoDisable();

      expect(result.disabled).toBe(1);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'sa-1' },
        data: { active: false },
      });
      expect(mockPrisma.session.updateMany).toHaveBeenCalled();
    });

    it('skips auto-disable if only active super_admin', async () => {
      const pendingReview = {
        id: 'rev-1', userId: 'sa-1', tenantId: 'tenant-1',
        reviewType: 'stale_super_admin', action: 'pending',
        autoDisabled: false, createdAt: daysAgo(15),
      };
      mockPrisma.accessReview.findMany.mockResolvedValueOnce([pendingReview]);
      // Only 1 active super_admin — cannot disable
      mockPrisma.user.count.mockResolvedValueOnce(1);

      const { AccessReviewService } = await import('../src/access-review-service.js');
      const svc = new AccessReviewService();
      const result = await svc.processAutoDisable();

      expect(result.disabled).toBe(0);
      expect(result.skippedLastAdmin).toBe(1);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ── 1C: Review Actions ───────────────────────────────────────────

  describe('actOnReview', () => {
    it('super admin confirms review — user stays active', async () => {
      const review = {
        id: 'rev-1', userId: 'sa-1', tenantId: 'tenant-1',
        reviewType: 'stale_super_admin', action: 'pending',
      };
      mockPrisma.accessReview.findUnique.mockResolvedValueOnce(review);
      mockPrisma.accessReview.update.mockResolvedValueOnce({
        ...review, action: 'confirmed', reviewedBy: 'admin-1',
        reviewedAt: now, notes: 'Still needed',
      });

      const { AccessReviewService } = await import('../src/access-review-service.js');
      const svc = new AccessReviewService();
      const result = await svc.actOnReview('rev-1', 'admin-1', {
        action: 'confirmed', notes: 'Still needed',
      });

      expect(result.action).toBe('confirmed');
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('super admin disables via review — user disabled + sessions terminated', async () => {
      const review = {
        id: 'rev-1', userId: 'sa-1', tenantId: 'tenant-1',
        reviewType: 'stale_super_admin', action: 'pending',
      };
      mockPrisma.accessReview.findUnique.mockResolvedValueOnce(review);
      mockPrisma.user.count.mockResolvedValueOnce(2); // not last admin
      mockPrisma.accessReview.update.mockResolvedValueOnce({
        ...review, action: 'disabled', reviewedBy: 'admin-1', reviewedAt: now,
      });
      mockPrisma.user.update.mockResolvedValueOnce({ id: 'sa-1', active: false });
      mockPrisma.session.updateMany.mockResolvedValueOnce({ count: 1 });

      const { AccessReviewService } = await import('../src/access-review-service.js');
      const svc = new AccessReviewService();
      const result = await svc.actOnReview('rev-1', 'admin-1', { action: 'disabled' });

      expect(result.action).toBe('disabled');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'sa-1' },
        data: { active: false },
      });
    });

    it('returns 404 for non-existent review', async () => {
      mockPrisma.accessReview.findUnique.mockResolvedValueOnce(null);

      const { AccessReviewService } = await import('../src/access-review-service.js');
      const svc = new AccessReviewService();
      await expect(svc.actOnReview('no-exist', 'admin-1', { action: 'confirmed' }))
        .rejects.toThrow('Access review not found');
    });
  });

  // ── 1C: Stale User Detection (org-level) ─────────────────────────

  describe('scanStaleUsers', () => {
    it('flags org users inactive 95 days', async () => {
      const tenants = [{ id: 'tenant-1', name: 'Acme Corp' }];
      mockPrisma.tenant.findMany.mockResolvedValueOnce(tenants);

      const staleUser = makeUser({ id: 'u-1', lastLoginAt: daysAgo(95), tenantId: 'tenant-1' });
      mockPrisma.user.findMany.mockResolvedValueOnce([staleUser]);
      mockPrisma.session.findMany.mockResolvedValueOnce([
        { id: 's-1', createdAt: daysAgo(95) },
      ]);
      mockPrisma.accessReview.create.mockResolvedValueOnce({
        id: 'rev-2', userId: 'u-1', reviewType: 'stale_user', action: 'pending',
      });

      const { AccessReviewService } = await import('../src/access-review-service.js');
      const svc = new AccessReviewService();
      const result = await svc.scanStaleUsers();

      expect(result.flagged).toBe(1);
      expect(mockPrisma.accessReview.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u-1', reviewType: 'stale_user', action: 'pending',
        }),
      });
    });
  });

  // ── 1D: Tenant admin review (own org) ─────────────────────────────

  describe('listReviews (tenant-scoped)', () => {
    it('lists reviews filtered by tenant', async () => {
      mockPrisma.accessReview.findMany.mockResolvedValueOnce([
        { id: 'rev-1', tenantId: 'tenant-1', action: 'pending' },
      ]);
      mockPrisma.accessReview.count.mockResolvedValueOnce(1);

      const { AccessReviewService } = await import('../src/access-review-service.js');
      const svc = new AccessReviewService();
      const result = await svc.listReviews({ page: 1, limit: 50 }, 'tenant-1');

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  // ── 1D: Quarterly Report ──────────────────────────────────────────

  describe('generateQuarterlyReview', () => {
    it('produces correct user counts and MFA rate', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: 'tenant-1', name: 'Acme' });
      mockPrisma.user.findMany.mockResolvedValueOnce([
        makeUser({ id: 'u-1', role: 'tenant_admin', mfaEnabled: true, active: true }),
        makeUser({ id: 'u-2', role: 'analyst', mfaEnabled: false, active: true }),
        makeUser({ id: 'u-3', role: 'analyst', mfaEnabled: false, active: false }),
      ]);
      // Users added in period
      mockPrisma.user.count.mockResolvedValueOnce(1);
      // Users disabled in period
      mockPrisma.user.count.mockResolvedValueOnce(0);
      // Stale users (no session in 90 days)
      mockPrisma.session.findMany.mockResolvedValueOnce([]);

      const { AccessReviewService } = await import('../src/access-review-service.js');
      const svc = new AccessReviewService();
      const report = await svc.generateQuarterlyReview('tenant-1');

      expect(report.totalUsers).toBe(3);
      expect(report.activeUsers).toBe(2);
      expect(report.inactiveUsers).toBe(1);
      expect(report.mfaAdoptionRate).toBeCloseTo(50); // 1/2 active users
      expect(report.roleDistribution).toEqual({ tenant_admin: 1, analyst: 2 });
    });
  });
});
