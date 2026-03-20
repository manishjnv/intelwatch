import { describe, it, expect } from 'vitest';
import { hasPermission, hasAllPermissions, hasAnyPermission, getResolvedPermissions, ROLE_PERMISSIONS, PERMISSIONS } from '../src/permissions.js';

describe('RBAC Permissions', () => {
  describe('hasPermission', () => {
    it('super_admin has all permissions via wildcard', () => {
      expect(hasPermission('super_admin', 'ioc:read')).toBe(true);
      expect(hasPermission('super_admin', 'ioc:delete')).toBe(true);
      expect(hasPermission('super_admin', 'admin:write')).toBe(true);
      expect(hasPermission('super_admin', 'anything:whatever')).toBe(true);
    });
    it('tenant_admin has ioc:* wildcard', () => {
      expect(hasPermission('tenant_admin', 'ioc:read')).toBe(true);
      expect(hasPermission('tenant_admin', 'ioc:create')).toBe(true);
      expect(hasPermission('tenant_admin', 'ioc:delete')).toBe(true);
    });
    it('tenant_admin has user:* wildcard', () => {
      expect(hasPermission('tenant_admin', 'user:read')).toBe(true);
      expect(hasPermission('tenant_admin', 'user:create')).toBe(true);
      expect(hasPermission('tenant_admin', 'user:delete')).toBe(true);
    });
    it('tenant_admin does NOT have admin:write', () => { expect(hasPermission('tenant_admin', 'admin:write')).toBe(false); });
    it('tenant_admin has audit:read but not audit:write', () => {
      expect(hasPermission('tenant_admin', 'audit:read')).toBe(true);
      expect(hasPermission('tenant_admin', 'audit:write')).toBe(false);
    });
    it('analyst can read and create IOCs', () => {
      expect(hasPermission('analyst', 'ioc:read')).toBe(true);
      expect(hasPermission('analyst', 'ioc:create')).toBe(true);
      expect(hasPermission('analyst', 'ioc:update')).toBe(true);
    });
    it('analyst cannot delete IOCs', () => { expect(hasPermission('analyst', 'ioc:delete')).toBe(false); });
    it('analyst has hunting:* wildcard', () => {
      expect(hasPermission('analyst', 'hunting:read')).toBe(true);
      expect(hasPermission('analyst', 'hunting:create')).toBe(true);
      expect(hasPermission('analyst', 'hunting:delete')).toBe(true);
    });
    it('analyst cannot manage users', () => {
      expect(hasPermission('analyst', 'user:read')).toBe(false);
      expect(hasPermission('analyst', 'user:create')).toBe(false);
    });
    it('viewer can only read IOCs', () => {
      expect(hasPermission('viewer', 'ioc:read')).toBe(true);
      expect(hasPermission('viewer', 'ioc:create')).toBe(false);
      expect(hasPermission('viewer', 'ioc:update')).toBe(false);
      expect(hasPermission('viewer', 'ioc:delete')).toBe(false);
    });
    it('viewer can read dashboard', () => { expect(hasPermission('viewer', 'dashboard:read')).toBe(true); });
    it('viewer cannot create anything', () => {
      expect(hasPermission('viewer', 'ioc:create')).toBe(false);
      expect(hasPermission('viewer', 'alert:create')).toBe(false);
      expect(hasPermission('viewer', 'hunting:create')).toBe(false);
    });
    it('api_only has minimal permissions', () => {
      expect(hasPermission('api_only', 'ioc:read')).toBe(true);
      expect(hasPermission('api_only', 'ioc:create')).toBe(true);
      expect(hasPermission('api_only', 'threat_actor:read')).toBe(true);
      expect(hasPermission('api_only', 'vuln:read')).toBe(true);
    });
    it('api_only cannot access dashboard or hunting', () => {
      expect(hasPermission('api_only', 'dashboard:read')).toBe(false);
      expect(hasPermission('api_only', 'hunting:read')).toBe(false);
    });
  });
  describe('hasAllPermissions', () => {
    it('returns true when role has all required permissions', () => { expect(hasAllPermissions('analyst', ['ioc:read', 'ioc:create', 'dashboard:read'])).toBe(true); });
    it('returns false when role is missing one permission', () => { expect(hasAllPermissions('viewer', ['ioc:read', 'ioc:create'])).toBe(false); });
    it('returns true for empty array', () => { expect(hasAllPermissions('viewer', [])).toBe(true); });
  });
  describe('hasAnyPermission', () => {
    it('returns true when role has at least one required permission', () => { expect(hasAnyPermission('viewer', ['ioc:create', 'ioc:read'])).toBe(true); });
    it('returns false when role has none of the required permissions', () => { expect(hasAnyPermission('api_only', ['dashboard:read', 'admin:write'])).toBe(false); });
    it('returns false for empty array', () => { expect(hasAnyPermission('viewer', [])).toBe(false); });
  });
  describe('getResolvedPermissions', () => {
    it('returns wildcard for super_admin', () => { expect(getResolvedPermissions('super_admin')).toContain('*'); });
    it('returns specific permissions for viewer', () => {
      const perms = getResolvedPermissions('viewer');
      expect(perms).toContain('ioc:read');
      expect(perms).not.toContain('ioc:create');
    });
  });
  describe('ROLE_PERMISSIONS completeness', () => {
    it('has entries for all defined roles', () => {
      for (const role of ['super_admin', 'tenant_admin', 'analyst', 'viewer', 'api_only']) { expect(ROLE_PERMISSIONS).toHaveProperty(role); }
    });
  });
  describe('PERMISSIONS constants', () => {
    it('has expected permission keys', () => {
      expect(PERMISSIONS.IOC_READ).toBe('ioc:read');
      expect(PERMISSIONS.ADMIN_WRITE).toBe('admin:write');
      expect(PERMISSIONS.AUDIT_READ).toBe('audit:read');
    });
  });
});
