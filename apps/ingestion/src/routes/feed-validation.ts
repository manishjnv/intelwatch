/**
 * @module routes/feed-validation
 * @description Feed URL validation endpoint — checks if a URL is a valid, reachable
 * feed without creating it. Used by onboarding wizard feed selection step.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, getUser } from '../plugins/auth.js';
import { AppError } from '@etip/shared-utils';

const ValidateFeedSchema = z.object({
  url: z.string().url(),
  feedType: z.enum(['rss', 'rest_api', 'nvd', 'stix', 'misp']).default('rss'),
});

/** Per-tenant rate limiter — 5 validations per minute. */
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(tenantId: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(tenantId);
  if (!entry || now >= entry.resetAt) {
    rateLimits.set(tenantId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

export function feedValidationRoutes() {
  return async function (app: FastifyInstance): Promise<void> {

    /** POST /api/v1/feeds/validate — Validate a feed URL without creating it. */
    app.post('/validate', { preHandler: [authenticate] }, async (req, reply) => {
      const user = getUser(req);
      const tenantId = user.tenantId;

      // Rate limit check
      if (!checkRateLimit(tenantId)) {
        throw new AppError(429, 'Rate limit exceeded: max 5 validations per minute', 'RATE_LIMIT_EXCEEDED');
      }

      const body = ValidateFeedSchema.parse(req.body);
      const startMs = Date.now();

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);

        const res = await fetch(body.url, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'User-Agent': 'ETIP-FeedValidator/1.0' },
        });

        clearTimeout(timer);
        const responseTimeMs = Date.now() - startMs;

        if (!res.ok) {
          return reply.send({
            data: { valid: false, error: `HTTP ${res.status}: ${res.statusText}`, responseTimeMs },
          });
        }

        const contentType = res.headers.get('content-type') ?? '';
        const text = await res.text();

        // Basic feed detection heuristics
        const isRss = text.includes('<rss') || text.includes('<feed') || text.includes('<channel');
        const isJson = contentType.includes('json') || text.trimStart().startsWith('{') || text.trimStart().startsWith('[');
        const isXml = contentType.includes('xml') || text.trimStart().startsWith('<?xml') || isRss;

        if (body.feedType === 'rss' && !isRss && !isXml) {
          return reply.send({
            data: { valid: false, error: 'not a valid feed', responseTimeMs },
          });
        }

        if (body.feedType === 'rest_api' && !isJson) {
          return reply.send({
            data: { valid: false, error: 'not a valid feed', responseTimeMs },
          });
        }

        // Try to extract feed title and item count
        let feedTitle: string | undefined;
        let articleCount: number | undefined;

        if (isRss || isXml) {
          const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/);
          feedTitle = titleMatch?.[1];
          const itemMatches = text.match(/<item[\s>]/g) || text.match(/<entry[\s>]/g);
          articleCount = itemMatches?.length;
        } else if (isJson) {
          try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) articleCount = parsed.length;
            else if (parsed.results) articleCount = parsed.results.length;
            else if (parsed.data) articleCount = Array.isArray(parsed.data) ? parsed.data.length : undefined;
            feedTitle = parsed.title ?? parsed.name ?? parsed.feed?.title;
          } catch { /* ignore parse errors */ }
        }

        return reply.send({
          data: {
            valid: true,
            feedTitle,
            articleCount,
            responseTimeMs,
          },
        });
      } catch (err) {
        const responseTimeMs = Date.now() - startMs;
        const message = (err as Error).name === 'AbortError' ? 'timeout' : 'unreachable';
        return reply.send({
          data: { valid: false, error: message, responseTimeMs },
        });
      }
    });
  };
}

/** Reset rate limits (for testing). */
export function _resetRateLimits(): void {
  rateLimits.clear();
}
