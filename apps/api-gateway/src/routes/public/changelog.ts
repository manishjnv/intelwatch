/**
 * @module routes/public/changelog
 * @description Public API changelog — no auth required.
 * Static JSON array of version entries with Sunset header support.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

/** A single changelog version entry. */
interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

/**
 * Static changelog data. Add newest entries at the top.
 * This is intentionally not DB-backed — a simple static array is sufficient.
 */
const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.2.0',
    date: '2026-03-31',
    changes: [
      'Added TAXII 2.1 server endpoints (discovery, collections, objects)',
      'Added GET /changelog endpoint (this endpoint)',
      'Added webhook exponential backoff (Stripe-style: 1m, 5m, 30m, 2h, 12h, 24h)',
      'Added SDK auto-generation scaffolding (Python + TypeScript clients)',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-03-31',
    changes: [
      'Added OpenAPI/Swagger documentation at /docs',
      'Added GET /stats endpoint with IOC aggregations',
      'Added POST /iocs/lookup bulk endpoint (up to 100 values)',
      'Added ?updatedSince delta sync on GET /iocs',
      'Added ?include=enrichment on GET /iocs and GET /iocs/:id',
      'Added POST /api-keys/rotate for key rotation with 24h grace period',
      'Added X-RateLimit-* response headers',
      'Added X-Request-Id response header',
      'Fixed: webhook URLs now require HTTPS and block private IPs',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-03-28',
    changes: [
      'Initial public API release — IOCs, feeds, export, webhooks, usage',
    ],
  },
];

/**
 * Add a Sunset header to a reply for deprecated endpoints.
 * Call this helper from any route handler to signal deprecation.
 *
 * @param reply - Fastify reply object
 * @param sunsetDate - ISO 8601 date string when the endpoint will be removed
 * @param link - Optional URL to documentation about the deprecation
 */
export function addSunsetHeader(
  reply: FastifyReply,
  sunsetDate: string,
  link?: string,
): void {
  reply.header('Sunset', new Date(sunsetDate).toUTCString());
  reply.header('Deprecation', 'true');
  if (link) {
    reply.header('Link', `<${link}>; rel="sunset"`);
  }
}

export async function publicChangelogRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /changelog — Public API changelog (no auth) ───────────────
  app.get('/changelog', {
    schema: {
      tags: ['Changelog'],
      summary: 'Public API changelog — no authentication required',
    },
  }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ data: CHANGELOG });
  });
}
