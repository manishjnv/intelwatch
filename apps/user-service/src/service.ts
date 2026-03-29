import { AppError } from '@etip/shared-utils';
import { hashPassword, verifyPassword, signAccessToken, signRefreshToken, verifyRefreshToken, getJwtConfig, getRefreshExpiryForRole } from '@etip/shared-auth';
import { sha256 } from '@etip/shared-utils';
import type { Role } from '@etip/shared-types';
import * as repo from './repository.js';

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

export interface RegisterResult extends AuthTokens {
  user: SafeUserResult;
  tenant: { id: string; name: string; slug: string; plan: string };
}

export interface LoginResult extends AuthTokens { user: SafeUserResult; }

export interface SafeUserResult {
  id: string; email: string; displayName: string; role: string; tenantId: string; avatarUrl: string | null;
}

export class UserService {
  async register(input: RegisterInput): Promise<RegisterResult> {
    const existingTenant = await repo.findTenantBySlug(input.tenantSlug);
    if (existingTenant) throw new AppError(409, 'Tenant slug already taken', 'CONFLICT');

    const existingUser = await repo.findUserByEmail(input.email);
    if (existingUser) throw new AppError(409, 'Email already registered', 'CONFLICT');

    const passwordHash = await hashPassword(input.password);

    const tenant = await repo.createTenant({ name: input.tenantName, slug: input.tenantSlug });

    const user = await repo.createUser({
      tenantId: tenant.id, email: input.email, displayName: input.displayName,
      passwordHash, role: 'tenant_admin', authProvider: 'email',
    });

    const tokens = await this._createSession(user.id, tenant.id, input.ipAddress, input.userAgent);

    await repo.createAuditLog({
      tenantId: tenant.id, userId: user.id, action: 'USER_REGISTERED',
      entityType: 'user', entityId: user.id, ipAddress: input.ipAddress, userAgent: input.userAgent,
    });

    return {
      ...tokens,
      user: this._toSafeUser(user),
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan },
    };
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const user = await repo.findUserByEmail(input.email);
    if (!user) throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    if (!user.active) throw new AppError(401, 'Account is deactivated', 'ACCOUNT_INACTIVE');
    if (!user.tenant.active) throw new AppError(401, 'Organization is suspended', 'TENANT_INACTIVE');
    if (!user.passwordHash) throw new AppError(401, 'Password login not available for this account', 'INVALID_CREDENTIALS');

    const validPassword = await verifyPassword(input.password, user.passwordHash);
    if (!validPassword) throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');

    await repo.updateUserLoginStats(user.id);

    const tokens = await this._createSession(user.id, user.tenantId, input.ipAddress, input.userAgent);

    await repo.createAuditLog({
      tenantId: user.tenantId, userId: user.id, action: 'USER_LOGIN',
      entityType: 'session', ipAddress: input.ipAddress, userAgent: input.userAgent,
    });

    return { ...tokens, user: this._toSafeUser(user) };
  }

  async refreshTokens(input: RefreshInput): Promise<AuthTokens> {
    const payload = verifyRefreshToken(input.refreshToken);

    const session = await repo.findSessionById(payload.sessionId);
    if (!session) throw new AppError(401, 'Session not found', 'SESSION_NOT_FOUND');

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

    return { accessToken, refreshToken, expiresIn: jwtConfig.accessExpirySeconds };
  }

  private _toSafeUser(user: { id: string; email: string; displayName: string; role: string; tenantId: string; avatarUrl: string | null; }): SafeUserResult {
    return { id: user.id, email: user.email, displayName: user.displayName, role: user.role, tenantId: user.tenantId, avatarUrl: user.avatarUrl };
  }
}
