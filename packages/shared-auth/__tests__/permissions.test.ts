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
    it('analyst has full TI access via wildcards', () => {
      expect(hasPermission('analyst', 'ioc:read')).toBe(true);
      expect(hasPermission('analyst', 'ioc:create')).toBe(true);
      expect(hasPermission('analyst', 'ioc:update')).toBe(true);
      expect(hasPermission('analyst', 'ioc:delete')).toBe(true);
      expect(hasPermission('analyst', 'threat_actor:read')).toBe(true);
      expect(hasPermission('analyst', 'threat_actor:create')).toBe(true);
      expect(hasPermission('analyst', 'threat_actor:delete')).toBe(true);
      expect(hasPermission('analyst', 'malware:read')).toBe(true);
      expect(hasPermission('analyst', 'malware:delete')).toBe(true);
      expect(hasPermission('analyst', 'vuln:read')).toBe(true);
      expect(hasPermission('analyst', 'vuln:update')).toBe(true);
      expect(hasPermission('analyst', 'graph:read')).toBe(true);
      expect(hasPermission('analyst', 'graph:write')).toBe(true);
      expect(hasPermission('analyst', 'alert:read')).toBe(true);
      expect(hasPermission('analyst', 'alert:create')).toBe(true);
      expect(hasPermission('analyst', 'alert:update')).toBe(true);
      expect(hasPermission('analyst', 'dashboard:read')).toBe(true);
      expect(hasPermission('analyst', 'report:read')).toBe(true);
      expect(hasPermission('analyst', 'report:create')).toBe(true);
    });
    it('analyst has hunting:* wildcard', () => {
      expect(hasPermission('analyst', 'hunting:read')).toBe(true);
      expect(hasPermission('analyst', 'hunting:create')).toBe(true);
      expect(hasPermission('analyst', 'hunting:delete')).toBe(true);
    });
    it('analyst can read feeds but not manage them', () => {
      expect(hasPermission('analyst', 'feed:read')).toBe(true);
      expect(hasPermission('analyst', 'feed:create')).toBe(false);
      expect(hasPermission('analyst', 'feed:delete')).toBe(false);
    });
    it('analyst cannot manage users', () => {
      expect(hasPermission('analyst', 'user:read')).toBe(false);
      expect(hasPermission('analyst', 'user:create')).toBe(false);
    });
    it('analyst cannot access admin, integration, settings, audit', () => {
      expect(hasPermission('analyst', 'admin:read')).toBe(false);
      expect(hasPermission('analyst', 'admin:write')).toBe(false);
      expect(hasPermission('analyst', 'integration:read')).toBe(false);
      expect(hasPermission('analyst', 'settings:read')).toBe(false);
      expect(hasPermission('analyst', 'audit:read')).toBe(false);
    });
  });
  describe('hasAllPermissions', () => {
    it('returns true when role has all required permissions', () => { expect(hasAllPermissions('analyst', ['ioc:read', 'ioc:create', 'dashboard:read'])).toBe(true); });
    it('returns false when role is missing one permission', () => { expect(hasAllPermissions('analyst', ['ioc:read', 'user:read'])).toBe(false); });
    it('returns true for empty array', () => { expect(hasAllPermissions('analyst', [])).toBe(true); });
  });
  describe('hasAnyPermission', () => {
    it('returns true when role has at least one required permission', () => { expect(hasAnyPermission('analyst', ['user:create', 'ioc:read'])).toBe(true); });
    it('returns false when role has none of the required permissions', () => { expect(hasAnyPermission('analyst', ['admin:write', 'user:create'])).toBe(false); });
    it('returns false for empty array', () => { expect(hasAnyPermission('analyst', [])).toBe(false); });
  });
  describe('getResolvedPermissions', () => {
    it('returns wildcard for super_admin', () => { expect(getResolvedPermissions('super_admin')).toContain('*'); });
    it('returns TI wildcard permissions for analyst', () => {
      const perms = getResolvedPermissions('analyst');
      expect(perms).toContain('ioc:*');
      expect(perms).toContain('hunting:*');
      expect(perms).toContain('feed:read');
      expect(perms).not.toContain('user:*');
    });
  });
  describe('ROLE_PERMISSIONS completeness', () => {
    it('has entries for all defined roles', () => {
      for (const role of ['super_admin', 'tenant_admin', 'analyst']) { expect(ROLE_PERMISSIONS).toHaveProperty(role); }
    });
    it('does not have removed roles', () => {
      expect(ROLE_PERMISSIONS).not.toHaveProperty('viewer');
      expect(ROLE_PERMISSIONS).not.toHaveProperty('api_only');
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
