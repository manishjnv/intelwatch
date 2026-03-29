import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { AppError } from '@etip/shared-utils';
import { hashApiKey } from '@etip/shared-auth';
import { prisma } from '../prisma.js';
import type { AuditLogger } from '../services/audit-logger.js';

const API_KEY_PREFIX = 'etip_';
const PREFIX_DISPLAY_LENGTH = 12;

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.string()).min(1).default(['ioc:read']),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export interface ApiKeyRouteDeps {
  auditLogger: AuditLogger;
}

/** API key management routes — creation gated to enterprise plan. */
export function apiKeyRoutes(deps: ApiKeyRouteDeps) {
  const { auditLogger } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** POST /api-keys — Create API key (enterprise only). */
    app.post('/api-keys', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const userId = (req.headers['x-user-id'] as string) || '';

      // I-09: Enterprise tier gate
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
      if (!tenant) throw new AppError(404, 'Tenant not found', 'NOT_FOUND');
      if (tenant.plan !== 'enterprise') {
        throw new AppError(403, 'API key management requires the Enterprise plan. Please upgrade.', 'FEATURE_NOT_AVAILABLE', {
          upgradeUrl: '/command-center?tab=billing',
          currentPlan: tenant.plan,
        });
      }

      const body = CreateApiKeySchema.parse(req.body);

      // Generate key: etip_ + 32 random hex bytes
      const rawKey = API_KEY_PREFIX + randomBytes(32).toString('hex');
      const prefix = rawKey.slice(0, PREFIX_DISPLAY_LENGTH);
      const keyHash = await hashApiKey(rawKey);

      const expiresAt = body.expiresInDays
        ? new Date(Date.now() + body.expiresInDays * 86_400_000)
        : null;

      const apiKey = await prisma.apiKey.create({
        data: {
          tenantId,
          userId,
          name: body.name,
          prefix,
          keyHash,
          scopes: body.scopes,
          expiresAt,
        },
        select: { id: true, name: true, prefix: true, scopes: true, expiresAt: true, createdAt: true },
      });

      auditLogger.log({
        tenantId, userId,
        action: 'api_key.created', riskLevel: 'medium',
        details: { keyId: apiKey.id, name: body.name, scopes: body.scopes }, ip: req.ip,
      });

      // Return full key once — it cannot be retrieved again
      return reply.status(201).send({
        data: { ...apiKey, key: rawKey },
      });
    });

    /** GET /api-keys — List API keys for the tenant. Returns empty for non-enterprise. */
    app.get('/api-keys', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || '';

      const keys = await prisma.apiKey.findMany({
        where: { tenantId, active: true },
        select: { id: true, name: true, prefix: true, scopes: true, lastUsed: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({ data: keys, total: keys.length });
    });

    /** DELETE /api-keys/:id — Revoke an API key (soft delete). */
    app.delete('/api-keys/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || '';
      const userId = (req.headers['x-user-id'] as string) || '';

      const existing = await prisma.apiKey.findFirst({
        where: { id: req.params.id, tenantId, active: true },
      });
      if (!existing) throw new AppError(404, 'API key not found', 'NOT_FOUND');

      await prisma.apiKey.update({
        where: { id: req.params.id },
        data: { active: false },
      });

      auditLogger.log({
        tenantId, userId,
        action: 'api_key.revoked', riskLevel: 'medium',
        details: { keyId: req.params.id, name: existing.name }, ip: req.ip,
      });

      return reply.status(204).send();
    });
  };
}
