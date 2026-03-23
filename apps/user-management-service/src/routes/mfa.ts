import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MfaService } from '../services/mfa-service.js';
import type { AuditLogger } from '../services/audit-logger.js';
import type { TeamStore } from '../services/team-store.js';
import { MfaVerifySchema, MfaBackupCodeVerifySchema, MfaPolicySchema } from '../schemas/user-management.js';

export interface MfaRouteDeps {
  mfaService: MfaService;
  auditLogger: AuditLogger;
  teamStore: TeamStore;
}

/** Create MFA route plugin. */
export function mfaRoutes(deps: MfaRouteDeps) {
  const { mfaService, auditLogger, teamStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** POST /mfa/setup — Begin MFA setup (generate secret + QR). */
    app.post('/mfa/setup', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || '';
      const userEmail = (req.headers['x-user-email'] as string) || 'user@example.com';
      const result = mfaService.setup(userId, tenantId, userEmail);
      auditLogger.log({
        tenantId, userId, action: 'mfa.setup_started', riskLevel: 'medium',
        details: {}, ip: req.ip,
      });
      return reply.status(201).send({ data: result });
    });

    /** POST /mfa/verify — Verify TOTP code and enable MFA. */
    app.post('/mfa/verify', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || '';
      const { code } = MfaVerifySchema.parse(req.body);
      const result = mfaService.verifyAndEnable(userId, tenantId, code);
      teamStore.setMfaStatus(userId, tenantId, true);
      auditLogger.log({
        tenantId, userId, action: 'mfa.enabled', riskLevel: 'medium',
        details: { backupCodesGenerated: result.backupCodes.length }, ip: req.ip,
      });
      return reply.send({ data: result });
    });

    /** POST /mfa/validate — Validate TOTP code on login. */
    app.post('/mfa/validate', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || '';
      const { code } = MfaVerifySchema.parse(req.body);
      const valid = mfaService.validate(userId, tenantId, code);
      if (!valid) {
        auditLogger.log({
          tenantId, userId, action: 'mfa.validate_failed', riskLevel: 'high',
          details: {}, ip: req.ip,
        });
        return reply.status(401).send({ error: { code: 'MFA_INVALID_CODE', message: 'Invalid TOTP code' } });
      }
      auditLogger.log({
        tenantId, userId, action: 'mfa.validated', riskLevel: 'low',
        details: {}, ip: req.ip,
      });
      return reply.send({ data: { valid: true } });
    });

    /** DELETE /mfa — Disable MFA for current user. */
    app.delete('/mfa', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || '';
      mfaService.disable(userId, tenantId);
      teamStore.setMfaStatus(userId, tenantId, false);
      auditLogger.log({
        tenantId, userId, action: 'mfa.disabled', riskLevel: 'high',
        details: {}, ip: req.ip,
      });
      return reply.status(204).send();
    });

    /** GET /mfa/backup-codes — Regenerate backup codes. */
    app.get('/mfa/backup-codes', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || '';
      const codes = mfaService.regenerateBackupCodes(userId, tenantId);
      auditLogger.log({
        tenantId, userId, action: 'mfa.backup_codes_regenerated', riskLevel: 'medium',
        details: { count: codes.length }, ip: req.ip,
      });
      return reply.send({ data: { codes, remaining: codes.length } });
    });

    /** POST /mfa/backup-codes/verify — Use a backup code. */
    app.post('/mfa/backup-codes/verify', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || '';
      const { code } = MfaBackupCodeVerifySchema.parse(req.body);
      const valid = mfaService.verifyBackupCode(userId, tenantId, code);
      if (!valid) {
        return reply.status(401).send({ error: { code: 'BACKUP_CODE_INVALID', message: 'Invalid backup code' } });
      }
      auditLogger.log({
        tenantId, userId, action: 'mfa.backup_code_used', riskLevel: 'high',
        details: { remaining: mfaService.getRemainingBackupCodes(userId, tenantId) }, ip: req.ip,
      });
      return reply.send({ data: { valid: true, remaining: mfaService.getRemainingBackupCodes(userId, tenantId) } });
    });

    /** PUT /mfa/policy — Set MFA enforcement policy for tenant. */
    app.put('/mfa/policy', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const input = MfaPolicySchema.parse(req.body);
      const policy = mfaService.setPolicy(tenantId, input);
      auditLogger.log({
        tenantId, userId: (req.headers['x-user-id'] as string) || null,
        action: 'mfa.policy_updated', riskLevel: 'high',
        details: { enforcement: policy.enforcement, gracePeriodDays: policy.gracePeriodDays },
      });
      return reply.send({ data: policy });
    });

    /** GET /mfa/policy — Get MFA policy for tenant. */
    app.get('/mfa/policy', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      return reply.send({ data: mfaService.getPolicy(tenantId) });
    });

    /** GET /mfa/status — Get MFA status for current user. */
    app.get('/mfa/status', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const userId = (req.headers['x-user-id'] as string) || '';
      return reply.send({
        data: {
          enabled: mfaService.isEnabled(userId, tenantId),
          required: mfaService.isRequired(tenantId),
          remainingBackupCodes: mfaService.getRemainingBackupCodes(userId, tenantId),
        },
      });
    });
  };
}
