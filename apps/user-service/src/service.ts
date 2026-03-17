/**
 * @module @etip/user-service/service
 * @description Business logic for user registration, login, token refresh,
 * logout, and profile retrieval. Delegates DB access to repository.
 */
import { AppError } from '@etip/shared-utils';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getJwtConfig,
} from '@etip/shared-auth';
import { sha256 } from '@etip/shared-utils';
import * as repo from './repository.js';

// ── Input types ──────────────────────────────────────────────────────

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  tenantName: string;
  tenantSlug: string;
  ipAddress: string;
  userAgent: string;
}

export interface LoginInput {
  email: string;
  password: string;
  ipAddress: string;
  userAgent: string;
}

export interface RefreshInput {
  refreshToken: string;
  ipAddress: string;
  userAgent: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RegisterResult extends AuthTokens {
  user: SafeUserResult;
  tenant: { id: string; name: string; slug: string; plan: string };
}

export interface LoginResult extends AuthTokens {
  user: SafeUserResult;
}

export interface SafeUserResult {
  id: string;
  email: string;
  displayName: string;
  role: string;
  tenantId: string;
  avatarUrl: string | null;
}

// ── Service class ────────────────────────────────────────────────────

export class UserService {
  /**
   * Register a new tenant + admin user.
   * Creates tenant, creates user with tenant_admin role, issues tokens.
   */
  async register(input: RegisterInput): Promise<RegisterResult> {
    // Check if tenant slug already exists
    const existingTenant = await repo.findTenantBySlug(input.tenantSlug);
    if (existingTenant) {
      throw new AppError(409, 'Tenant slug already taken', 'CONFLICT');
    }

    // Check if email already in use
    const existingUser = await repo.findUserByEmail(input.email);
    if (existingUser) {
      throw new AppError(409, 'Email already registered', 'CONFLICT');
    }

    // Hash password
    const passwordHash = await hashPassword(input.password);

    // Create tenant
    const tenant = await repo.createTenant({
      name: input.tenantName,
      slug: input.tenantSlug,
    });

    // Create admin user for this tenant
    const user = await repo.createUser({
      tenantId: tenant.id,
      email: input.email,
      displayName: input.displayName,
      passwordHash,
      role: 'tenant_admin',
      authProvider: 'email',
    });

    // Issue tokens + create session
    const tokens = await this._createSession(user.id, tenant.id, input.ipAddress, input.userAgent);

    // Audit log
    await repo.createAuditLog({
      tenantId: tenant.id,
      userId: user.id,
      action: 'USER_REGISTERED',
      entityType: 'user',
      entityId: user.id,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return {
      ...tokens,
      user: this._toSafeUser(user),
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
      },
    };
  }

  /**
   * Login with email + password.
   * Validates credentials, creates session, issues tokens.
   */
  async login(input: LoginInput): Promise<LoginResult> {
    // Find user by email (across all tenants)
    const user = await repo.findUserByEmail(input.email);
    if (!user) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Verify user is active
    if (!user.active) {
      throw new AppError(401, 'Account is deactivated', 'ACCOUNT_INACTIVE');
    }

    // Verify tenant is active
    if (!user.tenant.active) {
      throw new AppError(401, 'Organization is suspended', 'TENANT_INACTIVE');
    }

    // Verify password
    if (!user.passwordHash) {
      throw new AppError(401, 'Password login not available for this account', 'INVALID_CREDENTIALS');
    }
    const validPassword = await verifyPassword(input.password, user.passwordHash);
    if (!validPassword) {
      throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Update login stats
    await repo.updateUserLoginStats(user.id);

    // Issue tokens + create session
    const tokens = await this._createSession(
      user.id,
      user.tenantId,
      input.ipAddress,
      input.userAgent
    );

    // Audit log
    await repo.createAuditLog({
      tenantId: user.tenantId,
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'session',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    return {
      ...tokens,
      user: this._toSafeUser(user),
    };
  }

  /**
   * Exchange a valid refresh token for new tokens.
   * Revokes the old session and creates a new one (rotation).
   */
  async refreshTokens(input: RefreshInput): Promise<AuthTokens> {
    // Verify the refresh token JWT
    const payload = verifyRefreshToken(input.refreshToken);

    // Find the session
    const session = await repo.findSessionById(payload.sessionId);
    if (!session) {
      throw new AppError(401, 'Session not found', 'SESSION_NOT_FOUND');
    }

    // Verify session is not revoked
    if (session.revokedAt) {
      // Possible token theft — revoke all user sessions
      await repo.revokeAllUserSessions(session.userId);
      throw new AppError(401, 'Session revoked — all sessions invalidated', 'SESSION_REVOKED');
    }

    // Verify session is not expired
    if (session.expiresAt < new Date()) {
      throw new AppError(401, 'Session expired', 'SESSION_EXPIRED');
    }

    // Verify refresh token hash matches
    const tokenHash = sha256(input.refreshToken);
    if (tokenHash !== session.refreshTokenHash) {
      // Possible token theft — revoke all sessions
      await repo.revokeAllUserSessions(session.userId);
      throw new AppError(401, 'Invalid refresh token — all sessions invalidated', 'INVALID_REFRESH');
    }

    // Verify user is still active
    if (!session.user.active || !session.user.tenant.active) {
      await repo.revokeSession(session.id);
      throw new AppError(401, 'Account or organization is inactive', 'ACCOUNT_INACTIVE');
    }

    // Revoke old session (token rotation)
    await repo.revokeSession(session.id);

    // Issue new tokens + create new session
    const tokens = await this._createSession(
      session.userId,
      session.tenantId,
      input.ipAddress,
      input.userAgent
    );

    return tokens;
  }

  /**
   * Logout — revoke the current session.
   */
  async logout(sessionId: string): Promise<void> {
    await repo.revokeSession(sessionId);
  }

  /**
   * Get user profile by ID and tenant.
   * Returns safe user data (no password hash or MFA secret).
   */
  async getProfile(userId: string, tenantId: string): Promise<SafeUserResult> {
    const user = await repo.findUserByIdAndTenant(userId, tenantId);
    if (!user) {
      throw new AppError(404, 'User not found', 'NOT_FOUND');
    }
    return this._toSafeUser(user);
  }

  // ── Private helpers ──────────────────────────────────────────────

  /**
   * Create a session and issue access + refresh tokens.
   *
   * Flow:
   * 1. Create session in DB (gets auto-generated UUID)
   * 2. Sign tokens with the real session ID
   * 3. Update session with the refresh token hash
   */
  private async _createSession(
    userId: string,
    tenantId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<AuthTokens> {
    const user = await repo.findUserById(userId);
    if (!user) {
      throw new AppError(500, 'User not found after creation', 'INTERNAL_ERROR');
    }

    const jwtConfig = getJwtConfig();
    const sessionExpiresAt = new Date(
      Date.now() + jwtConfig.refreshExpirySeconds * 1000
    );

    // Step 1: Create session with a placeholder hash
    const session = await repo.createSession({
      userId,
      tenantId,
      refreshTokenHash: 'pending', // Will be updated immediately
      ipAddress,
      userAgent,
      expiresAt: sessionExpiresAt,
    });

    // Step 2: Sign tokens with the real session ID
    const accessToken = signAccessToken({
      userId,
      tenantId,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    });

    const refreshToken = signRefreshToken({
      userId,
      tenantId,
      sessionId: session.id,
    });

    // Step 3: Update session with real refresh token hash
    const refreshTokenHash = sha256(refreshToken);
    await repo.updateSessionHash(session.id, refreshTokenHash);

    return {
      accessToken,
      refreshToken,
      expiresIn: jwtConfig.accessExpirySeconds,
    };
  }

  /**
   * Strip sensitive fields from user object.
   */
  private _toSafeUser(user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    tenantId: string;
    avatarUrl: string | null;
  }): SafeUserResult {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      tenantId: user.tenantId,
      avatarUrl: user.avatarUrl,
    };
  }
}
