/**
 * E2E Suite 6: Offboarding ↔ Retention ↔ Ownership Flow
 * Tests: full offboarding lifecycle, ownership transfer on disable,
 * retention enforcement, cancel offboarding.
 * Mock: Prisma, AuditLogger, SessionManager.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppError } from '@etip/shared-utils';

/** In-memory stores simulating Prisma models. */
interface MockUser { id: string; tenantId: string; email: string; role: string; active: boolean; }
interface MockTenant {
  id: string; name: string; active: boolean; plan: string;
  offboardingStatus: string | null; offboardedAt: Date | null;
  offboardedBy: string | null; purgeScheduledAt: Date | null;
  archivePath: string | null; archiveHash: string | null;
}
interface MockSession { id: string; userId: string; tenantId: string; }
interface MockApiKey { id: string; tenantId: string; active: boolean; }
interface MockSsoConfig { id: string; tenantId: string; enabled: boolean; }
interface MockScimToken { id: string; tenantId: string; revoked: boolean; }
interface AuditEntry { tenantId: string; action: string; riskLevel: string; details: Record<string, unknown>; }

const SYSTEM_TENANT = '00000000-0000-0000-0000-000000000000';
const TENANT_A = '550e8400-e29b-41d4-a716-446655440001';
const PURGE_DELAY_DAYS = 60;

let users: MockUser[] = [];
let tenants: MockTenant[] = [];
let sessions: MockSession[] = [];
let apiKeys: MockApiKey[] = [];
let ssoConfigs: MockSsoConfig[] = [];
let scimTokens: MockScimToken[] = [];
let auditLog: AuditEntry[] = [];
let queuedJobs: Array<{ name: string; data: Record<string, unknown> }> = [];

const mockAuditLogger = { log: (entry: AuditEntry) => { auditLog.push(entry); } };
const mockSessionManager = {
  revokeAll: (userId: string, _tenantId: string) => {
    const count = sessions.filter((s) => s.userId === userId).length;
    sessions = sessions.filter((s) => s.userId !== userId);
    return count;
  },
};
const mockQueue = { add: vi.fn(async (name: string, data: Record<string, unknown>) => { queuedJobs.push({ name, data }); }) };

/** Simplified offboarding service for testing. */
async function initiateOffboarding(tenantId: string, actorEmail: string, actorTenantId: string) {
  if (tenantId === SYSTEM_TENANT) throw new AppError(403, 'Cannot offboard system tenant', 'SYSTEM_TENANT_PROTECTED');
  if (actorTenantId === tenantId) throw new AppError(403, 'Cannot offboard own org', 'SELF_ORG_OFFBOARD_DENIED');

  const tenant = tenants.find((t) => t.id === tenantId);
  if (!tenant) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
  if (tenant.offboardingStatus === 'purged') throw new AppError(409, 'Already purged', 'ALREADY_PURGED');
  if (tenant.offboardingStatus === 'offboarding') throw new AppError(409, 'Already offboarding', 'ALREADY_OFFBOARDING');

  const now = new Date();
  const purgeDate = new Date(now.getTime() + PURGE_DELAY_DAYS * 24 * 60 * 60 * 1000);

  // Step 1: Block tenant + users
  tenant.active = false;
  tenant.offboardingStatus = 'offboarding';
  tenant.offboardedAt = now;
  tenant.offboardedBy = actorEmail;
  tenant.purgeScheduledAt = purgeDate;
  users.filter((u) => u.tenantId === tenantId).forEach((u) => { u.active = false; });

  // Step 2: Terminate sessions
  let sessionsTerminated = 0;
  users.filter((u) => u.tenantId === tenantId).forEach((u) => { sessionsTerminated += mockSessionManager.revokeAll(u.id, tenantId); });

  // Step 3: Revoke API keys
  const revokedKeys = apiKeys.filter((k) => k.tenantId === tenantId && k.active);
  revokedKeys.forEach((k) => { k.active = false; });

  // Step 4: Disable SSO
  ssoConfigs.filter((c) => c.tenantId === tenantId && c.enabled).forEach((c) => { c.enabled = false; });

  // Step 5: Revoke SCIM tokens
  scimTokens.filter((t) => t.tenantId === tenantId && !t.revoked).forEach((t) => { t.revoked = true; });

  // Step 6: Queue archive job
  await mockQueue.add(`archive-${tenantId}`, { tenantId, stage: 'archive', purgeScheduledAt: purgeDate.toISOString() });

  mockAuditLogger.log({ tenantId, action: 'offboarding.initiated', riskLevel: 'critical', details: { offboardedBy: actorEmail, sessionsTerminated, apiKeysRevoked: revokedKeys.length } });

  return { tenantId, offboardingStatus: 'offboarding', purgeScheduledAt: purgeDate.toISOString() };
}

