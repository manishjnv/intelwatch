/**
 * @module routes/public/webhooks
 * @description Public API webhook subscription CRUD + test endpoint.
 * Auth: API key (webhook:manage scope). Plan-based webhook limits enforced.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes } from 'crypto';
import { AppError } from '@etip/shared-utils';
import {
  WebhookCreateBodySchema,
  WebhookUpdateBodySchema,
  type PublicWebhookDto,
} from '@etip/shared-types';
import { prisma } from '../../prisma.js';
import { apiKeyAuth } from '../../plugins/api-key-auth.js';
import { getUser } from '../../plugins/auth.js';
import { getPlanLimits } from '../../plugins/quota-enforcement.js';
import { getTenantPlanName } from '../../quota/plan-cache.js';

interface ApiKeyContext { apiKeyId: string; scopes: string[]; tenantId: string; userId: string; }

function toWebhookDto(row: {
  id: string; url: string; events: string[]; active: boolean;
  failCount: number; lastSuccess: Date | null; lastFailure: Date | null; createdAt: Date;
}): PublicWebhookDto {
  return {
    id: row.id,
    url: row.url,
    events: row.events,
    active: row.active,
    failCount: row.failCount,
    lastSuccess: row.lastSuccess?.toISOString() ?? null,
    lastFailure: row.lastFailure?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function publicWebhookRoutes(app: FastifyInstance): Promise<void> {
  const auth = apiKeyAuth('webhook:manage');

  // ── POST /webhooks — Create subscription ─────────────────────────
  app.post('/webhooks', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const keyCtx = (req as FastifyRequest & { apiKeyContext?: ApiKeyContext }).apiKeyContext;
    const body = WebhookCreateBodySchema.parse(req.body);

    // Check plan webhook limit — uses api_access.limitTotal from DB plan definitions
    const [planName, limits] = await Promise.all([
      getTenantPlanName(user.tenantId),
      getPlanLimits(user.tenantId),
    ]);
    const apiLimits = limits.get('api_access');
    // limitTotal on api_access controls max webhook subscriptions (-1 = unlimited)
    const maxWebhooks = apiLimits?.limitTotal ?? 0;
    const currentCount = await prisma.webhookSubscription.count({
      where: { tenantId: user.tenantId, active: true },
    });

    if (maxWebhooks >= 0 && currentCount >= maxWebhooks) {
      throw new AppError(403, `Webhook limit reached (${maxWebhooks} on ${planName} plan)`, 'QUOTA_EXCEEDED', {
        limit: maxWebhooks,
        used: currentCount,
        upgradeUrl: '/command-center?tab=billing',
      });
    }

    // Generate HMAC signing secret
    const secret = randomBytes(32).toString('hex');

    const webhook = await prisma.webhookSubscription.create({
      data: {
        tenantId: user.tenantId,
        apiKeyId: keyCtx?.apiKeyId ?? '',
        url: body.url,
        secret,
        events: body.events,
      },
    });

    // Return secret only on creation — cannot be retrieved again
    return reply.status(201).send({
      data: { ...toWebhookDto(webhook), secret },
    });
  });

  // ── GET /webhooks — List subscriptions ───────────────────────────
  app.get('/webhooks', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);

    const webhooks = await prisma.webhookSubscription.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ data: webhooks.map(toWebhookDto), total: webhooks.length });
  });

  // ── PUT /webhooks/:id — Update subscription ─────────────────────
  app.put('/webhooks/:id', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const { id } = req.params as { id: string };
    const body = WebhookUpdateBodySchema.parse(req.body);

    const existing = await prisma.webhookSubscription.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) throw new AppError(404, 'Webhook subscription not found', 'NOT_FOUND');

    const updated = await prisma.webhookSubscription.update({
      where: { id },
      data: {
        ...(body.url !== undefined && { url: body.url }),
        ...(body.events !== undefined && { events: body.events }),
        ...(body.active !== undefined && {
          active: body.active,
          // Re-enable: reset fail counter and disabledAt
          ...(body.active && { failCount: 0, disabledAt: null }),
        }),
      },
    });

    return reply.send({ data: toWebhookDto(updated) });
  });

  // ── DELETE /webhooks/:id — Delete subscription ──────────────────
  app.delete('/webhooks/:id', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const { id } = req.params as { id: string };

    const existing = await prisma.webhookSubscription.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing) throw new AppError(404, 'Webhook subscription not found', 'NOT_FOUND');

    await prisma.webhookSubscription.delete({ where: { id } });

    return reply.status(204).send();
  });

  // ── POST /webhooks/:id/test — Send test event ──────────────────
  app.post('/webhooks/:id/test', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const { id } = req.params as { id: string };

    const webhook = await prisma.webhookSubscription.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!webhook) throw new AppError(404, 'Webhook subscription not found', 'NOT_FOUND');

    // Send test payload inline (no queue — immediate feedback)
    const { createHmac } = await import('crypto');
    const testPayload = JSON.stringify({
      event: 'test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook from IntelWatch ETIP',
        subscriptionId: webhook.id,
      },
    });

    const signature = createHmac('sha256', webhook.secret)
      .update(testPayload)
      .digest('hex');

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Event': 'test',
          'User-Agent': 'IntelWatch-ETIP/1.0',
        },
        body: testPayload,
        signal: AbortSignal.timeout(10_000),
      });

      return reply.send({
        data: {
          success: response.ok,
          statusCode: response.status,
          message: response.ok ? 'Test webhook delivered successfully' : `Endpoint returned ${response.status}`,
        },
      });
    } catch (err) {
      return reply.send({
        data: {
          success: false,
          statusCode: null,
          message: `Failed to reach endpoint: ${(err as Error).message}`,
        },
      });
    }
  });
}
