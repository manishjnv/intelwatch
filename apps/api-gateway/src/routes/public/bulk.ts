/**
 * @module routes/public/bulk
 * @description Public API bulk IOC lookup — check up to 100 values in a single request.
 * Auth: API key (ioc:read scope). TLP:RED always excluded.
 * Industry standard: similar to VirusTotal /files, Recorded Future /v3/indicators/lookup.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BulkIocLookupBodySchema } from '@etip/shared-types';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { prisma } from '../../prisma.js';
import { apiKeyAuth } from '../../plugins/api-key-auth.js';
import { getUser } from '../../plugins/auth.js';
import { toPublicIoc, IOC_PUBLIC_SELECT } from './dto.js';

export async function publicBulkRoutes(app: FastifyInstance): Promise<void> {
  const auth = apiKeyAuth('ioc:read');

  // ── POST /iocs/lookup — Bulk IOC lookup ──────────────────────────
  app.post('/iocs/lookup', {
    schema: {
      tags: ['IOCs'],
      summary: 'Bulk IOC lookup — check up to 100 values',
      body: zodToJsonSchema(BulkIocLookupBodySchema, { target: 'openApi3' }),
    },
    preHandler: [auth],
  }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const body = BulkIocLookupBodySchema.parse(req.body);

    const where: Record<string, unknown> = {
      tenantId: user.tenantId,
      tlp: { not: 'red' },
      archivedAt: null,
      normalizedValue: { in: body.values.map((v) => v.toLowerCase().trim()) },
    };

    if (body.iocType) where.iocType = body.iocType;

    const rows = await prisma.ioc.findMany({
      where,
      select: IOC_PUBLIC_SELECT,
      orderBy: { lastSeen: 'desc' },
    });

    const found = rows.map(toPublicIoc);

    // Build a lookup map for quick existence checking
    const foundValues = new Set(found.map((ioc) => ioc.value.toLowerCase()));
    const notFound = body.values.filter((v) => !foundValues.has(v.toLowerCase().trim()));

    return reply.send({
      data: {
        found,
        notFound,
      },
      meta: {
        requested: body.values.length,
        matched: found.length,
        unmatched: notFound.length,
      },
    });
  });
}
