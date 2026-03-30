import { AppError } from '@etip/shared-utils';
import { hashPassword, verifyPassword, signAccessToken, signRefreshToken, verifyRefreshToken, getJwtConfig, getRefreshExpiryForRole } from '@etip/shared-auth';
import { sha256 } from '@etip/shared-utils';
import type { Role } from '@etip/shared-types';
import * as repo from './repository.js';
import { generateVerificationToken, buildEmailJobPayload } from './email-verification-service.js';
import { enrichSessionGeo } from './geoip.js';
import { buildAuditReplicationJob } from './audit-replication.js';

export interface RegisterInput {
  email: string; password: string; displayName: string;
  tenantName: string; tenantSlug: string; ipAddress: string; userAgent: string;
}

export interface LoginInput {
  email: string; password: string; ipAddress: string; userAgent: string;
}

export interface RefreshInput {
  refreshToken: string; ipAddress: string; userAgent: string;
}

export interface AuthTokens { accessToken: string; refreshToken: string; expiresIn: number; }

export interface RegisterResult {
  user: SafeUserResult;
  tenant: { id: string; name: string; slug: string; plan: string };
  message: string;
  /** Email verification job payload — caller should queue this to BullMQ */
  emailJobPayload?: { queue: string; data: { type: string; userId: string; email: string; token: string; tenantName: string } };
}

export interface LoginResult extends AuthTokens { user: SafeUserResult; }

/** Returned when MFA is required or enforcement requires MFA setup */
export interface MfaLoginResult {
  mfaRequired?: boolean;
  mfaSetupRequired?: boolean;
  mfaToken?: string;
  setupToken?: string;
  message: string;
}

export interface SafeUserResult {
  id: string; email: string; displayName: string; role: string; tenantId: string; avatarUrl: string | null;
}

export interface SessionListResult {
  id: string; ipAddress: string | null; userAgent: string | null; createdAt: Date;
  geoCountry: string | null; geoCity: string | null; geoIsp: string | null; isCurrent: boolean;
}

