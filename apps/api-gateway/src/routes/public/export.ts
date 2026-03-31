/**
 * @module routes/public/export
 * @description Public API IOC export — JSON, CSV, STIX 2.1 bundle.
 * Auth: API key (ioc:read scope). TLP:RED always excluded.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PublicIocExportBodySchema } from '@etip/shared-types';
import { prisma } from '../../prisma.js';
import { apiKeyAuth } from '../../plugins/api-key-auth.js';
import { getUser } from '../../plugins/auth.js';
import { toPublicIoc, IOC_PUBLIC_SELECT } from './dto.js';
import { iocsToStixBundle } from './stix-mapper.js';

/** CSV header row. */
const CSV_HEADERS = [
  'id', 'type', 'value', 'severity', 'tlp', 'confidence', 'lifecycle',
  'tags', 'mitreAttack', 'malwareFamilies', 'threatActors',
  'firstSeen', 'lastSeen', 'expiresAt', 'createdAt',
].join(',');

/** Escape a CSV field value. */
function csvEscape(val: string | null | undefined): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function publicExportRoutes(app: FastifyInstance): Promise<void> {
  const auth = apiKeyAuth('ioc:read');

  // ── POST /iocs/export — Export IOCs ──────────────────────────────
  app.post('/iocs/export', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = getUser(req);
    const body = PublicIocExportBodySchema.parse(req.body);
    const filters = body.filters ?? {};

    const where: Record<string, unknown> = {
      tenantId: user.tenantId,
      tlp: { not: 'red' },
      archivedAt: null,
    };

    if (filters.iocType) where.iocType = filters.iocType;
    if (filters.severity) where.severity = filters.severity;
    if (filters.lifecycle) where.lifecycle = filters.lifecycle;
    if (filters.tlp) where.tlp = filters.tlp;
    if (filters.minConfidence !== undefined || filters.maxConfidence !== undefined) {
      where.confidence = {
        ...(filters.minConfidence !== undefined && { gte: filters.minConfidence }),
        ...(filters.maxConfidence !== undefined && { lte: filters.maxConfidence }),
      };
    }
    if (filters.tags) {
      where.tags = { hasSome: filters.tags.split(',').map((t: string) => t.trim()) };
    }
    if (filters.firstSeenFrom || filters.firstSeenTo) {
      where.firstSeen = {
        ...(filters.firstSeenFrom && { gte: new Date(filters.firstSeenFrom) }),
        ...(filters.firstSeenTo && { lte: new Date(filters.firstSeenTo) }),
      };
    }

    const rows = await prisma.ioc.findMany({
      where,
      select: IOC_PUBLIC_SELECT,
      orderBy: { lastSeen: 'desc' },
      take: body.limit,
    });

    const iocs = rows.map(toPublicIoc);

    switch (body.format) {
      case 'json':
        return reply
          .header('Content-Type', 'application/json')
          .header('Content-Disposition', 'attachment; filename="iocs-export.json"')
          .send({ data: iocs, total: iocs.length, exportedAt: new Date().toISOString() });

      case 'csv': {
        const csvRows = iocs.map(ioc => [
          csvEscape(ioc.id),
          csvEscape(ioc.type),
          csvEscape(ioc.value),
          csvEscape(ioc.severity),
          csvEscape(ioc.tlp),
          String(ioc.confidence),
          csvEscape(ioc.lifecycle),
          csvEscape(ioc.tags.join(';')),
          csvEscape(ioc.mitreAttack.join(';')),
          csvEscape(ioc.malwareFamilies.join(';')),
          csvEscape(ioc.threatActors.join(';')),
          csvEscape(ioc.firstSeen),
          csvEscape(ioc.lastSeen),
          csvEscape(ioc.expiresAt),
          csvEscape(ioc.createdAt),
        ].join(','));

        const csvContent = [CSV_HEADERS, ...csvRows].join('\n');
        return reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', 'attachment; filename="iocs-export.csv"')
          .send(csvContent);
      }

      case 'stix': {
        const bundle = iocsToStixBundle(iocs);
        return reply
          .header('Content-Type', 'application/stix+json;version=2.1')
          .header('Content-Disposition', 'attachment; filename="iocs-export.stix.json"')
          .send(bundle);
      }
    }
  });
}
