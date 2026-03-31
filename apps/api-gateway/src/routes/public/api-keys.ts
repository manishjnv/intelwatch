/**
 * @module routes/public/api-keys
 * @description API key rotation endpoint.
 * Creates a new key with same scopes, sets 24h grace period on old key.
 * Auth: any valid API key (null scope — a key can rotate itself).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes } from 'crypto';
import { hashApiKey } from '@etip/shared-auth';
import { AppError } from '@etip/shared-utils';
import { prisma } from '../../prisma.js';
import { apiKeyAuth } from '../../plugins/api-key-auth.js';

const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours

interface ApiKeyContext { apiKeyId: string; scopes: string[]; tenantId: string; userId: string; }

export async function publicApiKeyRoutes(app: FastifyInstance): Promise<void> {
  const auth = apiKeyAuth(null); // any valid key can rotate itself

  // ── POST /api-keys/rotate — Rotate the current API key ──────────
  app.post('/api-keys/rotate', {
    schema: {
      tags: ['API Keys'],
      summary: 'Rotate the current API key — creates a new key, 24h grace period on old',
    },
    preHandler: [auth],
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const keyCtx = (req as FastifyRequest & { apiKeyContext?: ApiKeyContext }).apiKeyContext;
    if (!keyCtx) throw new AppError(401, 'API key context missing', 'UNAUTHORIZED');

    // Fetch old key to inherit properties
    const oldKey = await prisma.apiKey.findUnique({
      where: { id: keyCtx.apiKeyId },
      select: {
        id: true, tenantId: true, userId: true, name: true,
        scopes: true, expiresAt: true, graceExpiresAt: true, replacedByKeyId: true,
      },
    });
    if (!oldKey) throw new AppError(404, 'API key not found', 'NOT_FOUND');

    // Prevent double-rotation (key already in grace period)
    if (oldKey.graceExpiresAt) {
      throw new AppError(409, 'This key has already been rotated — use the replacement key', 'ALREADY_ROTATED');
    }

    // Generate new key
    const rawKey = `etip_${randomBytes(32).toString('hex')}`;
    const prefix = rawKey.slice(0, 12);
    const keyHash = await hashApiKey(rawKey);
    const graceExpiresAt = new Date(Date.now() + GRACE_PERIOD_MS);

    // Interactive transaction: create new key + set grace on old key
    const result = await prisma.$transaction(async (tx) => {
      const newKey = await tx.apiKey.create({
        data: {
          tenantId: oldKey.tenantId,
          userId: oldKey.userId,
          name: `${oldKey.name} (rotated-${Date.now()})`,
          prefix,
          keyHash,
          scopes: oldKey.scopes,
          expiresAt: oldKey.expiresAt, // inherit expiry policy
        },
      });

      await tx.apiKey.update({
        where: { id: oldKey.id },
        data: {
          replacedByKeyId: newKey.id,
          graceExpiresAt,
        },
      });

      return newKey;
    });

    return reply.status(201).send({
      data: {
        id: result.id,
        key: rawKey, // plaintext — shown once, cannot be retrieved again
        prefix,
        name: result.name,
        scopes: result.scopes,
        graceExpiresAt: graceExpiresAt.toISOString(),
        message: 'Old key remains valid for 24 hours. Update your integration, then the old key will auto-expire.',
      },
    });
  });
}
