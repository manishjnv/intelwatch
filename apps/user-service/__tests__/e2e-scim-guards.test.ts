/**
 * E2E Suite 8: SCIM ↔ Guards ↔ Quota Integration
 * Tests: SCIM de-provision triggers guards, SCIM respects plan limits,
 * SCIM de-provision triggers ownership transfer.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppError } from '@etip/shared-utils';

const TENANT_A = '550e8400-e29b-41d4-a716-446655440001';

interface MockUser {
  id: string; tenantId: string; email: string; role: string;
  active: boolean; scimExternalId?: string;
}
interface MockSession { id: string; userId: string; tenantId: string; }
interface MockApiKey { id: string; userId: string; tenantId: string; active: boolean; }
interface AuditEntry { tenantId: string; action: string; riskLevel: string; details: Record<string, unknown>; }

let users: MockUser[] = [];
let sessions: MockSession[] = [];
let apiKeys: MockApiKey[] = [];
let auditLog: AuditEntry[] = [];
let transferLog: Array<{ fromUserId: string; toUserId: string; tenantId: string }> = [];
let planLimits: { maxUsers: number; currentUsers: number; plan: string } = { maxUsers: 1, currentUsers: 1, plan: 'free' };

/** Simulated SCIM de-provision flow with all guards. */
async function scimDeprovision(externalId: string, tenantId: string) {
  const user = users.find((u) => u.scimExternalId === externalId && u.tenantId === tenantId);
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');

  // Guard I-05: cannot deprovision last tenant_admin
  if (user.role === 'tenant_admin') {
    const activeAdmins = users.filter((u) => u.tenantId === tenantId && u.role === 'tenant_admin' && u.active);
    if (activeAdmins.length <= 1) {
      throw new AppError(409, 'Cannot deprovision the last tenant admin', 'LAST_ADMIN_PROTECTED');
    }
  }

  // Step 1: Disable user
  user.active = false;

  // Step 2: Terminate sessions
  const userSessions = sessions.filter((s) => s.userId === user.id);
  sessions = sessions.filter((s) => s.userId !== user.id);

  // Step 3: Revoke API keys
  const revokedKeys = apiKeys.filter((k) => k.userId === user.id && k.active);
  revokedKeys.forEach((k) => { k.active = false; });

  // Step 4: Trigger ownership transfer (I-21)
  const target = users.find((u) => u.tenantId === tenantId && u.role === 'tenant_admin' && u.active && u.id !== user.id);
  if (target) {
    transferLog.push({ fromUserId: user.id, toUserId: target.id, tenantId });
    auditLog.push({
      tenantId, action: 'data_ownership.transferred', riskLevel: 'high',
      details: { fromUserId: user.id, toUserId: target.id, trigger: 'scim_deprovision' },
    });
  }

  auditLog.push({
    tenantId, action: 'scim.user.deprovisioned', riskLevel: 'medium',
    details: {
      userId: user.id, externalId, sessionsTerminated: userSessions.length,
      apiKeysRevoked: revokedKeys.length,
    },
  });

  return { id: user.id, status: 'deprovisioned', sessionsTerminated: userSessions.length, apiKeysRevoked: revokedKeys.length };
}

/** Simulated SCIM provision flow with plan limit check. */
async function scimProvision(email: string, externalId: string, tenantId: string) {
  // Check plan limits
  if (planLimits.currentUsers >= planLimits.maxUsers) {
    throw new AppError(409, `Plan ${planLimits.plan} allows max ${planLimits.maxUsers} users`, 'PLAN_LIMIT_EXCEEDED');
  }

  const user: MockUser = {
    id: `u-scim-${Date.now()}`, tenantId, email, role: 'analyst',
    active: true, scimExternalId: externalId,
  };
  users.push(user);
  planLimits.currentUsers++;

  auditLog.push({
    tenantId, action: 'scim.user.provisioned', riskLevel: 'low',
    details: { userId: user.id, email, externalId },
  });

  return { id: user.id, email, role: 'analyst', active: true };
}

function seedTestData() {
  users = [
    { id: 'u-admin-001', tenantId: TENANT_A, email: 'admin@acme.com', role: 'tenant_admin', active: true, scimExternalId: 'ext-admin-001' },
    { id: 'u-analyst-001', tenantId: TENANT_A, email: 'analyst@acme.com', role: 'analyst', active: true, scimExternalId: 'ext-analyst-001' },
    { id: 'u-analyst-002', tenantId: TENANT_A, email: 'analyst2@acme.com', role: 'analyst', active: true, scimExternalId: 'ext-analyst-002' },
  ];
  sessions = [
    { id: 's-1', userId: 'u-analyst-001', tenantId: TENANT_A },
    { id: 's-2', userId: 'u-analyst-001', tenantId: TENANT_A },
    { id: 's-3', userId: 'u-analyst-002', tenantId: TENANT_A },
  ];
  apiKeys = [
    { id: 'key-1', userId: 'u-analyst-001', tenantId: TENANT_A, active: true },
    { id: 'key-2', userId: 'u-analyst-002', tenantId: TENANT_A, active: true },
  ];
  auditLog = [];
  transferLog = [];
  planLimits = { maxUsers: 5, currentUsers: 3, plan: 'starter' };
  vi.clearAllMocks();
}

