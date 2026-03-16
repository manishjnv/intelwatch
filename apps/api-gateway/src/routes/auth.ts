import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import { authenticate, getUser } from '../plugins/auth.js';

const RegisterBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(128),
  displayName: z.string().min(1).max(255),
  tenantName: z.string().min(1).max(255),
  tenantSlug: z.string().min(1).max(63).regex(/^[a-z0-9-]+$/),
});

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
    const { UserService } = await import('@etip/user-service');
    const userService = new UserService();
    const result = await userService.register({
      email: body.email, password: body.password, displayName: body.displayName,
      tenantName: body.tenantName, tenantSlug: body.tenantSlug,
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    });
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