export class UserService {
  async register(input: RegisterInput): Promise<RegisterResult> {
    const existingTenant = await repo.findTenantBySlug(input.tenantSlug);
    if (existingTenant) throw new AppError(409, 'Tenant slug already taken', 'CONFLICT');

    const existingUser = await repo.findUserByEmailAnyStatus(input.email);
    if (existingUser) throw new AppError(409, 'Email already registered', 'CONFLICT');

    const passwordHash = await hashPassword(input.password);

    const tenant = await repo.createTenant({ name: input.tenantName, slug: input.tenantSlug });

    const user = await repo.createUser({
      tenantId: tenant.id, email: input.email, displayName: input.displayName,
      passwordHash, role: 'tenant_admin', authProvider: 'email',
      active: false, emailVerified: false,
    });

    // Generate verification token and build email job payload
    const token = await generateVerificationToken(user.id);
    const emailJobPayload = buildEmailJobPayload(user.id, user.email, token, tenant.name);

    await repo.createAuditLog({
      tenantId: tenant.id, userId: user.id, action: 'USER_REGISTERED',
      entityType: 'user', entityId: user.id, ipAddress: input.ipAddress, userAgent: input.userAgent,
    });

    return {
      user: this._toSafeUser(user),
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan },
      message: 'Account created. Please verify your email within 24 hours.',
      emailJobPayload,
    };
  }

  async login(input: LoginInput): Promise<LoginResult | MfaLoginResult> {
    const user = await repo.findUserByEmailAnyStatus(input.email);
    if (!user) throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');

    // Break-glass accounts must use the emergency login endpoint (I-22)
    if (user.isBreakGlass) {
      throw new AppError(403,
        'Break-glass accounts must use the emergency login endpoint',
        'BREAK_GLASS_NORMAL_LOGIN_DENIED',
      );
    }

    // Email verification guard — before active/password checks
    if (!user.emailVerified) {
      throw new AppError(403,
        'Please verify your email before logging in. Check your inbox or request a new verification link.',
        'EMAIL_NOT_VERIFIED',
        { resendUrl: '/api/v1/auth/resend-verification' }
      );
    }

    if (!user.active) throw new AppError(401, 'Account is deactivated', 'ACCOUNT_INACTIVE');
    if (!user.tenant.active) throw new AppError(401, 'Organization is suspended', 'TENANT_INACTIVE');
    if (!user.passwordHash) throw new AppError(401, 'Password login not available for this account', 'INVALID_CREDENTIALS');

    const validPassword = await verifyPassword(input.password, user.passwordHash);
    if (!validPassword) throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');

    await repo.updateUserLoginStats(user.id);

    // Check MFA requirement
    const { MfaService } = await import('./mfa-service.js');
    const mfaService = new MfaService();
    const mfaCheck = await mfaService.checkMfaRequired(user.id, user.tenantId);

    if (mfaCheck.mfaRequired) {
      // MFA enabled — return challenge token, no session yet
      return {
        mfaRequired: true,
        mfaToken: mfaCheck.mfaToken,
        message: 'MFA verification required',
      };
    }

    if (mfaCheck.mfaSetupRequired) {
      // Enforcement requires MFA setup first
      return {
        mfaSetupRequired: true,
        setupToken: mfaCheck.setupToken,
        message: 'MFA setup required by organization policy',
      };
    }

    // No MFA — normal login
    const tokens = await this._createSession(user.id, user.tenantId, input.ipAddress, input.userAgent);

    await repo.createAuditLog({
      tenantId: user.tenantId, userId: user.id, action: 'USER_LOGIN',
      entityType: 'session', ipAddress: input.ipAddress, userAgent: input.userAgent,
    });

    return { ...tokens, user: this._toSafeUser(user) };
  }

  /** Complete login after successful MFA verification — creates session + returns tokens */
  async completeLoginAfterMfa(userId: string, tenantId: string, ipAddress: string, userAgent: string): Promise<LoginResult> {
    const user = await repo.findUserById(userId);
    if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');

    const tokens = await this._createSession(userId, tenantId, ipAddress, userAgent);

    await repo.createAuditLog({
      tenantId, userId, action: 'USER_LOGIN',
      entityType: 'session', ipAddress, userAgent,
      changes: { mfaVerified: true },
    });

    return { ...tokens, user: this._toSafeUser(user) };
  }

  async refreshTokens(input: RefreshInput): Promise<AuthTokens> {
    const payload = verifyRefreshToken(input.refreshToken);

    const session = await repo.findSessionById(payload.sessionId);
    if (!session) throw new AppError(401, 'Session not found', 'SESSION_NOT_FOUND');

    // Break-glass sessions are non-renewable (I-22)
    if (session.breakGlassSession) {
      throw new AppError(403,
        'Break-glass sessions cannot be renewed. Initiate a new break-glass login if needed.',
        'BREAK_GLASS_NOT_RENEWABLE',
      );
    }

    if (session.revokedAt) {
      await repo.revokeAllUserSessions(session.userId);
      throw new AppError(401, 'Session revoked — all sessions invalidated', 'SESSION_REVOKED');
    }

    if (session.expiresAt < new Date()) throw new AppError(401, 'Session expired', 'SESSION_EXPIRED');

    const tokenHash = sha256(input.refreshToken);
    if (tokenHash !== session.refreshTokenHash) {
      await repo.revokeAllUserSessions(session.userId);
      throw new AppError(401, 'Invalid refresh token — all sessions invalidated', 'INVALID_REFRESH');
    }

    if (!session.user.active || !session.user.tenant.active) {
      await repo.revokeSession(session.id);
      throw new AppError(401, 'Account or organization is inactive', 'ACCOUNT_INACTIVE');
    }

    await repo.revokeSession(session.id);

    return this._createSession(session.userId, session.tenantId, input.ipAddress, input.userAgent);
  }

  async logout(sessionId: string): Promise<void> {
    await repo.revokeSession(sessionId);
  }

  async getProfile(userId: string, tenantId: string): Promise<SafeUserResult> {
    const user = await repo.findUserByIdAndTenant(userId, tenantId);
    if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
    return this._toSafeUser(user);
  }

  private async _createSession(userId: string, tenantId: string, ipAddress: string, userAgent: string): Promise<AuthTokens> {
    const user = await repo.findUserById(userId);
    if (!user) throw new AppError(500, 'User not found after creation', 'INTERNAL_ERROR');

    const jwtConfig = getJwtConfig();
    const role = user.role as Role;
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

    // Fire-and-forget geo enrichment (I-16)
    enrichSessionGeo(session.id, userId, tenantId, ipAddress).catch((err) =>
      console.warn('[geo] enrichment failed:', err),
    );

    return { accessToken, refreshToken, expiresIn: jwtConfig.accessExpirySeconds };
  }

  /** List active sessions for a user with geo data (I-16) */
  async listSessions(userId: string, currentSessionId: string): Promise<SessionListResult[]> {
    const sessions = await repo.findActiveSessionsByUser(userId);
    return sessions.map((s) => ({
      ...s, ipAddress: s.ipAddress ?? null, userAgent: s.userAgent ?? null,
      isCurrent: s.id === currentSessionId,
    }));
  }

  /** Terminate (revoke) a specific session — cannot terminate current session */
  async terminateSession(userId: string, sessionId: string, currentSessionId: string, tenantId: string, ipAddress?: string): Promise<void> {
    if (sessionId === currentSessionId) throw new AppError(403, 'Cannot terminate current session', 'FORBIDDEN');
    await repo.revokeSession(sessionId);
    await repo.createAuditLog({
      tenantId, userId, action: 'SESSION_TERMINATED',
      entityType: 'session', entityId: sessionId, ipAddress,
    });
  }

  /** Build audit replication job payload for BullMQ (I-15) */
  getAuditReplicationJob(auditLogId: string, tenantId: string) {
    return buildAuditReplicationJob(auditLogId, tenantId);
  }

  private _toSafeUser(user: { id: string; email: string; displayName: string; role: string; tenantId: string; avatarUrl: string | null; }): SafeUserResult {
    return { id: user.id, email: user.email, displayName: user.displayName, role: user.role, tenantId: user.tenantId, avatarUrl: user.avatarUrl };
  }
}
