import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import { authenticate, getUser } from '../plugins/auth.js';
import { SYSTEM_TENANT_SLUG } from '@etip/shared-auth';

const RegisterBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(128),
  displayName: z.string().min(1).max(255),
  tenantName: z.string().min(1).max(255),
  tenantSlug: z.string().min(1).max(63).regex(/^[a-z0-9-]+$/),
  inviteToken: z.string().uuid().optional(),
  plan: z.enum(['free', 'starter', 'pro', 'enterprise']).optional(),
  cfTurnstileToken: z.string().optional(),
});

const ADMIN_SERVICE_URL = process.env['TI_ADMIN_SERVICE_URL'] ?? 'http://etip_admin:3022';

const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

const RefreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/register', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = RegisterBodySchema.parse(req.body);

    // I-08: Block super_admin registration — provisioned via seed script only
    const rawBody = req.body as Record<string, unknown>;
    if (rawBody['role'] === 'super_admin') {
      throw new AppError(
        403,
        'Super admin accounts are provisioned via seed script only.',
        'SUPER_ADMIN_REGISTRATION_BLOCKED'
      );
    }

    // I-22: Block registration with break-glass email
    const breakGlassEmail = process.env['TI_BREAK_GLASS_EMAIL'];
    if (breakGlassEmail && body.email.toLowerCase() === breakGlassEmail.toLowerCase()) {
      throw new AppError(403, 'This email is reserved.', 'BREAK_GLASS_PROVISION_DENIED');
    }

    // I-08: Block registration against the system tenant
    if (body.tenantSlug === SYSTEM_TENANT_SLUG) {
      throw new AppError(
        403,
        'Cannot register under the system tenant.',
        'SYSTEM_TENANT_REGISTRATION_BLOCKED'
      );
    }

    // Cloudflare Turnstile verification (skip if key not configured)
    const turnstileSecret = process.env['TI_TURNSTILE_SECRET'];
    if (turnstileSecret) {
      if (!body.cfTurnstileToken) {
        throw new AppError(400, 'CAPTCHA verification required', 'CAPTCHA_MISSING');
      }
      const cfRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${turnstileSecret}&response=${body.cfTurnstileToken}&remoteip=${req.ip}`,
      });
      const cfData = await cfRes.json() as { success: boolean };
      if (!cfData.success) {
        throw new AppError(403, 'CAPTCHA verification failed', 'CAPTCHA_FAILED');
      }
    }

    // Validate invite token if provided (calls admin-service internally)
    if (body.inviteToken) {
      const validateUrl = `${ADMIN_SERVICE_URL}/api/v1/admin/tenants/validate-invite?token=${body.inviteToken}&email=${encodeURIComponent(body.email)}`;
      try {
        const inviteRes = await fetch(validateUrl);
        if (!inviteRes.ok) {
          throw new AppError(403, 'Invite link is invalid, expired, or already used', 'INVITE_INVALID');
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        // Admin-service unreachable — allow registration without invite validation in dev
        if (process.env['TI_NODE_ENV'] === 'production') {
          throw new AppError(503, 'Unable to verify invite — try again later', 'INVITE_CHECK_UNAVAILABLE');
        }
      }
    }

    const { UserService } = await import('@etip/user-service');
    const userService = new UserService();
    const result = await userService.register({
      email: body.email, password: body.password, displayName: body.displayName,
      tenantName: body.tenantName, tenantSlug: body.tenantSlug,
      plan: body.plan, inviteToken: body.inviteToken,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    });

    // Claim the invite token after successful registration
    if (body.inviteToken) {
      fetch(`${ADMIN_SERVICE_URL}/api/v1/admin/tenants/claim-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: body.inviteToken }),
      }).catch(() => { /* fire-and-forget — invite claim is best-effort */ });
    }

    return reply.status(201).send({ data: result });
  });

  app.post('/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = LoginBodySchema.parse(req.body);
    const { UserService } = await import('@etip/user-service');
    const userService = new UserService();
    const result = await userService.login({
      email: body.email, password: body.password,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    });
    return reply.status(200).send({ data: result });
  });

  app.post('/refresh', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = RefreshBodySchema.parse(req.body);
    const { UserService } = await import('@etip/user-service');
    const userService = new UserService();
    const result = await userService.refreshTokens({
      refreshToken: body.refreshToken,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    });
    return reply.status(200).send({ data: result });
  });

  app.post('/logout', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const { UserService } = await import('@etip/user-service');
    const userService = new UserService();
    await userService.logout(user.sessionId);
    return reply.status(204).send();
  });

  app.get('/me', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const { UserService } = await import('@etip/user-service');
    const userService = new UserService();
    const profile = await userService.getProfile(user.sub, user.tenantId);
    return reply.status(200).send({ data: profile });
  });
}
