/**
 * @module SsoService
 * @description SSO configuration management, group-to-role mapping validation,
 * and JIT (Just-In-Time) provisioning on SSO callback.
 * Reuses AES-256-GCM encryption from MfaService for clientSecret storage.
 */
import { z } from 'zod';
import crypto from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import {
  signAccessToken, signRefreshToken, getJwtConfig, getRefreshExpiryForRole,
} from '@etip/shared-auth';
import { sha256 } from '@etip/shared-utils';
import { encryptSecret } from './mfa-service.js';
import * as ssoRepo from './sso-repository.js';
import * as repo from './repository.js';

// ── Zod Schemas ─────────────────────────────────────────────────────

const VALID_SSO_ROLES = ['tenant_admin', 'analyst'] as const;

const GroupRoleMappingSchema = z.object({
  idpGroup: z.string().min(1).max(255),
  role: z.enum(VALID_SSO_ROLES),
  designation: z.string().max(50).optional(),
});

export type GroupRoleMapping = z.infer<typeof GroupRoleMappingSchema>;

const SsoConfigInputSchema = z.object({
  provider: z.enum(['saml', 'oidc']),
  entityId: z.string().max(500).nullish(),
  metadataUrl: z.string().url().max(500).nullish(),
  clientId: z.string().max(255).nullish(),
  clientSecret: z.string().max(500).nullish(),
  issuerUrl: z.string().url().max(500).nullish(),
  certificate: z.string().nullish(),
  groupRoleMappings: z.array(GroupRoleMappingSchema).default([]),
  approvedDomains: z.array(z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i, 'Invalid domain format')).min(1, 'At least one approved domain required'),
  enabled: z.boolean().default(false),
});

export type SsoConfigInput = z.infer<typeof SsoConfigInputSchema>;

/** Claims extracted from IdP response (SAML assertion or OIDC token) */
export const SsoCallbackClaimsSchema = z.object({
  email: z.string().email(),
  groups: z.array(z.string()).default([]),
  displayName: z.string().min(1).max(255),
  entityId: z.string().optional(),
  issuerUrl: z.string().optional(),
});

export type SsoCallbackClaims = z.infer<typeof SsoCallbackClaimsSchema>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const auditChanges = (obj: Record<string, unknown>) => obj as any;

// ── SSO Service ─────────────────────────────────────────────────────

export class SsoService {

  /** Get SSO config for a tenant — clientSecret redacted */
  async getConfig(tenantId: string) {
    const config = await ssoRepo.findByTenantId(tenantId);
    if (!config) return null;
    return this._redactSecret(config);
  }

  /** Create or update SSO config */
  async upsertConfig(
    tenantId: string, input: unknown,
    actorId: string, ipAddress: string, userAgent: string
  ) {
    const data = SsoConfigInputSchema.parse(input);

    // Encrypt clientSecret if provided
    let encryptedSecret: string | null | undefined = undefined;
    if (data.clientSecret) {
      encryptedSecret = encryptSecret(data.clientSecret);
    }

    const config = await ssoRepo.upsert(tenantId, {
      provider: data.provider,
      entityId: data.entityId ?? null,
      metadataUrl: data.metadataUrl ?? null,
      clientId: data.clientId ?? null,
      clientSecret: encryptedSecret ?? undefined,
      issuerUrl: data.issuerUrl ?? null,
      certificate: data.certificate ?? null,
      groupRoleMappings: data.groupRoleMappings,
      approvedDomains: data.approvedDomains,
      enabled: data.enabled,
    });

    await repo.createAuditLog({
      tenantId, userId: actorId, action: 'sso.config.updated',
      entityType: 'sso_config', entityId: config.id,
      changes: auditChanges({ provider: data.provider, enabled: data.enabled, domainsCount: data.approvedDomains.length }),
      ipAddress, userAgent,
    });

    return this._redactSecret(config);
  }

  /** Delete SSO config for a tenant */
  async deleteConfig(tenantId: string, actorId: string, ipAddress: string, userAgent: string) {
    const existing = await ssoRepo.findByTenantId(tenantId);
    if (!existing) throw new AppError(404, 'SSO config not found', 'NOT_FOUND');

    await ssoRepo.deleteByTenantId(tenantId);

    await repo.createAuditLog({
      tenantId, userId: actorId, action: 'sso.config.deleted',
      entityType: 'sso_config', entityId: existing.id,
      ipAddress, userAgent,
    });
  }

