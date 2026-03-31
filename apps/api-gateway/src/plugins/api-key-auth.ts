/**
 * @module plugins/api-key-auth
 * @description API key authentication middleware for public API routes.
 * Extracts key from X-API-Key header, verifies via bcrypt, resolves tenant,
 * and attaches a JwtPayload-compatible context for downstream plugins.
 *
 * Performance: caches verified key→tenant mapping in Redis (60s TTL).
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHash } from 'crypto';
import { verifyApiKey } from '@etip/shared-auth';
import { AppError } from '@etip/shared-utils';
import type { JwtPayload } from '@etip/shared-types';
import { prisma } from '../prisma.js';
import { getRedis } from '../quota/plan-cache.js';
import type { AuthenticatedRequest } from './auth.js';

const API_KEY_PREFIX = 'etip_';
const CACHE_PREFIX = 'apikey_auth:';
const CACHE_TTL_SECONDS = 60;

interface CachedKeyContext {
  userId: string;
  tenantId: string;
  apiKeyId: string;
  scopes: string[];
}

/**
 * Build a short hash of the raw API key for Redis cache keying.
 * NOT the bcrypt hash — just a fast SHA-256 for cache lookup.
 */
function quickHash(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 32);
}

/**
 * Try to resolve the API key from Redis cache (fast path).
 */
async function resolveFromCache(rawKey: string): Promise<CachedKeyContext | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const cached = await redis.get(`${CACHE_PREFIX}${quickHash(rawKey)}`);
    if (cached) return JSON.parse(cached) as CachedKeyContext;
  } catch { /* cache miss is fine */ }
  return null;
}

/**
 * Cache a verified key context in Redis.
 */
async function cacheKeyContext(rawKey: string, ctx: CachedKeyContext): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(`${CACHE_PREFIX}${quickHash(rawKey)}`, JSON.stringify(ctx), 'EX', CACHE_TTL_SECONDS);
  } catch { /* non-fatal */ }
}

/**
 * Update lastUsed timestamp (fire-and-forget, non-blocking).
 */
function touchLastUsed(apiKeyId: string): void {
  prisma.apiKey.update({
    where: { id: apiKeyId },
    data: { lastUsed: new Date() },
  }).catch(() => { /* non-fatal */ });
}

/**
 * Factory: creates an API key auth preHandler for a given required scope.
 * If scope is null, any valid key is accepted.
 */
export function apiKeyAuth(requiredScope: string | null = null) {
  return async function apiKeyAuthHandler(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const rawKey = req.headers['x-api-key'] as string | undefined;
    if (!rawKey) {
      throw new AppError(401, 'Missing X-API-Key header', 'UNAUTHORIZED');
    }

    if (!rawKey.startsWith(API_KEY_PREFIX)) {
      throw new AppError(401, 'Invalid API key format', 'UNAUTHORIZED');
    }

    // Fast path: check Redis cache
    let ctx = await resolveFromCache(rawKey);

    if (!ctx) {
      // Slow path: DB lookup by prefix → bcrypt verify
      const prefix = rawKey.slice(0, 12);
      const candidates = await prisma.apiKey.findMany({
        where: { prefix, active: true },
        select: {
          id: true, keyHash: true, userId: true, tenantId: true,
          scopes: true, expiresAt: true,
        },
      });

      if (candidates.length === 0) {
        throw new AppError(401, 'Invalid API key', 'UNAUTHORIZED');
      }

      // Verify against each candidate (usually 1)
      let matched: typeof candidates[0] | null = null;
      for (const candidate of candidates) {
        const valid = await verifyApiKey(rawKey, candidate.keyHash);
        if (valid) { matched = candidate; break; }
      }

      if (!matched) {
        throw new AppError(401, 'Invalid API key', 'UNAUTHORIZED');
      }

      // Check expiry
      if (matched.expiresAt && matched.expiresAt < new Date()) {
        throw new AppError(401, 'API key has expired', 'API_KEY_EXPIRED');
      }

      ctx = {
        userId: matched.userId,
        tenantId: matched.tenantId,
        apiKeyId: matched.id,
        scopes: matched.scopes,
      };

      // Cache for subsequent requests
      await cacheKeyContext(rawKey, ctx);
    }

    // Check tenant is active
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { active: true },
    });
    if (!tenant?.active) {
      throw new AppError(403, 'Tenant account is inactive', 'TENANT_INACTIVE');
    }

    // Scope check
    if (requiredScope && !ctx.scopes.includes(requiredScope)) {
      throw new AppError(403, `API key missing required scope: ${requiredScope}`, 'INSUFFICIENT_SCOPE');
    }

    // Attach JwtPayload-compatible context for downstream middleware
    const now = Math.floor(Date.now() / 1000);
    const userPayload: JwtPayload = {
      sub: ctx.userId,
      tenantId: ctx.tenantId,
      email: '',
      role: 'analyst',
      sessionId: `apikey-${ctx.apiKeyId}`,
      iat: now,
      exp: now + 3600, // synthetic — API keys don't expire per-request
    };
    (req as FastifyRequest & AuthenticatedRequest).user = userPayload;

    // Attach API key metadata for audit/webhook routes
    (req as FastifyRequest & { apiKeyContext?: CachedKeyContext }).apiKeyContext = ctx;

    // Touch lastUsed (non-blocking)
    touchLastUsed(ctx.apiKeyId);
  };
}
