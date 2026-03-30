/**
 * @module break-glass routes
 * @description Break-glass emergency account endpoints (I-22).
 *   POST /auth/break-glass                  — public: emergency OTP login
 *   GET  /admin/break-glass/status          — super_admin: account status
 *   GET  /admin/break-glass/audit           — super_admin: audit entries
 *   POST /admin/break-glass/rotate-password — super_admin: rotate password
 *   DELETE /admin/break-glass/sessions      — super_admin: force-terminate
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { QUEUES } from '@etip/shared-utils';
import { BreakGlassLoginBodySchema, BreakGlassRotatePasswordBodySchema } from '@etip/shared-types';
import { authenticate, getUser } from '../plugins/auth.js';
import { rbac } from '../plugins/rbac.js';
import Redis from 'ioredis';

/** Push alert payload to BullMQ-compatible Redis list (best-effort) */
async function pushBreakGlassAlert(payload: Record<string, unknown>): Promise<void> {
  const redisUrl = process.env['TI_REDIS_URL'] ?? 'redis://localhost:6379';
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await redis.connect();
    const jobData = JSON.stringify({
      name: 'break-glass-alert',
      data: payload,
      opts: {},
      timestamp: Date.now(),
    });
    await redis.lpush(`bull:${QUEUES.BREAK_GLASS_ALERT}:wait`, jobData);
  } finally {
    await redis.quit().catch(() => {});
  }
}

export async function breakGlassRoutes(app: FastifyInstance): Promise<void> {
  // ── Public: Break-glass login ─────────────────────────────────────
  app.post('/auth/break-glass', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = BreakGlassLoginBodySchema.parse(req.body);
    const { BreakGlassService } = await import('@etip/user-service');
    const bgService = new BreakGlassService();

    const result = await bgService.login({
      email: body.email, password: body.password, otp: body.otp,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    });

    // Queue alert (fire-and-forget, best-effort)
    const alertPayload = bgService.getAndClearAlertPayload();
    if (alertPayload) {
      pushBreakGlassAlert(alertPayload as unknown as Record<string, unknown>).catch(() => {});
    }

    return reply.status(200).send({ data: result });
  });

  // ── Admin: Break-glass status ─────────────────────────────────────
  app.get('/admin/break-glass/status', {
    preHandler: [authenticate, rbac('admin:*')],
  }, async (_req: FastifyRequest, reply: FastifyReply) => {
    const { BreakGlassService } = await import('@etip/user-service');
    const bgService = new BreakGlassService();
    const status = await bgService.getStatus();
    return reply.status(200).send({ data: status });
  });

  // ── Admin: Break-glass audit log ──────────────────────────────────
  app.get('/admin/break-glass/audit', {
    preHandler: [authenticate, rbac('admin:*')],
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as Record<string, string>;
    const limit = Math.min(Number(query['limit']) || 50, 500);
    const offset = Number(query['offset']) || 0;

    const { BreakGlassService } = await import('@etip/user-service');
    const bgService = new BreakGlassService();
    const entries = await bgService.getAuditLog(limit, offset);
    return reply.status(200).send({ data: entries, total: entries.length, limit, offset });
  });

  // ── Admin: Rotate break-glass password ────────────────────────────
  app.post('/admin/break-glass/rotate-password', {
    preHandler: [authenticate, rbac('admin:*')],
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const body = BreakGlassRotatePasswordBodySchema.parse(req.body);
    const user = getUser(req);

    const { BreakGlassService } = await import('@etip/user-service');
    const bgService = new BreakGlassService();
    await bgService.rotatePassword(body.newPassword, user.sub, req.ip);

    return reply.status(200).send({ data: { message: 'Break-glass password rotated. Active sessions terminated.' } });
  });

  // ── Admin: Force-terminate break-glass sessions ───────────────────
  app.delete('/admin/break-glass/sessions', {
    preHandler: [authenticate, rbac('admin:*')],
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);

    const { BreakGlassService } = await import('@etip/user-service');
    const bgService = new BreakGlassService();
    const count = await bgService.forceTerminateSessions(user.sub, req.ip);

    return reply.status(200).send({ data: { message: `${count} break-glass session(s) terminated.`, count } });
  });
}
