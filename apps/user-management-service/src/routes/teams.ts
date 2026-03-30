import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { TeamStore } from '../services/team-store.js';
import type { AuditLogger } from '../services/audit-logger.js';
import type { OwnershipTransferService } from '../services/ownership-transfer-service.js';
import { InviteUserSchema, UpdateUserRoleSchema, UpdateDesignationSchema, TeamListQuerySchema } from '../schemas/user-management.js';

export interface TeamRouteDeps {
  teamStore: TeamStore;
  auditLogger: AuditLogger;
  ownershipTransfer?: OwnershipTransferService;
}

/** Create team management route plugin. */
export function teamRoutes(deps: TeamRouteDeps) {
  const { teamStore, auditLogger } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /team — List team members with filters. */
    app.get('/team', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const query = TeamListQuerySchema.parse(req.query);
      const result = teamStore.listMembers(tenantId, query);
      return reply.send({ data: result.data, total: result.total, page: query.page, limit: query.limit });
    });

    /** GET /team/stats — Get team member counts by status. */
    app.get('/team/stats', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const stats = teamStore.getStats(tenantId);
      return reply.send({ data: stats });
    });

    /** GET /team/:userId — Get team member details. */
    app.get('/team/:userId', async (req: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const member = teamStore.getMember(req.params.userId, tenantId);
      return reply.send({ data: member });
    });

    /** POST /team/invite — Invite user by email. */
    app.post('/team/invite', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const invitedBy = (req.headers['x-user-id'] as string) || 'system';
      const input = InviteUserSchema.parse(req.body);
      const member = teamStore.inviteUser(input, tenantId, invitedBy);
      auditLogger.log({
        tenantId, userId: invitedBy,
        action: 'team.invite', riskLevel: 'low',
        details: { email: input.email, role: input.role, memberId: member.id },
      });
      return reply.status(201).send({ data: member });
    });

    /** POST /team/:userId/accept — Accept invitation. */
    app.post('/team/:userId/accept', async (req: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const member = teamStore.acceptInvite(req.params.userId, tenantId);
      auditLogger.log({
        tenantId, userId: member.id,
        action: 'team.accept_invite', riskLevel: 'low',
        details: { email: member.email },
      });
      return reply.send({ data: member });
    });

    /** PUT /team/:userId/role — Change user role. */
    app.put('/team/:userId/role', async (req: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const { role } = UpdateUserRoleSchema.parse(req.body);
      const member = teamStore.updateRole(req.params.userId, role, tenantId);
      auditLogger.log({
        tenantId, userId: (req.headers['x-user-id'] as string) || null,
        action: 'team.role_changed', riskLevel: 'high',
        details: { memberId: member.id, email: member.email, newRole: role },
      });
      return reply.send({ data: member });
    });

    /** PUT /team/:userId/designation — Set user designation (cosmetic tag). */
    app.put('/team/:userId/designation', async (req: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const { designation } = UpdateDesignationSchema.parse(req.body);
      const member = teamStore.setDesignation(req.params.userId, tenantId, designation);
      auditLogger.log({
        tenantId, userId: (req.headers['x-user-id'] as string) || null,
        action: 'team.designation_changed', riskLevel: 'low',
        details: { memberId: member.id, email: member.email, designation },
      });
      return reply.send({ data: member });
    });

    /** POST /team/:userId/deactivate — Deactivate a team member. Guards: self-action, last-admin. I-21: triggers ownership transfer. */
    app.post('/team/:userId/deactivate', async (req: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const actorUserId = (req.headers['x-user-id'] as string) || undefined;
      const member = teamStore.deactivate(req.params.userId, tenantId, actorUserId);

      // I-21: Transfer ownership on disable
      let ownershipTransferred = null;
      if (deps.ownershipTransfer) {
        const transferResult = await deps.ownershipTransfer.transferOnDisable(
          req.params.userId, tenantId, actorUserId ?? null,
        );
        if (transferResult) {
          ownershipTransferred = { to: transferResult.to, ...transferResult.transferred };
        }
      }

      auditLogger.log({
        tenantId, userId: (req.headers['x-user-id'] as string) || null,
        action: 'team.deactivated', riskLevel: 'high',
        details: { memberId: member.id, email: member.email, ownershipTransferred },
      });
      return reply.send({ data: member, ownershipTransferred });
    });

    /** POST /team/:userId/reactivate — Reactivate a deactivated member. */
    app.post('/team/:userId/reactivate', async (req: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const member = teamStore.reactivate(req.params.userId, tenantId);
      auditLogger.log({
        tenantId, userId: (req.headers['x-user-id'] as string) || null,
        action: 'team.reactivated', riskLevel: 'medium',
        details: { memberId: member.id, email: member.email },
      });
      return reply.send({ data: member });
    });

    /** DELETE /team/:userId — Remove team member permanently. Guards: self-action, tenant-admin protection. */
    app.delete('/team/:userId', async (req: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const actorUserId = (req.headers['x-user-id'] as string) || undefined;
      teamStore.removeMember(req.params.userId, tenantId, actorUserId);
      auditLogger.log({
        tenantId, userId: (req.headers['x-user-id'] as string) || null,
        action: 'team.removed', riskLevel: 'high',
        details: { memberId: req.params.userId },
      });
      return reply.status(204).send();
    });
  };
}
