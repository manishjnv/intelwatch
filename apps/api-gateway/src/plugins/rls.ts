/**
 * @module rls-plugin
 * @description Fastify plugin that sets PostgreSQL RLS session variables
 * from the authenticated request context.
 *
 * For every authenticated request, this attaches an `rlsContext` to the
 * request and provides `req.withRls(fn)` — a convenience wrapper around
 * the shared-auth `withRls()` that automatically uses the request's tenant.
 *
 * Integration:
 * - Route handlers that need RLS-protected transactions call `req.withRls()`
 * - Existing direct Prisma calls continue to work (app-layer WHERE is primary)
 * - RLS is defense-in-depth — even without withRls, the migration policies
 *   will block cross-tenant access if session vars are set
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { withRls, type RlsContext } from '@etip/shared-auth';
import type { JwtPayload } from '@etip/shared-types';
import { prisma } from '../prisma.js';

declare module 'fastify' {
  interface FastifyRequest {
    rlsContext: RlsContext | null;
    withRls: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  }
}

export function registerRls(app: FastifyInstance): void {
  app.decorateRequest('rlsContext', null);
  app.decorateRequest('withRls', function dummyWithRls() {
    throw new Error('RLS context not initialized — authenticate first');
  });

  app.addHook('preHandler', async (req: FastifyRequest) => {
    const user = (req as FastifyRequest & { user?: JwtPayload }).user;
    if (!user?.tenantId) return;

    const ctx: RlsContext = {
      tenantId: user.tenantId,
      isSuperAdmin: user.role === 'super_admin',
    };

    req.rlsContext = ctx;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req.withRls = <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      withRls(prisma as any, ctx, fn);
  });
}
