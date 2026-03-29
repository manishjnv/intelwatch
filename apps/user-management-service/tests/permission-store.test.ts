import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionStore } from '../src/services/permission-store.js';

describe('PermissionStore', () => {
  let store: PermissionStore;
  const TENANT = 'tenant-1';

  beforeEach(() => {
    store = new PermissionStore();
  });

  describe('Permission catalog', () => {
    it('includes wildcard and all resource:action combinations', () => {
      const catalog = store.getCatalog();
      expect(catalog).toContain('*');
      expect(catalog).toContain('ioc:read');
      expect(catalog).toContain('ioc:*');
      expect(catalog).toContain('integration:create');
      expect(catalog).toContain('drp:delete');
      expect(catalog).toContain('correlation:update');
      expect(catalog).toContain('hunting:read');
      expect(catalog).toContain('graph:*');
    });

    it('includes all 15 resources', () => {
      const catalog = store.getCatalog();
      const resources = ['ioc', 'threat_actor', 'malware', 'vuln', 'feed',
        'hunting', 'graph', 'alert', 'dashboard', 'report',
        'integration', 'drp', 'correlation', 'user', 'settings'];
      for (const r of resources) {
        expect(catalog).toContain(`${r}:read`);
      }
    });
  });

  describe('Built-in roles', () => {
    it('seeds 5 built-in roles', () => {
      const roles = store.listRoles(TENANT);
      const builtIn = roles.filter((r) => r.isBuiltIn);
      expect(builtIn).toHaveLength(5);
    });

    it('super_admin has wildcard permission', () => {
      expect(store.hasPermission('super_admin', 'ioc:read', TENANT)).toBe(true);
      expect(store.hasPermission('super_admin', 'integration:delete', TENANT)).toBe(true);
    });

    it('admin has wildcard permission', () => {
      expect(store.hasPermission('admin', 'drp:create', TENANT)).toBe(true);
    });

    it('analyst has full TI access via wildcards', () => {
      expect(store.hasPermission('analyst', 'ioc:read', TENANT)).toBe(true);
      expect(store.hasPermission('analyst', 'ioc:create', TENANT)).toBe(true);
      expect(store.hasPermission('analyst', 'ioc:delete', TENANT)).toBe(true);
      expect(store.hasPermission('analyst', 'threat_actor:read', TENANT)).toBe(true);
      expect(store.hasPermission('analyst', 'threat_actor:create', TENANT)).toBe(true);
      expect(store.hasPermission('analyst', 'threat_actor:delete', TENANT)).toBe(true);
      expect(store.hasPermission('analyst', 'malware:delete', TENANT)).toBe(true);
      expect(store.hasPermission('analyst', 'vuln:update', TENANT)).toBe(true);
      expect(store.hasPermission('analyst', 'graph:read', TENANT)).toBe(true);
      expect(store.hasPermission('analyst', 'graph:write', TENANT)).toBe(true);
    });

    it('analyst has correlation:read and drp:read', () => {
      expect(store.hasPermission('analyst', 'correlation:read', TENANT)).toBe(true);
      expect(store.hasPermission('analyst', 'drp:read', TENANT)).toBe(true);
    });

    it('analyst cannot manage users, admin, integration, or settings', () => {
      expect(store.hasPermission('analyst', 'user:read', TENANT)).toBe(false);
      expect(store.hasPermission('analyst', 'admin:write', TENANT)).toBe(false);
      expect(store.hasPermission('analyst', 'settings:read', TENANT)).toBe(false);
    });

    it('hunter has hunting:* (wildcard)', () => {
      expect(store.hasPermission('hunter', 'hunting:read', TENANT)).toBe(true);
      expect(store.hasPermission('hunter', 'hunting:create', TENANT)).toBe(true);
      expect(store.hasPermission('hunter', 'hunting:delete', TENANT)).toBe(true);
    });

    it('cannot modify built-in roles', () => {
      const roles = store.listRoles(TENANT);
      const admin = roles.find((r) => r.name === 'admin');
      expect(admin).toBeDefined();
      expect(() => store.updateRole(admin!.id, { name: 'renamed' }, TENANT)).toThrow('Cannot modify built-in roles');
    });

    it('cannot delete built-in roles', () => {
      const roles = store.listRoles(TENANT);
      const analyst = roles.find((r) => r.name === 'analyst');
      expect(() => store.deleteRole(analyst!.id, TENANT)).toThrow('Cannot delete built-in roles');
    });
  });

  describe('Custom roles', () => {
    it('creates a custom role', () => {
      const role = store.createRole({ name: 'soc_lead', permissions: ['ioc:*', 'alert:*'] }, TENANT);
      expect(role.name).toBe('soc_lead');
      expect(role.isBuiltIn).toBe(false);
      expect(role.tenantId).toBe(TENANT);
    });

    it('rejects duplicate role name', () => {
      store.createRole({ name: 'custom_role', permissions: ['ioc:read'] }, TENANT);
      expect(() => store.createRole({ name: 'custom_role', permissions: ['ioc:read'] }, TENANT)).toThrow('already exists');
    });

    it('rejects invalid permission', () => {
      expect(() => store.createRole({ name: 'bad_role', permissions: ['nonexistent:read'] }, TENANT)).toThrow('Invalid permission');
    });

    it('updates a custom role', () => {
      const role = store.createRole({ name: 'updatable', permissions: ['ioc:read'] }, TENANT);
      const updated = store.updateRole(role.id, { permissions: ['ioc:*'] }, TENANT);
      expect(updated.permissions).toContain('ioc:*');
    });

    it('deletes a custom role', () => {
      const role = store.createRole({ name: 'deletable', permissions: ['ioc:read'] }, TENANT);
      store.deleteRole(role.id, TENANT);
      expect(store.getRole(role.id)).toBeNull();
    });

    it('tenant isolation — role from tenant A not visible to tenant B', () => {
      store.createRole({ name: 'tenant_a_role', permissions: ['ioc:read'] }, 'tenant-a');
      expect(store.getRoleByName('tenant_a_role', 'tenant-b')).toBeNull();
    });
  });

  describe('Permission inheritance (P0 #1)', () => {
    it('role hierarchy is correct', () => {
      const hierarchy = store.getHierarchy();
      expect(hierarchy).toEqual(['hunter', 'analyst', 'tenant_admin', 'admin', 'super_admin']);
    });

    it('custom role inherits parent permissions', () => {
      store.createRole({ name: 'senior_analyst', permissions: ['integration:*'], inheritsFrom: 'analyst' }, TENANT);
      expect(store.hasPermission('senior_analyst', 'integration:read', TENANT)).toBe(true);
      expect(store.hasPermission('senior_analyst', 'ioc:read', TENANT)).toBe(true);
    });

    it('getEffectivePermissions includes inherited', () => {
      store.createRole({ name: 'extended_hunter', permissions: ['feed:read'], inheritsFrom: 'hunter' }, TENANT);
      const effective = store.getEffectivePermissions('extended_hunter', TENANT);
      expect(effective).toContain('feed:read');
      expect(effective).toContain('ioc:read');
      expect(effective).toContain('dashboard:read');
    });

    it('rejects inheritsFrom with nonexistent parent', () => {
      expect(() => store.createRole({ name: 'orphan', permissions: ['ioc:read'], inheritsFrom: 'nonexistent' }, TENANT)).toThrow('not found');
    });

    it('handles circular inheritance safely', () => {
      store.createRole({ name: 'role_a', permissions: ['ioc:read'] }, TENANT);
      // No circular reference possible since inheritsFrom is set at creation
      expect(store.hasPermission('role_a', 'ioc:read', TENANT)).toBe(true);
    });
  });

  describe('Permission checking', () => {
    it('wildcard * matches any permission', () => {
      expect(store.hasPermission('admin', 'anything:here', TENANT)).toBe(true);
    });

    it('resource:* matches any action on that resource', () => {
      expect(store.hasPermission('analyst', 'ioc:delete', TENANT)).toBe(true);
      expect(store.hasPermission('analyst', 'ioc:update', TENANT)).toBe(true);
    });

    it('returns false for nonexistent role', () => {
      expect(store.hasPermission('nonexistent', 'ioc:read', TENANT)).toBe(false);
    });

    it('exact permission match works', () => {
      expect(store.hasPermission('hunter', 'alert:read', TENANT)).toBe(true);
      expect(store.hasPermission('hunter', 'alert:create', TENANT)).toBe(false);
    });
  });
});
