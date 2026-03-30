/**
 * E2E Suite 7: Audit ↔ Compliance ↔ Access Review
 * Tests: audit hash chain integrity, compliance report generation,
 * access review auto-disable, DSAR export isolation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import { AppError } from '@etip/shared-utils';

const TENANT_A = '550e8400-e29b-41d4-a716-446655440001';
const TENANT_B = '550e8400-e29b-41d4-a716-446655440002';
const SYSTEM_TENANT = '00000000-0000-0000-0000-000000000000';

// ─── Audit Hash Chain ──────────────────────────────────────────────

interface AuditEntry {
  id: number;
  tenantId: string;
  userId: string | null;
  action: string;
  metadata: Record<string, unknown>;
  previousHash: string;
  hash: string;
  createdAt: Date;
}

function computeEntryHash(entry: Omit<AuditEntry, 'hash'>): string {
  const payload = JSON.stringify({
    id: entry.id, tenantId: entry.tenantId, userId: entry.userId,
    action: entry.action, metadata: entry.metadata,
    previousHash: entry.previousHash, createdAt: entry.createdAt.toISOString(),
  });
  return createHash('sha256').update(payload).digest('hex');
}

function createAuditChain(count: number, tenantId: string): AuditEntry[] {
  const chain: AuditEntry[] = [];
  let previousHash = '0'.repeat(64); // Genesis hash
  for (let i = 1; i <= count; i++) {
    const entry: Omit<AuditEntry, 'hash'> = {
      id: i, tenantId, userId: `u-${i}`, action: `action.${i}`,
      metadata: { detail: `entry-${i}` }, previousHash,
      createdAt: new Date(Date.now() - (count - i) * 60000),
    };
    const hash = computeEntryHash(entry);
    chain.push({ ...entry, hash });
    previousHash = hash;
  }
  return chain;
}

function verifyChainIntegrity(chain: AuditEntry[]): { valid: boolean; brokenAt?: number } {
  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i]!;
    const expectedHash = computeEntryHash({ ...entry });
    if (expectedHash !== entry.hash) return { valid: false, brokenAt: i + 1 };
    if (i > 0 && entry.previousHash !== chain[i - 1]!.hash) return { valid: false, brokenAt: i + 1 };
  }
  return { valid: true };
}

// ─── Compliance Reports ────────────────────────────────────────────

interface MockUser {
  id: string; email: string; role: string; tenantId: string;
  mfaEnabled: boolean; active: boolean; lastLoginAt: Date | null;
  createdAt: Date;
}

let mockUsers: MockUser[] = [];
let mockAuditEntries: AuditEntry[] = [];

function generateSoc2Report(tenantId: string, periodFrom: Date, periodTo: Date) {
  const tenantUsers = mockUsers.filter((u) => u.tenantId === tenantId);
  const mfaPercent = tenantUsers.length > 0
    ? Math.round((tenantUsers.filter((u) => u.mfaEnabled).length / tenantUsers.length) * 100)
    : 0;
  const roleDistribution: Record<string, number> = {};
  tenantUsers.forEach((u) => { roleDistribution[u.role] = (roleDistribution[u.role] ?? 0) + 1; });

  const accessChanges = mockAuditEntries.filter(
    (e) => e.tenantId === tenantId && e.createdAt >= periodFrom && e.createdAt <= periodTo
      && (e.action.includes('user.') || e.action.includes('role.')),
  );

  return {
    type: 'soc2_access_review',
    tenantId,
    period: { from: periodFrom.toISOString(), to: periodTo.toISOString() },
    userCount: tenantUsers.length,
    mfaAdoptionPercent: mfaPercent,
    roleDistribution,
    accessChanges: accessChanges.length,
    generatedAt: new Date().toISOString(),
  };
}

function generateDsar(userId: string, requestorTenantId: string) {
  const user = mockUsers.find((u) => u.id === userId);
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');

  // Tenant isolation: requestor must be in same tenant
  if (user.tenantId !== requestorTenantId) {
    throw new AppError(403, 'Cannot access other tenant user data', 'FORBIDDEN');
  }

  const userAudit = mockAuditEntries.filter((e) => e.userId === userId);

  return {
    type: 'gdpr_dsar',
    user: { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt.toISOString() },
    auditEntries: userAudit.length,
    sessions: 3, // Mock count
    createdContent: { investigations: 2, reports: 1 },
    generatedAt: new Date().toISOString(),
  };
}

// ─── Access Review ─────────────────────────────────────────────────

interface AccessReview { id: string; userId: string; tenantId: string; status: string; createdAt: Date; expiresAt: Date; }

function scanStaleUsers(tenantId: string | null, staleDays: number): AccessReview[] {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  const stale = mockUsers.filter((u) => {
    if (tenantId && u.tenantId !== tenantId) return false;
    if (!u.active) return false;
    return !u.lastLoginAt || u.lastLoginAt < cutoff;
  });

  return stale.map((u) => ({
    id: `review-${u.id}`, userId: u.id, tenantId: u.tenantId,
    status: 'pending', createdAt: new Date(),
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day grace
  }));
}

function autoDisableExpiredReviews(reviews: AccessReview[], isLastAdmin: (userId: string, tenantId: string) => boolean) {
  const results: Array<{ userId: string; disabled: boolean; reason?: string }> = [];
  for (const review of reviews) {
    if (review.status !== 'pending') continue;
    if (review.expiresAt > new Date()) continue; // Not expired yet

    if (isLastAdmin(review.userId, review.tenantId)) {
      results.push({ userId: review.userId, disabled: false, reason: 'last_admin_protected' });
      continue;
    }

    const user = mockUsers.find((u) => u.id === review.userId);
    if (user) user.active = false;
    results.push({ userId: review.userId, disabled: true });
  }
  return results;
}

function seedTestData() {
  mockUsers = [
    { id: 'u-admin-001', email: 'admin@acme.com', role: 'tenant_admin', tenantId: TENANT_A, mfaEnabled: true, active: true, lastLoginAt: new Date(), createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    { id: 'u-analyst-001', email: 'analyst@acme.com', role: 'analyst', tenantId: TENANT_A, mfaEnabled: false, active: true, lastLoginAt: new Date(Date.now() - 65 * 24 * 60 * 60 * 1000), createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) },
    { id: 'u-super-001', email: 'super@system.etip', role: 'super_admin', tenantId: SYSTEM_TENANT, mfaEnabled: true, active: true, lastLoginAt: new Date(Date.now() - 65 * 24 * 60 * 60 * 1000), createdAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
    { id: 'u-b-001', email: 'admin@globex.com', role: 'tenant_admin', tenantId: TENANT_B, mfaEnabled: false, active: true, lastLoginAt: new Date(), createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
  ];

  const now = new Date();
  mockAuditEntries = createAuditChain(10, TENANT_A);
  // Add user-related audit entries for SOC2 report
  mockAuditEntries.push({
    id: 11, tenantId: TENANT_A, userId: 'u-admin-001', action: 'user.created',
    metadata: { email: 'analyst@acme.com' }, previousHash: mockAuditEntries[9]!.hash,
    hash: 'placeholder', createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
  });
  mockAuditEntries[10]!.hash = computeEntryHash(mockAuditEntries[10]!);
}

describe('Suite 7: Audit ↔ Compliance ↔ Access Review', () => {
  beforeEach(seedTestData);

  describe('Audit hash chain integrity', () => {
    it('10-entry chain verifies as VALID', () => {
      const chain = createAuditChain(10, TENANT_A);
      expect(verifyChainIntegrity(chain).valid).toBe(true);
    });

    it('tampered entry #5 breaks chain at position 5', () => {
      const chain = createAuditChain(10, TENANT_A);
      chain[4]!.metadata = { detail: 'TAMPERED' };
      const result = verifyChainIntegrity(chain);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(5);
    });

    it('tampered entry #1 breaks chain at position 1', () => {
      const chain = createAuditChain(10, TENANT_A);
      chain[0]!.action = 'tampered.action';
      const result = verifyChainIntegrity(chain);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(1);
    });

    it('empty chain is valid', () => {
      expect(verifyChainIntegrity([]).valid).toBe(true);
    });
  });

  describe('Compliance report generation', () => {
    it('SOC2 report includes user list, MFA %, role distribution', () => {
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const to = new Date();
      const report = generateSoc2Report(TENANT_A, from, to);
      expect(report.type).toBe('soc2_access_review');
      expect(report.userCount).toBe(2); // admin + analyst in tenant A
      expect(report.mfaAdoptionPercent).toBe(50); // 1 of 2 has MFA
      expect(report.roleDistribution).toEqual({ tenant_admin: 1, analyst: 1 });
    });

    it('DSAR includes profile, sessions, audit logs, created content', () => {
      const dsar = generateDsar('u-admin-001', TENANT_A);
      expect(dsar.type).toBe('gdpr_dsar');
      expect(dsar.user.email).toBe('admin@acme.com');
      expect(dsar.auditEntries).toBeGreaterThan(0);
      expect(dsar.sessions).toBeDefined();
      expect(dsar.createdContent).toBeDefined();
    });

    it('DSAR for other tenant user returns 403', () => {
      expect(() => generateDsar('u-b-001', TENANT_A)).toThrow('Cannot access other tenant user data');
    });

    it('DSAR for non-existent user returns 404', () => {
      expect(() => generateDsar('u-nonexistent', TENANT_A)).toThrow('User not found');
    });
  });

  describe('Access review auto-disable', () => {
    it('scans stale super_admins (65 days inactive)', () => {
      const reviews = scanStaleUsers(null, 60);
      const superReview = reviews.find((r) => r.userId === 'u-super-001');
      expect(superReview).toBeDefined();
      expect(superReview!.status).toBe('pending');
    });

    it('scans stale tenant users (65 days inactive)', () => {
      const reviews = scanStaleUsers(TENANT_A, 60);
      const analystReview = reviews.find((r) => r.userId === 'u-analyst-001');
      expect(analystReview).toBeDefined();
    });

    it('active users are NOT flagged', () => {
      const reviews = scanStaleUsers(TENANT_A, 60);
      const adminReview = reviews.find((r) => r.userId === 'u-admin-001');
      expect(adminReview).toBeUndefined(); // admin logged in today
    });

    it('auto-disable triggered after 14-day grace period', () => {
      const reviews = scanStaleUsers(TENANT_A, 60);
      // Simulate 14-day grace period expired
      reviews.forEach((r) => { r.expiresAt = new Date(Date.now() - 1000); });

      const isLastAdmin = (userId: string, tenantId: string) => {
        return mockUsers.filter((u) => u.tenantId === tenantId && u.role === 'tenant_admin' && u.active && u.id !== userId).length === 0;
      };

      const results = autoDisableExpiredReviews(reviews, isLastAdmin);
      const analystResult = results.find((r) => r.userId === 'u-analyst-001');
      expect(analystResult?.disabled).toBe(true);

      // Verify user is actually disabled
      const analyst = mockUsers.find((u) => u.id === 'u-analyst-001');
      expect(analyst?.active).toBe(false);
    });

    it('last active super_admin NOT auto-disabled', () => {
      const reviews = scanStaleUsers(null, 60);
      reviews.forEach((r) => { r.expiresAt = new Date(Date.now() - 1000); });

      const isLastAdmin = (userId: string, tenantId: string) => {
        if (tenantId === SYSTEM_TENANT) {
          return mockUsers.filter((u) => u.tenantId === SYSTEM_TENANT && u.role === 'super_admin' && u.active && u.id !== userId).length === 0;
        }
        return mockUsers.filter((u) => u.tenantId === tenantId && u.role === 'tenant_admin' && u.active && u.id !== userId).length === 0;
      };

      const results = autoDisableExpiredReviews(reviews, isLastAdmin);
      const superResult = results.find((r) => r.userId === 'u-super-001');
      expect(superResult?.disabled).toBe(false);
      expect(superResult?.reason).toBe('last_admin_protected');
    });
  });
});
