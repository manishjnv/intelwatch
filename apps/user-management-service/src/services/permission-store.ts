import { AppError } from '@etip/shared-utils';
import { randomUUID } from 'crypto';
import type { CreateRoleInput, UpdateRoleInput } from '../schemas/user-management.js';
import { PERMISSION_RESOURCES, PERMISSION_ACTIONS, BUILT_IN_ROLES } from '../schemas/user-management.js';

/** Role record with permissions and hierarchy. */
export interface RoleRecord {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  inheritsFrom: string | null;
  isBuiltIn: boolean;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

/** Generate the full permission catalog: resource:action for all resources. */
function buildPermissionCatalog(): string[] {
  const perms: string[] = ['*'];
  for (const resource of PERMISSION_RESOURCES) {
    perms.push(`${resource}:*`);
    for (const action of PERMISSION_ACTIONS) {
      perms.push(`${resource}:${action}`);
    }
  }
  return perms;
}

/** Built-in role permission definitions. */
const BUILT_IN_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['*'],
  admin: ['*'],
  analyst: [
    'ioc:*', 'threat_actor:*', 'malware:*', 'vuln:*',
    'hunting:*', 'graph:*', 'alert:*', 'dashboard:*', 'report:*',
    'feed:read', 'correlation:read', 'drp:read',
  ],
  hunter: [
    'ioc:read', 'threat_actor:read', 'malware:read', 'vuln:read',
    'hunting:*', 'graph:read', 'alert:read', 'dashboard:read',
    'correlation:read', 'drp:read',
  ],
};

/** Role hierarchy: higher index = higher privilege. */
const ROLE_HIERARCHY: string[] = ['hunter', 'analyst', 'admin', 'super_admin'];

/**
 * In-memory RBAC permission store.
 * Manages permission catalog, built-in roles, custom roles, and inheritance.
 */
export class PermissionStore {
  private roles = new Map<string, RoleRecord>();
  private readonly permissionCatalog: string[];

  constructor() {
    this.permissionCatalog = buildPermissionCatalog();
    this.seedBuiltInRoles();
  }

