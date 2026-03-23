import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PermissionStore } from '../services/permission-store.js';
import type { AuditLogger } from '../services/audit-logger.js';
import { CreateRoleSchema, UpdateRoleSchema, CheckPermissionSchema } from '../schemas/user-management.js';

export interface PermissionRouteDeps {
  permissionStore: PermissionStore;
  auditLogger: AuditLogger;
}

/** Create permission/RBAC route plugin. */
export function permissionRoutes(deps: PermissionRouteDeps) {
  const { permissionStore, auditLogger } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /permissions — List all permissions in catalog. */
    app.get('/permissions', async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ data: permissionStore.getCatalog() });
    });

    /** GET /permissions/hierarchy — Get role hierarchy. */
    app.get('/permissions/hierarchy', async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ data: permissionStore.getHierarchy() });
    });

    /** GET /roles — List all roles (built-in + custom). */
    app.get('/roles', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const roles = permissionStore.listRoles(tenantId);
      return reply.send({ data: roles, total: roles.length });
    });

    /** GET /roles/:id — Get role details with effective permissions. */
    app.get('/roles/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const role = permissionStore.getRole(req.params.id);
      if (!role) return reply.status(404).send({ error: { code: 'ROLE_NOT_FOUND', message: 'Role not found' } });
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const effective = permissionStore.getEffectivePermissions(role.name, tenantId);
      return reply.send({ data: { ...role, effectivePermissions: effective } });
    });

    /** POST /roles — Create custom role. */
    app.post('/roles', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const input = CreateRoleSchema.parse(req.body);
      const role = permissionStore.createRole(input, tenantId);
      auditLogger.log({
        tenantId, userId: (req.headers['x-user-id'] as string) || null,
        action: 'role.created', riskLevel: 'medium',
        details: { roleId: role.id, roleName: role.name, permissions: role.permissions },
      });
      return reply.status(201).send({ data: role });
    });

    /** PUT /roles/:id — Update custom role. */
    app.put('/roles/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const input = UpdateRoleSchema.parse(req.body);
      const role = permissionStore.updateRole(req.params.id, input, tenantId);
      auditLogger.log({
        tenantId, userId: (req.headers['x-user-id'] as string) || null,
        action: 'role.updated', riskLevel: 'medium',
        details: { roleId: role.id, changes: input },
      });
      return reply.send({ data: role });
    });

    /** DELETE /roles/:id — Delete custom role. */
    app.delete('/roles/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      permissionStore.deleteRole(req.params.id, tenantId);
      auditLogger.log({
        tenantId, userId: (req.headers['x-user-id'] as string) || null,
        action: 'role.deleted', riskLevel: 'high',
        details: { roleId: req.params.id },
      });
      return reply.status(204).send();
    });

    /** POST /roles/check — Check if role has permission. */
    app.post('/roles/check', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const { role, permission } = CheckPermissionSchema.parse(req.body);
      const allowed = permissionStore.hasPermission(role, permission, tenantId);
      return reply.send({ data: { role, permission, allowed } });
    });
  };
}