  /** Test SSO config — validate metadata URL reachable and certificate parseable */
  async testConfig(tenantId: string) {
    const config = await ssoRepo.findByTenantId(tenantId);
    if (!config) throw new AppError(404, 'SSO config not found', 'NOT_FOUND');

    const results: { metadataUrl?: string; certificate?: string } = {};

    if (config.metadataUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const resp = await fetch(config.metadataUrl, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeout);
        results.metadataUrl = resp.ok ? 'reachable' : `unreachable (${resp.status})`;
      } catch {
        results.metadataUrl = 'unreachable (network error)';
      }
    }

    if (config.certificate) {
      try {
        const cert = new crypto.X509Certificate(config.certificate);
        const validTo = cert.validTo;
        results.certificate = `valid (expires ${validTo})`;
      } catch {
        results.certificate = 'invalid (cannot parse X.509)';
      }
    }

    return results;
  }

  /**
   * Handle SSO callback — JIT provisioning.
   * Called after IdP assertion/token is parsed (parsing is a stub for now).
   */
  async handleCallback(
    rawClaims: unknown, ipAddress: string, userAgent: string
  ): Promise<{
    accessToken: string; refreshToken: string; expiresIn: number;
    user: { id: string; email: string; displayName: string; role: string; tenantId: string };
    jitProvisioned?: boolean; mfaSetupRequired?: boolean; setupToken?: string;
  }> {
    const claims = SsoCallbackClaimsSchema.parse(rawClaims);

    // Find SSO config by entityId or issuerUrl
    const config = await this._findConfigByClaims(claims);
    if (!config) throw new AppError(404, 'SSO configuration not found for this identity provider', 'SSO_CONFIG_NOT_FOUND');
    if (!config.enabled) throw new AppError(403, 'SSO is disabled for this organization', 'SSO_DISABLED');

    // Validate email domain
    const emailDomain = claims.email.split('@')[1]!.toLowerCase();
    const domainApproved = config.approvedDomains.some(d => d.toLowerCase() === emailDomain);
    if (!domainApproved) {
      await repo.createAuditLog({
        tenantId: config.tenantId, action: 'sso.login.failed',
        entityType: 'sso_config',
        changes: auditChanges({ reason: 'domain_not_approved', email: claims.email, domain: emailDomain }),
        ipAddress, userAgent,
      });
      throw new AppError(403, `Email domain "${emailDomain}" is not approved for SSO`, 'SSO_DOMAIN_NOT_APPROVED');
    }

    // Map IdP groups to role
    const mappings = (config.groupRoleMappings as GroupRoleMapping[]) || [];
    const { role, designation } = this._resolveRoleFromGroups(claims.groups, mappings);

    // Find or create user (JIT provisioning)
    const existingUser = await repo.findUserByEmailAndTenant(claims.email, config.tenantId);
    let jitProvisioned = false;
    let userId: string;
    let userEmail: string;
    let userDisplayName: string;
    let userRole: string;

    if (existingUser) {
      userId = existingUser.id;
      userEmail = existingUser.email;
      userDisplayName = existingUser.displayName;
      userRole = existingUser.role;
      // Sync role/designation if group mapping changed
      if (existingUser.role !== role || existingUser.designation !== (designation ?? null)) {
        await repo.updateUserSsoFields(existingUser.id, role, designation ?? null);
        userRole = role;
      }
      await repo.updateUserLoginStats(existingUser.id);
    } else {
      // New user — JIT provision
      const tenant = await repo.findTenantById(config.tenantId);
      if (!tenant) throw new AppError(500, 'Tenant not found', 'INTERNAL_ERROR');

      const userCount = await repo.countUsersInTenant(config.tenantId);
      if (userCount >= tenant.maxUsers) {
        await repo.createAuditLog({
          tenantId: config.tenantId, action: 'sso.login.failed',
          entityType: 'sso_config',
          changes: auditChanges({ reason: 'max_users_reached', email: claims.email, maxUsers: tenant.maxUsers }),
          ipAddress, userAgent,
        });
        throw new AppError(403, 'Organization has reached maximum user limit. Contact your admin to upgrade.', 'TENANT_USER_LIMIT');
      }

      const newUser = await repo.createUser({
        tenantId: config.tenantId,
        email: claims.email,
        displayName: claims.displayName,
        role: role as 'tenant_admin' | 'analyst',
        authProvider: config.provider === 'saml' ? 'saml' : 'oidc',
        emailVerified: true,
        active: true,
        designation: designation ?? undefined,
      });
      userId = newUser.id;
      userEmail = newUser.email;
      userDisplayName = newUser.displayName;
      userRole = newUser.role;
      jitProvisioned = true;
    }

    // Create session
    const tokens = await this._createSession(userId, config.tenantId, ipAddress, userAgent);

    const auditAction = jitProvisioned ? 'sso.login.jit_provision' : 'sso.login.success';
    await repo.createAuditLog({
      tenantId: config.tenantId, userId, action: auditAction,
      entityType: 'session',
      changes: auditChanges({ provider: config.provider, role, jitProvisioned }),
      ipAddress, userAgent,
    });

    const result: Awaited<ReturnType<SsoService['handleCallback']>> = {
      ...tokens,
      user: { id: userId, email: userEmail, displayName: userDisplayName, role: userRole, tenantId: config.tenantId },
      jitProvisioned,
    };

    // Check MFA enforcement
    const { MfaService } = await import('./mfa-service.js');
    const mfaService = new MfaService();
    const mfaCheck = await mfaService.checkMfaRequired(userId, config.tenantId);
    if (mfaCheck.mfaSetupRequired) {
      result.mfaSetupRequired = true;
      result.setupToken = mfaCheck.setupToken;
    }

    return result;
  }

  /** Get SSO config for super_admin viewing any tenant */
  async getConfigForSuperAdmin(tenantId: string) {
    return this.getConfig(tenantId);
  }

  // ── Private helpers ───────────────────────────────────────────────

  private async _findConfigByClaims(claims: SsoCallbackClaims) {
    if (claims.entityId) {
      return ssoRepo.findByEntityId(claims.entityId);
    }
    if (claims.issuerUrl) {
      return ssoRepo.findByIssuerUrl(claims.issuerUrl);
    }
    throw new AppError(400, 'SSO callback must include entityId or issuerUrl', 'SSO_MISSING_IDENTIFIER');
  }

  private _resolveRoleFromGroups(
    userGroups: string[], mappings: GroupRoleMapping[]
  ): { role: string; designation?: string } {
    for (const mapping of mappings) {
      if (userGroups.includes(mapping.idpGroup)) {
        return { role: mapping.role, designation: mapping.designation };
      }
    }
    return { role: 'analyst' };
  }

  private async _createSession(userId: string, tenantId: string, ipAddress: string, userAgent: string) {
    const user = await repo.findUserById(userId);
    if (!user) throw new AppError(500, 'User not found after creation', 'INTERNAL_ERROR');

    const jwtConfig = getJwtConfig();
    const role = user.role as 'super_admin' | 'tenant_admin' | 'analyst';
    const refreshTtl = getRefreshExpiryForRole(role);
    const sessionExpiresAt = new Date(Date.now() + refreshTtl * 1000);

    const session = await repo.createSession({
      userId, tenantId, refreshTokenHash: 'pending',
      ipAddress, userAgent, expiresAt: sessionExpiresAt,
    });

    const accessToken = signAccessToken({ userId, tenantId, email: user.email, role, sessionId: session.id });
    const refreshToken = signRefreshToken({ userId, tenantId, sessionId: session.id, role });

    const refreshTokenHash = sha256(refreshToken);
    await repo.updateSessionHash(session.id, refreshTokenHash);

    return { accessToken, refreshToken, expiresIn: jwtConfig.accessExpirySeconds };
  }

  private _redactSecret(config: { clientSecret?: string | null; [key: string]: unknown }) {
    return { ...config, clientSecret: config.clientSecret ? '***' : null };
  }
}