  private seedBuiltInRoles(): void {
    const SYSTEM_TENANT = '__system__';
    for (const roleName of BUILT_IN_ROLES) {
      const idx = ROLE_HIERARCHY.indexOf(roleName);
      const inheritsFrom = idx > 0 ? ROLE_HIERARCHY[idx - 1] ?? null : null;
      const role: RoleRecord = {
        id: `builtin-${roleName}`,
        name: roleName,
        description: `Built-in ${roleName} role`,
        permissions: BUILT_IN_PERMISSIONS[roleName] ?? [],
        inheritsFrom,
        isBuiltIn: true,
        tenantId: SYSTEM_TENANT,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.roles.set(role.id, role);
    }
  }

  /** Get the full permission catalog. */
  getCatalog(): string[] {
    return [...this.permissionCatalog];
  }

  /** List all roles visible to a tenant (built-in + tenant custom). */
  listRoles(tenantId: string): RoleRecord[] {
    return Array.from(this.roles.values()).filter(
      (r) => r.tenantId === '__system__' || r.tenantId === tenantId,
    );
  }

  /** Get a role by ID. */
  getRole(roleId: string): RoleRecord | null {
    return this.roles.get(roleId) ?? null;
  }

  /** Find a role by name, considering tenant scope. */
  getRoleByName(name: string, tenantId: string): RoleRecord | null {
    for (const role of this.roles.values()) {
      if (role.name === name && (role.tenantId === '__system__' || role.tenantId === tenantId)) {
        return role;
      }
    }
    return null;
  }

  /** Create a custom role for a tenant. */
  createRole(input: CreateRoleInput, tenantId: string): RoleRecord {
    const existing = this.getRoleByName(input.name, tenantId);
    if (existing) {
      throw new AppError(409, `Role '${input.name}' already exists`, 'ROLE_EXISTS');
    }

    if (input.inheritsFrom) {
      const parent = this.getRoleByName(input.inheritsFrom, tenantId);
      if (!parent) {
        throw new AppError(400, `Parent role '${input.inheritsFrom}' not found`, 'PARENT_ROLE_NOT_FOUND');
      }
    }

    this.validatePermissions(input.permissions);

    const role: RoleRecord = {
      id: randomUUID(),
      name: input.name,
      description: input.description ?? '',
      permissions: input.permissions,
      inheritsFrom: input.inheritsFrom ?? null,
      isBuiltIn: false,
      tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.roles.set(role.id, role);
    return role;
  }

  /** Update a custom role. Built-in roles cannot be modified. */
  updateRole(roleId: string, input: UpdateRoleInput, tenantId: string): RoleRecord {
    const role = this.roles.get(roleId);
    if (!role) throw new AppError(404, 'Role not found', 'ROLE_NOT_FOUND');
    if (role.isBuiltIn) throw new AppError(403, 'Cannot modify built-in roles', 'ROLE_IMMUTABLE');
    if (role.tenantId !== tenantId) throw new AppError(404, 'Role not found', 'ROLE_NOT_FOUND');

    if (input.permissions) this.validatePermissions(input.permissions);
    if (input.name && input.name !== role.name) {
      const dup = this.getRoleByName(input.name, tenantId);
      if (dup) throw new AppError(409, `Role '${input.name}' already exists`, 'ROLE_EXISTS');
    }

    const updated: RoleRecord = {
      ...role,
      name: input.name ?? role.name,
      description: input.description ?? role.description,
      permissions: input.permissions ?? role.permissions,
      inheritsFrom: input.inheritsFrom !== undefined ? (input.inheritsFrom ?? null) : role.inheritsFrom,
      updatedAt: new Date().toISOString(),
    };
    this.roles.set(roleId, updated);
    return updated;
  }

  /** Delete a custom role. Built-in roles cannot be deleted. */
  deleteRole(roleId: string, tenantId: string): void {
    const role = this.roles.get(roleId);
    if (!role) throw new AppError(404, 'Role not found', 'ROLE_NOT_FOUND');
    if (role.isBuiltIn) throw new AppError(403, 'Cannot delete built-in roles', 'ROLE_IMMUTABLE');
    if (role.tenantId !== tenantId) throw new AppError(404, 'Role not found', 'ROLE_NOT_FOUND');
    this.roles.delete(roleId);
  }

  /**
   * Check if a role has a specific permission, with inheritance.
   * Resolves wildcards: `*` matches all, `ioc:*` matches `ioc:read`.
   */
  hasPermission(roleName: string, permission: string, tenantId: string): boolean {
    const role = this.getRoleByName(roleName, tenantId);
    if (!role) return false;
    return this.resolvePermission(role, permission, tenantId, new Set());
  }

  /** Resolve all effective permissions for a role (own + inherited). */
  getEffectivePermissions(roleName: string, tenantId: string): string[] {
    const role = this.getRoleByName(roleName, tenantId);
    if (!role) return [];
    const perms = new Set<string>();
    this.collectPermissions(role, perms, tenantId, new Set());
    return Array.from(perms);
  }

  /** Get the role hierarchy order. */
  getHierarchy(): string[] {
    return [...ROLE_HIERARCHY];
  }

  private resolvePermission(role: RoleRecord, permission: string, tenantId: string, visited: Set<string>): boolean {
    if (visited.has(role.id)) return false;
    visited.add(role.id);

    if (this.matchPermission(role.permissions, permission)) return true;

    if (role.inheritsFrom) {
      const parent = this.getRoleByName(role.inheritsFrom, tenantId);
      if (parent) return this.resolvePermission(parent, permission, tenantId, visited);
    }
    return false;
  }

  private collectPermissions(role: RoleRecord, perms: Set<string>, tenantId: string, visited: Set<string>): void {
    if (visited.has(role.id)) return;
    visited.add(role.id);
    for (const p of role.permissions) perms.add(p);
    if (role.inheritsFrom) {
      const parent = this.getRoleByName(role.inheritsFrom, tenantId);
      if (parent) this.collectPermissions(parent, perms, tenantId, visited);
    }
  }

  private matchPermission(rolePerms: string[], target: string): boolean {
    for (const rp of rolePerms) {
      if (rp === '*') return true;
      if (rp === target) return true;
      if (rp.endsWith(':*')) {
        const resource = rp.slice(0, -2);
        if (target.startsWith(`${resource}:`)) return true;
      }
    }
    return false;
  }

  private validatePermissions(permissions: string[]): void {
    for (const p of permissions) {
      if (p === '*') continue;
      if (!this.permissionCatalog.includes(p)) {
        throw new AppError(400, `Invalid permission: '${p}'`, 'INVALID_PERMISSION');
      }
    }
  }
}