describe('Suite 8: SCIM ↔ Guards ↔ Quota Integration', () => {
  beforeEach(seedTestData);

  describe('SCIM de-provision triggers all guards', () => {
    it('SCIM DELETE on analyst disables + terminates sessions + revokes keys', async () => {
      const result = await scimDeprovision('ext-analyst-001', TENANT_A);
      expect(result.status).toBe('deprovisioned');
      expect(result.sessionsTerminated).toBe(2);
      expect(result.apiKeysRevoked).toBe(1);

      // Verify user disabled
      const user = users.find((u) => u.id === 'u-analyst-001');
      expect(user?.active).toBe(false);

      // Verify sessions deleted
      expect(sessions.filter((s) => s.userId === 'u-analyst-001')).toHaveLength(0);

      // Verify API keys revoked
      expect(apiKeys.find((k) => k.userId === 'u-analyst-001')?.active).toBe(false);
    });

    it('SCIM DELETE on last tenant_admin is rejected (I-05 guard)', async () => {
      await expect(scimDeprovision('ext-admin-001', TENANT_A))
        .rejects.toThrow('Cannot deprovision the last tenant admin');
    });

    it('SCIM de-provision triggers ownership transfer (I-21)', async () => {
      await scimDeprovision('ext-analyst-001', TENANT_A);

      // Ownership transfer logged
      expect(transferLog).toHaveLength(1);
      expect(transferLog[0]!.fromUserId).toBe('u-analyst-001');
      expect(transferLog[0]!.toUserId).toBe('u-admin-001');

      // Audit entry for transfer
      const transferAudit = auditLog.find((e) => e.action === 'data_ownership.transferred');
      expect(transferAudit).toBeDefined();
      expect(transferAudit!.details.trigger).toBe('scim_deprovision');
    });

    it('SCIM de-provision audit entry logged', async () => {
      await scimDeprovision('ext-analyst-001', TENANT_A);
      const audit = auditLog.find((e) => e.action === 'scim.user.deprovisioned');
      expect(audit).toBeDefined();
      expect(audit!.details.sessionsTerminated).toBe(2);
      expect(audit!.details.apiKeysRevoked).toBe(1);
    });

    it('SCIM DELETE on non-existent user returns 404', async () => {
      await expect(scimDeprovision('ext-nonexistent', TENANT_A)).rejects.toThrow('User not found');
    });
  });

  describe('SCIM respects plan limits', () => {
    it('SCIM POST at maxUsers is rejected', async () => {
      planLimits = { maxUsers: 3, currentUsers: 3, plan: 'free' };
      await expect(scimProvision('new@acme.com', 'ext-new-001', TENANT_A))
        .rejects.toThrow('Plan free allows max 3 users');
    });

    it('SCIM POST under maxUsers succeeds', async () => {
      planLimits = { maxUsers: 10, currentUsers: 3, plan: 'starter' };
      const result = await scimProvision('new@acme.com', 'ext-new-001', TENANT_A);
      expect(result.email).toBe('new@acme.com');
      expect(result.role).toBe('analyst'); // Default SCIM-provisioned role
      expect(result.active).toBe(true);
    });

    it('after upgrade, SCIM POST succeeds', async () => {
      // Simulate free plan at capacity
      planLimits = { maxUsers: 1, currentUsers: 1, plan: 'free' };
      await expect(scimProvision('new@acme.com', 'ext-new-001', TENANT_A)).rejects.toThrow('Plan free allows max 1 users');

      // Upgrade to starter
      planLimits = { maxUsers: 10, currentUsers: 1, plan: 'starter' };
      const result = await scimProvision('new@acme.com', 'ext-new-001', TENANT_A);
      expect(result.active).toBe(true);
    });

    it('SCIM provision audit entry logged', async () => {
      planLimits = { maxUsers: 10, currentUsers: 3, plan: 'starter' };
      await scimProvision('new@acme.com', 'ext-new-001', TENANT_A);
      const audit = auditLog.find((e) => e.action === 'scim.user.provisioned');
      expect(audit).toBeDefined();
      expect(audit!.details.email).toBe('new@acme.com');
    });

    it('SCIM provision increments user count', async () => {
      planLimits = { maxUsers: 10, currentUsers: 3, plan: 'starter' };
      await scimProvision('new@acme.com', 'ext-new-001', TENANT_A);
      expect(planLimits.currentUsers).toBe(4);
    });
  });
});
