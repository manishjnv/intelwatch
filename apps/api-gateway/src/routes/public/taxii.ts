/**
 * @module routes/public/taxii
 * @description TAXII 2.1 public API endpoints — discovery, collections, objects.
 * Spec: https://docs.oasis-open.org/cti/taxii/v2.1/os/taxii-v2.1-os.html
 * Auth: API key (ioc:read scope). TLP:RED always excluded.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { prisma } from '../../prisma.js';
import { apiKeyAuth } from '../../plugins/api-key-auth.js';
import { getUser } from '../../plugins/auth.js';
import { toPublicIoc, IOC_PUBLIC_SELECT } from './dto.js';
import { buildIocWhere } from './filters.js';
import { iocsToStixBundle } from './stix-mapper.js';

const TAXII_CONTENT_TYPE = 'application/taxii+json;version=2.1';
const STIX_CONTENT_TYPE = 'application/stix+json;version=2.1';

/** TAXII 2.1 collection definitions — virtual collections by severity. */
const SEVERITY_COLLECTIONS = ['critical', 'high', 'medium', 'low', 'info'] as const;

/** Build a collection object for a given collection ID. */
function buildCollection(id: string, title: string) {
  return {
    id,
    title,
    can_read: true,
    can_write: false,
    media_types: [STIX_CONTENT_TYPE],
  };
}

/** Query schema for GET /taxii/collections/:id/objects */
const TaxiiObjectsQuerySchema = z.object({
  added_after: z.string().datetime().optional(),
  'match[type]': z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  next: z.string().optional(),
});

export async function publicTaxiiRoutes(app: FastifyInstance): Promise<void> {
  const auth = apiKeyAuth('ioc:read');

  // ── GET /taxii/discovery — TAXII 2.1 discovery endpoint ───────────
  app.get('/taxii/discovery', {
    schema: {
      tags: ['TAXII 2.1'],
      summary: 'TAXII 2.1 discovery — returns API root and capabilities',
    },
    preHandler: [auth],
  }, async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply
      .header('Content-Type', TAXII_CONTENT_TYPE)
      .send({
        title: 'IntelWatch ETIP TAXII 2.1 Server',
        description: 'Threat intelligence indicators via TAXII 2.1 protocol',
        default: '/api/v1/public/taxii',
        api_roots: ['/api/v1/public/taxii'],
      });
  });

  // ── GET /taxii/collections — List available TAXII collections ─────
  app.get('/taxii/collections', {
    schema: {
      tags: ['TAXII 2.1'],
      summary: 'List available TAXII 2.1 collections (by severity + all)',
    },
    preHandler: [auth],
  }, async (_req: FastifyRequest, reply: FastifyReply) => {
    const collections = [
      buildCollection('all', 'All IOC Indicators'),
      ...SEVERITY_COLLECTIONS.map((s) =>
        buildCollection(s, `${s.charAt(0).toUpperCase() + s.slice(1)} Severity Indicators`),
      ),
    ];
    return reply
      .header('Content-Type', TAXII_CONTENT_TYPE)
      .send({ collections });
  });

  // ── GET /taxii/collections/:id/objects — Get STIX 2.1 objects ─────
  app.get('/taxii/collections/:id/objects', {
    schema: {
      tags: ['TAXII 2.1'],
      summary: 'Get STIX 2.1 objects from a TAXII collection',
      params: zodToJsonSchema(z.object({ id: z.string() }), { target: 'openApi3' }),
      querystring: zodToJsonSchema(TaxiiObjectsQuerySchema, { target: 'openApi3' }),
    },
    preHandler: [auth],
  }, async (req: FastifyRequest<{
    Params: { id: string };
    Querystring: z.infer<typeof TaxiiObjectsQuerySchema>;
  }>, reply: FastifyReply) => {
    const user = getUser(req);
    const { id: collectionId } = req.params;
    const query = TaxiiObjectsQuerySchema.parse(req.query);

    // Validate collection ID
    const validIds = ['all', ...SEVERITY_COLLECTIONS];
    if (!validIds.includes(collectionId)) {
      return reply.status(404).header('Content-Type', TAXII_CONTENT_TYPE).send({
        title: 'Collection not found',
        http_status: 404,
      });
    }

    // Build filters
    const filters: Record<string, unknown> = {};
    if (collectionId !== 'all') {
      filters.severity = collectionId;
    }

    // added_after → createdAt filter
    const extra: Record<string, unknown> = {};
    if (query.added_after) {
      extra.createdAt = { gte: new Date(query.added_after) };
    }

    const where = buildIocWhere(user.tenantId, filters, extra);

    // match[type] — filter STIX object types (map back to IOC types)
    const matchType = query['match[type]'];
    if (matchType) {
      const iocTypes = stixTypeToIocTypes(matchType);
      if (iocTypes.length > 0) {
        where.iocType = { in: iocTypes };
      }
    }

    const take = query.limit;
    const skip = query.next ? parseInt(query.next, 10) : 0;

    const rows = await prisma.ioc.findMany({
      where,
      select: IOC_PUBLIC_SELECT,
      orderBy: { createdAt: 'asc' },
      take: take + 1, // fetch one extra to determine if more exist
      skip,
    });

    const hasMore = rows.length > take;
    const pageRows = hasMore ? rows.slice(0, take) : rows;
    const iocs = pageRows.map((r) => toPublicIoc(r));
    const bundle = iocsToStixBundle(iocs);

    const headers: Record<string, string> = {
      'Content-Type': STIX_CONTENT_TYPE,
    };
    if (hasMore) {
      headers['X-TAXII-Date-Added-First'] = pageRows[0]?.createdAt?.toISOString?.()
        ?? new Date().toISOString();
      headers['X-TAXII-Date-Added-Last'] = pageRows[pageRows.length - 1]?.createdAt?.toISOString?.()
        ?? new Date().toISOString();
    }

    // Pagination: next offset
    const nextOffset = hasMore ? String(skip + take) : undefined;

    return reply
      .headers(headers)
      .send({
        ...bundle,
        ...(nextOffset && { more: true, next: nextOffset }),
      });
  });
}

/**
 * Map a STIX SCO/SDO type string to ETIP IOC types.
 * Allows TAXII consumers to filter by STIX object type.
 */
function stixTypeToIocTypes(stixType: string): string[] {
  const map: Record<string, string[]> = {
    'ipv4-addr': ['ip'],
    'ipv6-addr': ['ipv6'],
    'domain-name': ['domain', 'fqdn'],
    'url': ['url'],
    'email-addr': ['email'],
    'file': ['md5', 'sha1', 'sha256', 'sha512'],
    'autonomous-system': ['asn'],
    'vulnerability': ['cve'],
  };
  return map[stixType] ?? [];
}
