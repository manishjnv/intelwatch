/**
 * @module @etip/shared-auth/permissions
 * @description Role-based access control (RBAC) permission definitions.
 * Maps roles to permission strings. Supports wildcard matching.
 *
 * Permission format: `resource:action`
 * Wildcard: `resource:*` grants all actions on resource, `*` grants everything.
 */
import type { Role } from '@etip/shared-types';

/** All permission strings used in the platform */
export const PERMISSIONS = {
  // IOC
  IOC_READ: 'ioc:read',
  IOC_CREATE: 'ioc:create',
  IOC_UPDATE: 'ioc:update',
  IOC_DELETE: 'ioc:delete',
  // Threat Actor
  ACTOR_READ: 'threat_actor:read',
  ACTOR_CREATE: 'threat_actor:create',
  ACTOR_UPDATE: 'threat_actor:update',
  ACTOR_DELETE: 'threat_actor:delete',
  // Malware
  MALWARE_READ: 'malware:read',
  MALWARE_CREATE: 'malware:create',
  MALWARE_UPDATE: 'malware:update',
  MALWARE_DELETE: 'malware:delete',
  // Vulnerability
  VULN_READ: 'vuln:read',
  VULN_CREATE: 'vuln:create',
  VULN_UPDATE: 'vuln:update',
  // Hunting
  HUNTING_READ: 'hunting:read',
  HUNTING_CREATE: 'hunting:create',
  HUNTING_UPDATE: 'hunting:update',
  HUNTING_DELETE: 'hunting:delete',
  // Graph
  GRAPH_READ: 'graph:read',
  GRAPH_WRITE: 'graph:write',
  // Alerts
  ALERT_READ: 'alert:read',
  ALERT_CREATE: 'alert:create',
  ALERT_UPDATE: 'alert:update',
  // Dashboard
  DASHBOARD_READ: 'dashboard:read',
  // Reports
  REPORT_READ: 'report:read',
  REPORT_CREATE: 'report:create',
  // Feed management
  FEED_READ: 'feed:read',
  FEED_CREATE: 'feed:create',
  FEED_UPDATE: 'feed:update',
  FEED_DELETE: 'feed:delete',
  // User management
  USER_READ: 'user:read',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  // Integration
  INTEGRATION_READ: 'integration:read',
  INTEGRATION_CREATE: 'integration:create',
  INTEGRATION_UPDATE: 'integration:update',
  INTEGRATION_DELETE: 'integration:delete',
  // Admin
  ADMIN_READ: 'admin:read',
  ADMIN_WRITE: 'admin:write',
  // Audit
  AUDIT_READ: 'audit:read',
  // Settings
  SETTINGS_READ: 'settings:read',
  SETTINGS_UPDATE: 'settings:update',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Maps each role to its granted permission strings.
 * Uses wildcard `*` for super_admin, resource wildcards for others.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly string[]> = {
  super_admin: ['*'],

  tenant_admin: [
    'ioc:*', 'threat_actor:*', 'malware:*', 'vuln:*',
    'hunting:*', 'graph:*', 'alert:*', 'dashboard:*', 'report:*',
    'feed:*', 'user:*', 'integration:*', 'settings:*', 'audit:read',
  ],

  analyst: [
    'ioc:read', 'ioc:create', 'ioc:update',
    'threat_actor:read', 'threat_actor:create',
    'malware:read', 'malware:create',
    'vuln:read',
    'hunting:*',
    'graph:read',
    'alert:read', 'alert:create', 'alert:update',
    'dashboard:read',
    'report:read', 'report:create',
    'feed:read',
  ],

  viewer: [
    'ioc:read', 'threat_actor:read', 'malware:read', 'vuln:read',
    'graph:read', 'alert:read', 'dashboard:read', 'report:read',
    'feed:read',
  ],

  api_only: [
    'ioc:read', 'ioc:create',
    'threat_actor:read',
    'vuln:read',
  ],
} as const;

/**
 * Check whether a role has a specific permission.
 * Supports exact match and wildcard matching:
 * - `*` matches everything
 * - `resource:*` matches `resource:read`, `resource:create`, etc.
 *
 * @param role - User's role
 * @param required - Permission string to check (e.g. `ioc:create`)
 * @returns true if the role grants this permission
 */
export function hasPermission(role: Role, required: string): boolean {
  const granted = ROLE_PERMISSIONS[role];
  if (!granted) return false;

  for (const perm of granted) {
    // Full wildcard — super_admin
    if (perm === '*') return true;

    // Exact match
    if (perm === required) return true;

    // Resource wildcard: `ioc:*` matches `ioc:read`
    if (perm.endsWith(':*')) {
      const resource = perm.slice(0, -2);
      if (required.startsWith(resource + ':')) return true;
    }
  }

  return false;
}

/**
 * Check whether a role has ALL of the specified permissions.
 */
export function hasAllPermissions(role: Role, required: string[]): boolean {
  return required.every((perm) => hasPermission(role, perm));
}

/**
 * Check whether a role has ANY of the specified permissions.
 */
export function hasAnyPermission(role: Role, required: string[]): boolean {
  return required.some((perm) => hasPermission(role, perm));
}

/**
 * Get all permissions for a role, resolving wildcards.
 * Useful for including in JWT payload for client-side checks.
 */
export function getResolvedPermissions(role: Role): string[] {
  const granted = ROLE_PERMISSIONS[role];
  if (!granted) return [];
  // For wildcard roles, return the raw wildcards — client resolves
  return [...granted];
}
