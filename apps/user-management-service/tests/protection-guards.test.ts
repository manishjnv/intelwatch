import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionStore } from '../src/services/permission-store.js';
import { TeamStore } from '../src/services/team-store.js';

describe('Protection Guards (I-03, I-04, I-05)', () => {
  let store: TeamStore;
  const TENANT = 'tenant-1';
  const OTHER_TENANT = 'tenant-2';
  const ADMIN_USER = 'admin-user-1';

  beforeEach(() => {
    const permStore = new PermissionStore();
    store = new TeamStore(permStore);
  });

  // ─── I-03: Designation Field ─────────────────────────────────

  describe('I-03: Designation field', () => {
    it('creates member with null designation by default', () => {
      const member = store.inviteUser({ email: 'a@test.com', role: 'analyst' }, TENANT, ADMIN_USER);
      expect(member.designation).toBeNull();
    });

    it('sets designation on a team member', () => {
      const member = store.inviteUser({ email: 'a@test.com', role: 'analyst' }, TENANT, ADMIN_USER);
      const updated = store.setDesignation(member.id, TENANT, 'Malware Expert');
      expect(updated.designation).toBe('Malware Expert');
    });

    it('clears designation when set to null', () => {
      const member = store.inviteUser({ email: 'a@test.com', role: 'analyst' }, TENANT, ADMIN_USER);
      store.setDesignation(member.id, TENANT, 'Hunter');
      const cleared = store.setDesignation(member.id, TENANT, null);
      expect(cleared.designation).toBeNull();
    });

    it('rejects designation longer than 50 characters', () => {
      const member = store.inviteUser({ email: 'a@test.com', role: 'analyst' }, TENANT, ADMIN_USER);
      const longDesignation = 'A'.repeat(51);
      expect(() => store.setDesignation(member.id, TENANT, longDesignation))
        .toThrow('50 characters');
    });

    it('accepts designation of exactly 50 characters', () => {
      const member = store.inviteUser({ email: 'a@test.com', role: 'analyst' }, TENANT, ADMIN_USER);
      const exact50 = 'A'.repeat(50);
      const updated = store.setDesignation(member.id, TENANT, exact50);
      expect(updated.designation).toBe(exact50);
    });

    it('returns designation in getMember response', () => {
      const member = store.inviteUser({ email: 'a@test.com', role: 'analyst' }, TENANT, ADMIN_USER);
      store.setDesignation(member.id, TENANT, 'Lead Analyst');
      const fetched = store.getMember(member.id, TENANT);
      expect(fetched.designation).toBe('Lead Analyst');
    });

    it('returns designation in listMembers response', () => {
      const member = store.inviteUser({ email: 'a@test.com', role: 'analyst' }, TENANT, ADMIN_USER);
      store.setDesignation(member.id, TENANT, 'SOC Lead');
      const list = store.listMembers(TENANT, { page: 1, limit: 50, status: 'all' });
      expect(list.data[0]?.designation).toBe('SOC Lead');
    });

    it('throws 404 for non-existent member', () => {
      expect(() => store.setDesignation('non-existent', TENANT, 'Hunter'))
        .toThrow('not found');
    });
  });

  // ─── I-04: Tenant Admin Delete Protection ────────────────────

  describe('I-04: Tenant admin delete protection', () => {
    it('rejects deletion of tenant_admin user', () => {
      const admin = store.inviteUser({ email: 'admin@test.com', role: 'tenant_admin' }, TENANT, ADMIN_USER);
      store.acceptInvite(admin.id, TENANT);
      expect(() => store.removeMember(admin.id, TENANT))
        .toThrow('cannot be deleted');
    });

    it('returns TENANT_ADMIN_UNDELETABLE error code', () => {
      const admin = store.inviteUser({ email: 'admin@test.com', role: 'tenant_admin' }, TENANT, ADMIN_USER);
      store.acceptInvite(admin.id, TENANT);
      try {
        store.removeMember(admin.id, TENANT);
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        expect((err as { code: string }).code).toBe('TENANT_ADMIN_UNDELETABLE');
      }
    });

    it('allows deletion of analyst user', () => {
      const analyst = store.inviteUser({ email: 'analyst@test.com', role: 'analyst' }, TENANT, ADMIN_USER);
      store.removeMember(analyst.id, TENANT);
      expect(() => store.getMember(analyst.id, TENANT)).toThrow('not found');
    });
  });

  // ─── I-05 Guard A: Cannot disable/delete self ───────────────

  describe('I-05 Guard A: Cannot disable/delete self', () => {
    it('rejects self-deactivation', () => {
      const user = store.inviteUser({ email: 'self@test.com', role: 'analyst' }, TENANT, ADMIN_USER);
      store.acceptInvite(user.id, TENANT);
      expect(() => store.deactivate(user.id, TENANT, user.id))
        .toThrow('cannot disable or delete your own account');
    });

    it('rejects self-deletion', () => {
      const user = store.inviteUser({ email: 'self@test.com', role: 'analyst' }, TENANT, ADMIN_USER);
      expect(() => store.removeMember(user.id, TENANT, user.id))
        .toThrow('cannot disable or delete your own account');
    });

    it('returns SELF_ACTION_DENIED error code on self-deactivate', () => {
      const user = store.inviteUser({ email: 'self@test.com', role: 'analyst' }, TENANT, ADMIN_USER);
      store.acceptInvite(user.id, TENANT);
      try {
        store.deactivate(user.id, TENANT, user.id);
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        expect((err as { code: string }).code).toBe('SELF_ACTION_DENIED');
      }
    });

    it('allows deactivating another user', () => {
      const target = store.inviteUser({ email: 'target@test.com', role: 'analyst' }, TENANT, ADMIN_USER);
      store.acceptInvite(target.id, TENANT);
      const result = store.deactivate(target.id, TENANT, 'different-user');
      expect(result.status).toBe('inactive');
    });
  });

  // ─── I-05 Guard B: Cannot disable own org ────────────────────

  describe('I-05 Guard B: Cannot disable own org', () => {
    it('rejects tenant_admin disabling own org', () => {
      expect(() => store.validateOrgDisable(TENANT, TENANT, 'tenant_admin'))
        .toThrow('Cannot disable your own organization');
    });

    it('returns ORG_SELF_DISABLE_DENIED error code', () => {
      try {
        store.validateOrgDisable(TENANT, TENANT, 'tenant_admin');
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        expect((err as { code: string }).code).toBe('ORG_SELF_DISABLE_DENIED');
      }
    });

    it('allows super_admin disabling any org', () => {
      expect(() => store.validateOrgDisable(TENANT, TENANT, 'super_admin'))
        .not.toThrow();
    });

    it('allows tenant_admin disabling a different org', () => {
      expect(() => store.validateOrgDisable(TENANT, OTHER_TENANT, 'tenant_admin'))
        .not.toThrow();
    });
  });

  // ─── I-05 Guard C: Min 1 active tenant_admin per org ─────────

  describe('I-05 Guard C: Last active tenant_admin protection', () => {
    it('rejects disabling the last active tenant_admin', () => {
      const admin = store.inviteUser({ email: 'admin@test.com', role: 'tenant_admin' }, TENANT, ADMIN_USER);
      store.acceptInvite(admin.id, TENANT);
      expect(() => store.deactivate(admin.id, TENANT, 'other-user'))
        .toThrow('last active tenant admin');
    });

    it('returns LAST_ADMIN_PROTECTED error code', () => {
      const admin = store.inviteUser({ email: 'admin@test.com', role: 'tenant_admin' }, TENANT, ADMIN_USER);
      store.acceptInvite(admin.id, TENANT);
      try {
        store.deactivate(admin.id, TENANT, 'other-user');
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        expect((err as { code: string }).code).toBe('LAST_ADMIN_PROTECTED');
      }
    });

    it('allows disabling tenant_admin when 2+ exist', () => {
      const admin1 = store.inviteUser({ email: 'admin1@test.com', role: 'tenant_admin' }, TENANT, ADMIN_USER);
      const admin2 = store.inviteUser({ email: 'admin2@test.com', role: 'tenant_admin' }, TENANT, ADMIN_USER);
      store.acceptInvite(admin1.id, TENANT);
      store.acceptInvite(admin2.id, TENANT);
      const result = store.deactivate(admin1.id, TENANT, admin2.id);
      expect(result.status).toBe('inactive');
    });

    it('rejects demoting last tenant_admin to analyst', () => {
      const admin = store.inviteUser({ email: 'admin@test.com', role: 'tenant_admin' }, TENANT, ADMIN_USER);
      store.acceptInvite(admin.id, TENANT);
      expect(() => store.updateRole(admin.id, 'analyst', TENANT))
        .toThrow('last active tenant admin');
    });

    it('allows demoting tenant_admin when 2+ exist', () => {
      const admin1 = store.inviteUser({ email: 'admin1@test.com', role: 'tenant_admin' }, TENANT, ADMIN_USER);
      const admin2 = store.inviteUser({ email: 'admin2@test.com', role: 'tenant_admin' }, TENANT, ADMIN_USER);
      store.acceptInvite(admin1.id, TENANT);
      store.acceptInvite(admin2.id, TENANT);
      const result = store.updateRole(admin1.id, 'analyst', TENANT);
      expect(result.role).toBe('analyst');
    });

    it('does not count inactive tenant_admins toward the count', () => {
      const admin1 = store.inviteUser({ email: 'admin1@test.com', role: 'tenant_admin' }, TENANT, ADMIN_USER);
      const admin2 = store.inviteUser({ email: 'admin2@test.com', role: 'tenant_admin' }, TENANT, ADMIN_USER);
      store.acceptInvite(admin1.id, TENANT);
      store.acceptInvite(admin2.id, TENANT);
      // Deactivate admin2 first (2 exist, so allowed)
      store.deactivate(admin2.id, TENANT, admin1.id);
      // Now admin1 is the last active — should be protected
      expect(() => store.deactivate(admin1.id, TENANT, 'other-user'))
        .toThrow('last active tenant admin');
    });
  });
});