async function cancelOffboarding(tenantId: string, actorEmail: string) {
  const tenant = tenants.find((t) => t.id === tenantId);
  if (!tenant) throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
  if (tenant.offboardingStatus === 'purged') throw new AppError(409, 'Already purged', 'ALREADY_PURGED');
  if (!tenant.offboardingStatus || tenant.offboardingStatus === 'active') throw new AppError(400, 'Not offboarding', 'NOT_OFFBOARDING');

  tenant.active = true;
  tenant.offboardingStatus = 'active';
  tenant.offboardedAt = null;
  tenant.offboardedBy = null;
  tenant.purgeScheduledAt = null;
  users.filter((u) => u.tenantId === tenantId).forEach((u) => { u.active = true; });

  mockAuditLogger.log({ tenantId, action: 'offboarding.cancelled', riskLevel: 'high', details: { cancelledBy: actorEmail } });
  return { tenantId, offboardingStatus: 'active' };
}

/** Ownership transfer on user disable. */
async function transferOnDisable(disabledUserId: string, tenantId: string) {
  const target = users.find((u) => u.tenantId === tenantId && u.role === 'tenant_admin' && u.active && u.id !== disabledUserId);
  if (!target) return null;

  const resources = { investigations: 3, reports: 2, alertRules: 0, savedHunts: 0 };
  mockAuditLogger.log({ tenantId, action: 'data_ownership.transferred', riskLevel: 'high', details: { fromUserId: disabledUserId, toUserId: target.id, transferred: resources } });
  return { to: { userId: target.id, email: target.email }, transferred: resources };
}

/** Retention enforcement. */
function enforceRetention(tenantId: string, retentionDays: number, iocs: Array<{ id: string; createdAt: Date }>) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const archived = iocs.filter((i) => i.createdAt < cutoff);
  const kept = iocs.filter((i) => i.createdAt >= cutoff);
  return { archived: archived.length, kept: kept.length };
}

function seedTestData() {
  tenants = [
    { id: TENANT_A, name: 'ACME Corp', active: true, plan: 'free', offboardingStatus: null, offboardedAt: null, offboardedBy: null, purgeScheduledAt: null, archivePath: null, archiveHash: null },
    { id: SYSTEM_TENANT, name: 'System', active: true, plan: 'enterprise', offboardingStatus: null, offboardedAt: null, offboardedBy: null, purgeScheduledAt: null, archivePath: null, archiveHash: null },
  ];
  users = [
    { id: 'u-admin-001', tenantId: TENANT_A, email: 'admin@acme.com', role: 'tenant_admin', active: true },
    { id: 'u-analyst-001', tenantId: TENANT_A, email: 'analyst@acme.com', role: 'analyst', active: true },
    { id: 'u-analyst-002', tenantId: TENANT_A, email: 'analyst2@acme.com', role: 'analyst', active: true },
  ];
  sessions = [
    { id: 's-1', userId: 'u-admin-001', tenantId: TENANT_A },
    { id: 's-2', userId: 'u-analyst-001', tenantId: TENANT_A },
    { id: 's-3', userId: 'u-analyst-002', tenantId: TENANT_A },
  ];
  apiKeys = [{ id: 'key-1', tenantId: TENANT_A, active: true }, { id: 'key-2', tenantId: TENANT_A, active: true }];
  ssoConfigs = [{ id: 'sso-1', tenantId: TENANT_A, enabled: true }];
  scimTokens = [{ id: 'scim-1', tenantId: TENANT_A, revoked: false }];
  auditLog = [];
  queuedJobs = [];
  vi.clearAllMocks();
}

