/**
 * @module MFA Routes
 * @description MFA setup, challenge, backup codes, and enforcement policy endpoints.
 * SOC 2 CC6.1 / ISO 27001 A.9.4.2 compliant.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import { authenticate, getUser } from '../plugins/auth.js';

const TotpCodeSchema = z.object({
  code: z.string().min(6).max(9), // 6-digit TOTP or XXXX-XXXX backup code
});

const MfaChallengeSchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().min(6).max(9),
});

const EnforcementSchema = z.object({
  enforced: z.boolean(),
});

export async function mfaRoutes(app: FastifyInstance): Promise<void> {

  // ── Setup Flow ───────────────────────────────────────────────

  /** POST /mfa/setup — Generate TOTP secret + QR URI */
  app.post('/mfa/setup', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const { MfaService } = await import('@etip/user-service');
    const mfaService = new MfaService();
    const result = await mfaService.setupMfa(
      user.sub, user.tenantId,
      req.ip, req.headers['user-agent'] ?? ''
    );
    return reply.status(200).send({ data: result });
  });

  /** POST /mfa/verify-setup — Verify TOTP code to complete MFA setup */
  app.post('/mfa/verify-setup', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const body = TotpCodeSchema.parse(req.body);
    const { MfaService } = await import('@etip/user-service');
    const mfaService = new MfaService();
    const result = await mfaService.verifySetup(
      user.sub, user.tenantId, body.code,
      req.ip, req.headers['user-agent'] ?? ''
    );
    return reply.status(200).send({ data: result });
  });

  /** POST /mfa/disable — Disable MFA (requires TOTP code or admin override) */
  app.post('/mfa/disable', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = getUser(req);
    const body = z.object({
      code: z.string().min(6).max(9).optional().default(''),
      userId: z.string().uuid().optional(), // admin override target
    }).parse(req.body);

    const targetUserId = body.userId ?? actor.sub;
    // Only super_admin/tenant_admin can disable other users' MFA
    if (body.userId && body.userId !== actor.sub) {
      if (actor.role !== 'super_admin' && actor.role !== 'tenant_admin') {
        throw new AppError(403, 'Only admins can disable MFA for other users', 'FORBIDDEN');
      }
    }

    const { MfaService } = await import('@etip/user-service');
    const mfaService = new MfaService();
    await mfaService.disableMfa(
      targetUserId, actor.tenantId, body.code,
      actor.sub, actor.role,
      req.ip, req.headers['user-agent'] ?? ''
    );
    return reply.status(200).send({ data: { message: 'MFA disabled successfully' } });
  });

  // ── Login Challenge ──────────────────────────────────────────

  /** POST /mfa/challenge — Verify TOTP/backup code to complete login */
  app.post('/mfa/challenge', async (req: FastifyRequest, reply: FastifyReply) => {
    // No authenticate middleware — uses mfaToken instead
    const body = MfaChallengeSchema.parse(req.body);
    const { MfaService, UserService } = await import('@etip/user-service');
    const mfaService = new MfaService();
    const result = await mfaService.verifyChallenge(
      body.mfaToken, body.code,
      req.ip, req.headers['user-agent'] ?? ''
    );

    // MFA verified — create full session
    const userService = new UserService();
    const tokens = await userService.completeLoginAfterMfa(
      result.userId, result.tenantId,
      req.ip, req.headers['user-agent'] ?? ''
    );

    const response: Record<string, unknown> = { data: tokens };
    if (result.backupCodesRemaining !== undefined) {
      (response['data'] as Record<string, unknown>)['backupCodesRemaining'] = result.backupCodesRemaining;
    }
    if (result.warning) {
      (response['data'] as Record<string, unknown>)['warning'] = result.warning;
    }

    return reply.status(200).send(response);
  });

  // ── Backup Code Regeneration ─────────────────────────────────

  /** POST /mfa/backup-codes/regenerate — Generate new backup codes */
  app.post('/mfa/backup-codes/regenerate', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const body = TotpCodeSchema.parse(req.body);
    const { MfaService } = await import('@etip/user-service');
    const mfaService = new MfaService();
    const result = await mfaService.regenerateBackupCodes(
      user.sub, user.tenantId, body.code,
      req.ip, req.headers['user-agent'] ?? ''
    );
    return reply.status(200).send({ data: result });
  });

  // ── Enforcement Policies ─────────────────────────────────────

  /** PUT /admin/mfa/enforcement — Set platform-wide enforcement (super_admin) */
  app.put('/admin/mfa/enforcement', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    if (user.role !== 'super_admin') {
      throw new AppError(403, 'Only super_admin can set platform MFA enforcement', 'FORBIDDEN');
    }
    const body = EnforcementSchema.parse(req.body);
    const { MfaService } = await import('@etip/user-service');
    const mfaService = new MfaService();
    const result = await mfaService.setPlatformEnforcement(
      body.enforced, user.sub, user.tenantId,
      req.ip, req.headers['user-agent'] ?? ''
    );
    return reply.status(200).send({ data: result });
  });

  /** GET /admin/mfa/enforcement — Get platform-wide enforcement status */
  app.get('/admin/mfa/enforcement', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    if (user.role !== 'super_admin') {
      throw new AppError(403, 'Only super_admin can view platform MFA enforcement', 'FORBIDDEN');
    }
    const { MfaService } = await import('@etip/user-service');
    const mfaService = new MfaService();
    const result = await mfaService.getPlatformEnforcement();
    return reply.status(200).send({ data: result });
  });

  /** PUT /settings/mfa/enforcement — Set org-level enforcement (tenant_admin) */
  app.put('/settings/mfa/enforcement', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    if (user.role !== 'tenant_admin' && user.role !== 'super_admin') {
      throw new AppError(403, 'Only tenant_admin can set org MFA enforcement', 'FORBIDDEN');
    }
    const body = EnforcementSchema.parse(req.body);
    const { MfaService } = await import('@etip/user-service');
    const mfaService = new MfaService();
    const result = await mfaService.setOrgEnforcement(
      user.tenantId, body.enforced, user.sub,
      req.ip, req.headers['user-agent'] ?? ''
    );
    return reply.status(200).send({ data: result });
  });

  /** GET /settings/mfa/enforcement — Get org-level enforcement status */
  app.get('/settings/mfa/enforcement', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    if (user.role !== 'tenant_admin' && user.role !== 'super_admin') {
      throw new AppError(403, 'Only tenant_admin can view org MFA enforcement', 'FORBIDDEN');
    }
    const { MfaService } = await import('@etip/user-service');
    const mfaService = new MfaService();
    const result = await mfaService.getOrgEnforcement(user.tenantId);
    return reply.status(200).send({ data: result });
  });
}
