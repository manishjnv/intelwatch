import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionStore } from '../src/services/permission-store.js';
import { TeamStore } from '../src/services/team-store.js';

describe('TeamStore', () => {
  let store: TeamStore;
  const TENANT = 'tenant-1';
  const ADMIN = 'admin-user-1';

  beforeEach(() => {
    const permStore = new PermissionStore();
    store = new TeamStore(permStore);
  });

  describe('Invite user', () => {
    it('creates a pending team member', () => {
      const member = store.inviteUser({ email: 'alice@acme.com', role: 'analyst' }, TENANT, ADMIN);
      expect(member.status).toBe('pending');
      expect(member.email).toBe('alice@acme.com');
      expect(member.role).toBe('analyst');
      expect(member.invitedBy).toBe(ADMIN);
    });

    it('normalizes email to lowercase', () => {
      const member = store.inviteUser({ email: 'BOB@ACME.COM', role: 'viewer' }, TENANT, ADMIN);
      expect(member.email).toBe('bob@acme.com');
    });

    it('rejects duplicate email in same tenant', () => {
      store.inviteUser({ email: 'dup@acme.com', role: 'viewer' }, TENANT, ADMIN);
      expect(() => store.inviteUser({ email: 'dup@acme.com', role: 'viewer' }, TENANT, ADMIN)).toThrow('already exists');
    });

    it('allows same email in different tenant', () => {
      store.inviteUser({ email: 'cross@acme.com', role: 'viewer' }, 'tenant-a', ADMIN);
      const m = store.inviteUser({ email: 'cross@acme.com', role: 'viewer' }, 'tenant-b', ADMIN);
      expect(m.tenantId).toBe('tenant-b');
    });

    it('rejects invalid role', () => {
      expect(() => store.inviteUser({ email: 'bad@acme.com', role: 'nonexistent_role' }, TENANT, ADMIN)).toThrow('not found');
    });

    it('sets optional name from input', () => {
      const member = store.inviteUser({ email: 'named@acme.com', role: 'viewer', name: 'Alice Smith' }, TENANT, ADMIN);
      expect(member.name).toBe('Alice Smith');
    });
  });

  describe('Accept invite', () => {
    it('transitions from pending to active', () => {
      const m = store.inviteUser({ email: 'new@acme.com', role: 'analyst' }, TENANT, ADMIN);
      const accepted = store.acceptInvite(m.id, TENANT);
      expect(accepted.status).toBe('active');
      expect(accepted.acceptedAt).toBeDefined();
    });

    it('rejects already accepted invite', () => {
      const m = store.inviteUser({ email: 'new2@acme.com', role: 'viewer' }, TENANT, ADMIN);
      store.acceptInvite(m.id, TENANT);
      expect(() => store.acceptInvite(m.id, TENANT)).toThrow('already accepted');
    });
  });

  describe('Role management', () => {
    it('updates user role', () => {
      const m = store.inviteUser({ email: 'role@acme.com', role: 'viewer' }, TENANT, ADMIN);
      const updated = store.updateRole(m.id, 'analyst', TENANT);
      expect(updated.role).toBe('analyst');
    });

    it('rejects invalid role', () => {
      const m = store.inviteUser({ email: 'bad-role@acme.com', role: 'viewer' }, TENANT, ADMIN);
      expect(() => store.updateRole(m.id, 'fake_role', TENANT)).toThrow('not found');
    });
  });

  describe('Deactivate / reactivate', () => {
    it('deactivates a member', () => {
      const m = store.inviteUser({ email: 'deac@acme.com', role: 'viewer' }, TENANT, ADMIN);
      store.acceptInvite(m.id, TENANT);
      const deactivated = store.deactivate(m.id, TENANT);
      expect(deactivated.status).toBe('inactive');
    });

    it('rejects double deactivation', () => {
      const m = store.inviteUser({ email: 'deac2@acme.com', role: 'viewer' }, TENANT, ADMIN);
      store.acceptInvite(m.id, TENANT);
      store.deactivate(m.id, TENANT);
      expect(() => store.deactivate(m.id, TENANT)).toThrow('already deactivated');
    });

    it('reactivates a deactivated member', () => {
      const m = store.inviteUser({ email: 'react@acme.com', role: 'viewer' }, TENANT, ADMIN);
      store.acceptInvite(m.id, TENANT);
      store.deactivate(m.id, TENANT);
      const reactivated = store.reactivate(m.id, TENANT);
      expect(reactivated.status).toBe('active');
    });

    it('rejects reactivation of non-inactive member', () => {
      const m = store.inviteUser({ email: 'active@acme.com', role: 'viewer' }, TENANT, ADMIN);
      store.acceptInvite(m.id, TENANT);
      expect(() => store.reactivate(m.id, TENANT)).toThrow('not deactivated');
    });
  });

  describe('Remove member', () => {
    it('permanently removes a member', () => {
      const m = store.inviteUser({ email: 'remove@acme.com', role: 'viewer' }, TENANT, ADMIN);
      store.removeMember(m.id, TENANT);
      expect(() => store.getMember(m.id, TENANT)).toThrow('not found');
    });
  });

  describe('List and filtering', () => {
    beforeEach(() => {
      store.inviteUser({ email: 'a@acme.com', role: 'analyst', name: 'Alice' }, TENANT, ADMIN);
      const b = store.inviteUser({ email: 'b@acme.com', role: 'viewer', name: 'Bob' }, TENANT, ADMIN);
      store.acceptInvite(b.id, TENANT);
      const c = store.inviteUser({ email: 'c@acme.com', role: 'hunter', name: 'Charlie' }, TENANT, ADMIN);
      store.acceptInvite(c.id, TENANT);
      store.deactivate(c.id, TENANT);
    });

    it('lists all members', () => {
      const result = store.listMembers(TENANT, { page: 1, limit: 50, status: 'all' });
      expect(result.total).toBe(3);
    });

    it('filters by status', () => {
      const active = store.listMembers(TENANT, { page: 1, limit: 50, status: 'active' });
      expect(active.total).toBe(1);
      const pending = store.listMembers(TENANT, { page: 1, limit: 50, status: 'pending' });
      expect(pending.total).toBe(1);
    });

    it('filters by role', () => {
      const result = store.listMembers(TENANT, { page: 1, limit: 50, status: 'all', role: 'viewer' });
      expect(result.total).toBe(1);
    });

    it('searches by name', () => {
      const result = store.listMembers(TENANT, { page: 1, limit: 50, status: 'all', search: 'alice' });
      expect(result.total).toBe(1);
    });

    it('paginates correctly', () => {
      const result = store.listMembers(TENANT, { page: 1, limit: 2, status: 'all' });
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(3);
    });

    it('tenant isolation on listing', () => {
      const result = store.listMembers('other-tenant', { page: 1, limit: 50, status: 'all' });
      expect(result.total).toBe(0);
    });
  });

  describe('Stats', () => {
    it('returns counts by status', () => {
      store.inviteUser({ email: 'x@acme.com', role: 'viewer' }, TENANT, ADMIN);
      const m = store.inviteUser({ email: 'y@acme.com', role: 'viewer' }, TENANT, ADMIN);
      store.acceptInvite(m.id, TENANT);
      const stats = store.getStats(TENANT);
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(1);
      expect(stats.active).toBe(1);
    });
  });
});
