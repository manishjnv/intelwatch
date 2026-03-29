import { createHash, randomBytes } from 'crypto';
import { AppError } from '@etip/shared-utils';
import { prisma } from '../prisma.js';

const MAX_ACTIVE_TOKENS_PER_TENANT = 3;

/** Generate a 64-character hex SCIM bearer token. */
export function generateScimToken(): string {
  return randomBytes(32).toString('hex');
}

/** Deterministic SHA-256 hash for SCIM token lookup. */
export function hashScimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface ScimTokenRecord {
  id: string;
  description: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revoked: boolean;
}

/**
 * SCIM token lifecycle management.
 * Tokens are 64-char hex; only SHA-256 hash stored in DB.
 * Max 3 active (non-revoked, non-expired) tokens per tenant.
 */
export class ScimTokenService {
  /** Create a new SCIM token. Returns raw token (shown once). */
  async createToken(
    tenantId: string,
    description: string,
    createdBy: string,
    expiresInDays?: number,
  ): Promise<{ token: string; id: string }> {
    // Enforce max 3 active tokens per tenant
    const activeCount = await prisma.scimToken.count({
      where: {
        tenantId,
        revoked: false,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });

    if (activeCount >= MAX_ACTIVE_TOKENS_PER_TENANT) {
      throw new AppError(
        409,
        `Maximum ${MAX_ACTIVE_TOKENS_PER_TENANT} active SCIM tokens per tenant. Revoke an existing token first.`,
        'SCIM_TOKEN_LIMIT',
      );
    }

    const rawToken = generateScimToken();
    const tokenHash = hashScimToken(rawToken);
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const record = await prisma.scimToken.create({
      data: {
        tenantId,
        tokenHash,
        description,
        createdBy,
        expiresAt,
      },
    });

    return { token: rawToken, id: record.id };
  }

  /** List all tokens for a tenant (hash never exposed). */
  async listTokens(tenantId: string): Promise<ScimTokenRecord[]> {
    const tokens = await prisma.scimToken.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        description: true,
        createdBy: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revoked: true,
      },
    });

    return tokens.map((t) => ({
      id: t.id,
      description: t.description,
      createdBy: t.createdBy,
      createdAt: t.createdAt.toISOString(),
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      revoked: t.revoked,
    }));
  }

  /** Revoke a token by ID. */
  async revokeToken(tokenId: string, tenantId: string): Promise<void> {
    const token = await prisma.scimToken.findFirst({
      where: { id: tokenId, tenantId },
    });
    if (!token) {
      throw new AppError(404, 'SCIM token not found', 'SCIM_TOKEN_NOT_FOUND');
    }
    if (token.revoked) {
      throw new AppError(400, 'Token already revoked', 'SCIM_TOKEN_ALREADY_REVOKED');
    }

    await prisma.scimToken.update({
      where: { id: tokenId },
      data: { revoked: true },
    });
  }

  /**
   * Authenticate a raw bearer token.
   * Returns tenantId if valid, null if invalid/revoked/expired.
   * Updates lastUsedAt on success.
   */
  async authenticateToken(
    rawToken: string,
  ): Promise<{ tenantId: string; tokenId: string } | null> {
    const tokenHash = hashScimToken(rawToken);

    const record = await prisma.scimToken.findUnique({
      where: { tokenHash },
      include: { tenant: { select: { active: true } } },
    });

    if (!record) return null;
    if (record.revoked) return null;
    if (record.expiresAt && record.expiresAt <= new Date()) return null;
    if (!record.tenant.active) return null;

    // Update lastUsedAt (fire-and-forget — don't block auth)
    prisma.scimToken.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => { /* non-critical */ });

    return { tenantId: record.tenantId, tokenId: record.id };
  }
}
