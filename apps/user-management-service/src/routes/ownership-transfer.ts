/**
 * @module OwnershipTransferRoutes
 * @description I-21 — Manual ownership transfer endpoint.
 * Allows tenant_admin or super_admin to reassign user-owned resources.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TransferOwnershipInputSchema } from '@etip/shared-types';
import type { OwnershipTransferService } from '../services/ownership-transfer-service.js';
import type { AuditLogger } from '../services/audit-logger.js';

export interface OwnershipTransferRouteDeps {
  ownershipTransfer: OwnershipTransferService;
  auditLogger: AuditLogger;
}

/** Create ownership transfer route plugin. */
export function ownershipTransferRoutes(deps: OwnershipTransferRouteDeps) {
  const { ownershipTransfer, auditLogger } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** POST /settings/users/:userId/transfer-ownership — Manual transfer (tenant_admin). */
    app.post(
      '/settings/users/:userId/transfer-ownership',
      async (req: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
        const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
        const triggeredBy = (req.headers['x-user-id'] as string) || 'system';
        const input = TransferOwnershipInputSchema.parse(req.body);

        const result = await ownershipTransfer.manualTransfer(
          req.params.userId,
          input.targetUserId,
          tenantId,
          triggeredBy,
          input.resourceTypes,
        );

        auditLogger.log({
          tenantId,
          userId: triggeredBy,
          action: 'data_ownership.manual_transfer',
          riskLevel: 'high',
          details: {
            sourceUserId: req.params.userId,
            targetUserId: input.targetUserId,
            transferred: result.transferred,
          },
        });

        return reply.send({ data: result });
      },
    );

    /** POST /admin/users/:userId/transfer-ownership — Manual transfer (super_admin, any org). */
    app.post(
      '/admin/users/:userId/transfer-ownership',
      async (req: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
        const triggeredBy = (req.headers['x-user-id'] as string) || 'system';
        const input = TransferOwnershipInputSchema.parse(req.body);

        // For super_admin, we need to look up the user's tenant
        const sourceUser = await deps.ownershipTransfer['prisma'].user.findUnique({
          where: { id: req.params.userId },
          select: { tenantId: true },
        });
        if (!sourceUser) {
          return reply.status(404).send({
            error: { code: 'USER_NOT_FOUND', message: 'User not found' },
          });
        }

        const result = await ownershipTransfer.manualTransfer(
          req.params.userId,
          input.targetUserId,
          sourceUser.tenantId,
          triggeredBy,
          input.resourceTypes,
        );

        auditLogger.log({
          tenantId: sourceUser.tenantId,
          userId: triggeredBy,
          action: 'data_ownership.manual_transfer',
          riskLevel: 'high',
          details: {
            sourceUserId: req.params.userId,
            targetUserId: input.targetUserId,
            transferred: result.transferred,
            superAdmin: true,
          },
        });

        return reply.send({ data: result });
      },
    );
  };
}
