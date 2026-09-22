/**
 * @module api-gateway/plugins/rate-limit-key
 * @description Rate-limit bucket key (S147 security review finding).
 *
 * Previously the key was the raw `x-tenant-id` header, so a client could get a fresh bucket
 * per request by sending a random value. Now:
 *   - valid access token  → `t:<tenantId from the verified JWT>` (per-tenant quota)
 *   - otherwise           → `ip:<client IP>`, taken from `CF-Connecting-IP` (set and
 *                           overwritten by Cloudflare; all public traffic arrives through the
 *                           Cloudflare tunnel) and falling back to Fastify's req.ip.
 * Runs in onRequest (before `authenticate`), hence its own token verification — cheap HMAC.
 */
import type { FastifyRequest } from 'fastify';
import { verifyAccessToken } from '@etip/shared-auth';

export function rateLimitKey(req: FastifyRequest): string {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    try {
      return `t:${verifyAccessToken(auth.slice(7).trim()).tenantId}`;
    } catch {
      // invalid/expired token: fall through to the IP bucket
    }
  }
  const cf = req.headers['cf-connecting-ip'];
  const ip = typeof cf === 'string' && cf.trim() ? cf.trim() : req.ip;
  return `ip:${ip}`;
}