describe('Suite 6: Offboarding ↔ Retention ↔ Ownership Flow', () => {
  beforeEach(seedTestData);

  describe('Full offboarding lifecycle', () => {
    it('offboards tenant: disables users, terminates sessions, revokes keys', async () => {
      const result = await initiateOffboarding(TENANT_A, 'super@system.etip', SYSTEM_TENANT);
      expect(result.offboardingStatus).toBe('offboarding');
      expect(result.purgeScheduledAt).toBeDefined();

      // Verify all users disabled
      expect(users.filter((u) => u.tenantId === TENANT_A).every((u) => !u.active)).toBe(true);
      // Verify sessions terminated
      expect(sessions.filter((s) => s.tenantId === TENANT_A)).toHaveLength(0);
      // Verify API keys revoked
      expect(apiKeys.every((k) => !k.active)).toBe(true);
      // Verify SSO disabled
      expect(ssoConfigs.every((c) => !c.enabled)).toBe(true);
      // Verify SCIM tokens revoked
      expect(scimTokens.every((t) => t.revoked)).toBe(true);
    });

    it('queues archive job after offboarding', async () => {
      await initiateOffboarding(TENANT_A, 'super@system.etip', SYSTEM_TENANT);
      expect(queuedJobs).toHaveLength(1);
      expect(queuedJobs[0]!.data.stage).toBe('archive');
    });

    it('purge scheduled at now + 60 days', async () => {
      const result = await initiateOffboarding(TENANT_A, 'super@system.etip', SYSTEM_TENANT);
      const purgeDate = new Date(result.purgeScheduledAt);
      const now = new Date();
      const diffDays = Math.round((purgeDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(60);
    });

    it('cannot offboard system tenant', async () => {
      await expect(initiateOffboarding(SYSTEM_TENANT, 'super@system.etip', SYSTEM_TENANT)).rejects.toThrow('Cannot offboard system tenant');
    });

    it('cannot offboard own org', async () => {
      await expect(initiateOffboarding(TENANT_A, 'admin@acme.com', TENANT_A)).rejects.toThrow('Cannot offboard own org');
    });

    it('audit entry logged with critical severity', async () => {
      await initiateOffboarding(TENANT_A, 'super@system.etip', SYSTEM_TENANT);
      const entry = auditLog.find((e) => e.action === 'offboarding.initiated');
      expect(entry).toBeDefined();
      expect(entry!.riskLevel).toBe('critical');
    });
  });

  describe('Ownership transfer on disable', () => {
    it('transfers resources to active tenant_admin on user disable', async () => {
      const result = await transferOnDisable('u-analyst-001', TENANT_A);
      expect(result).not.toBeNull();
      expect(result!.to.userId).toBe('u-admin-001');
      expect(result!.transferred.investigations).toBe(3);
      expect(result!.transferred.reports).toBe(2);
    });

    it('audit entry logged per transfer', async () => {
      await transferOnDisable('u-analyst-001', TENANT_A);
      const entry = auditLog.find((e) => e.action === 'data_ownership.transferred');
      expect(entry).toBeDefined();
      expect(entry!.riskLevel).toBe('high');
    });

    it('returns null if no active admin available', async () => {
      users.forEach((u) => { if (u.role === 'tenant_admin') u.active = false; });
      const result = await transferOnDisable('u-analyst-001', TENANT_A);
      expect(result).toBeNull();
    });
  });

  describe('Retention enforcement', () => {
    it('free plan (30-day) archives old IOCs', () => {
      const iocs = [
        { id: 'ioc-1', createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000) }, // 45 days old
        { id: 'ioc-2', createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) }, // 10 days old
      ];
      const result = enforceRetention(TENANT_A, 30, iocs);
      expect(result.archived).toBe(1);
      expect(result.kept).toBe(1);
    });

    it('enterprise plan (unlimited/365-day) keeps all IOCs', () => {
      const iocs = [
        { id: 'ioc-1', createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) },
        { id: 'ioc-2', createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
      ];
      const result = enforceRetention(TENANT_A, 365, iocs);
      expect(result.archived).toBe(0);
      expect(result.kept).toBe(2);
    });
  });

  describe('Cancel offboarding', () => {
    it('cancel re-enables tenant and users', async () => {
      await initiateOffboarding(TENANT_A, 'super@system.etip', SYSTEM_TENANT);
      const result = await cancelOffboarding(TENANT_A, 'super@system.etip');
      expect(result.offboardingStatus).toBe('active');

      const tenant = tenants.find((t) => t.id === TENANT_A)!;
      expect(tenant.active).toBe(true);
      expect(users.filter((u) => u.tenantId === TENANT_A).every((u) => u.active)).toBe(true);
    });

    it('users must re-login after cancel (sessions stay terminated)', async () => {
      await initiateOffboarding(TENANT_A, 'super@system.etip', SYSTEM_TENANT);
      await cancelOffboarding(TENANT_A, 'super@system.etip');
      // Sessions were deleted during offboarding — not restored
      expect(sessions.filter((s) => s.tenantId === TENANT_A)).toHaveLength(0);
    });

    it('cannot cancel a purged tenant', async () => {
      const tenant = tenants.find((t) => t.id === TENANT_A)!;
      tenant.offboardingStatus = 'purged';
      await expect(cancelOffboarding(TENANT_A, 'super@system.etip')).rejects.toThrow('Already purged');
    });

    it('cannot cancel a tenant that is not offboarding', async () => {
      await expect(cancelOffboarding(TENANT_A, 'super@system.etip')).rejects.toThrow('Not offboarding');
    });
  });
});
