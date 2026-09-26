/**
 * @module @etip/shared-utils/search-index
 * @description Shared IOC → Elasticsearch document/job contract. Producers
 * (normalization, api-gateway backfill, ioc-intelligence) and the consumer
 * (elasticsearch-indexing-service) MUST use this module — never redefine
 * the document shape, job payload, or job id format locally.
 */
import { z } from 'zod';

export const IocDocumentSchema = z.object({
  iocId: z.string().min(1),
  tenantId: z.string().min(1), // 'global' reserved for a later option
  value: z.string().min(1),
  normalizedValue: z.string().min(1),
  type: z.string().min(1), // Prisma IocType, e.g. 'ip', 'hash_sha256'
  severity: z.enum(['info', 'low', 'medium', 'high', 'critical']),
  confidence: z.number().int().min(0).max(100),
  lifecycle: z.string().min(1),
  tlp: z.enum(['WHITE', 'GREEN', 'AMBER', 'RED']),
  tags: z.array(z.string()).default([]),
  mitreAttack: z.array(z.string()).default([]),
  malwareFamilies: z.array(z.string()).default([]),
  threatActors: z.array(z.string()).default([]),
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sourceId: z.string().optional(),
  enriched: z.boolean().default(false),
  enrichedAt: z.string().datetime().optional(),
  externalRiskScore: z.number().int().min(0).max(100).optional(),
  enrichmentQuality: z.number().int().min(0).max(100).optional(),
  archived: z.boolean().default(false),
  campaignIds: z.array(z.string()).optional(),
  actorIds: z.array(z.string()).optional(),
});
export type IocDocument = z.infer<typeof IocDocumentSchema>;

const Base = { iocId: z.string().min(1), tenantId: z.string().min(1) };
export const IocIndexJobSchema = z.discriminatedUnion('action', [
  z.object({ ...Base, action: z.literal('index'), payload: IocDocumentSchema }),
  z.object({
    ...Base,
    action: z.literal('update'),
    iocType: z.string().min(1),
    payload: IocDocumentSchema.partial(),
  }),
  z.object({ ...Base, action: z.literal('delete'), iocType: z.string().optional() }),
]);
export type IocIndexJob = z.infer<typeof IocIndexJobSchema>;

export const IOC_INDEX_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
} as const;

/** Structural subset of the Prisma `Ioc` model — callers may pass a Prisma row directly. */
export interface IocRow {
  id: string;
  tenantId: string;
  feedSourceId: string | null;
  iocType: string;
  value: string;
  normalizedValue: string;
  severity: string;
  tlp: string;
  confidence: number;
  lifecycle: string;
  tags: string[];
  mitreAttack: string[];
  malwareFamilies: string[];
  threatActors: string[];
  enrichmentData: unknown;
  enrichedAt: Date | null;
  firstSeen: Date;
  lastSeen: Date;
  archivedAt: Date | null;
  updatedAt: Date;
}

/** Reads a 0-100 score out of an enrichmentData blob, rounded and clamped; undefined if absent/invalid. */
function readEnrichmentScore(enrichmentData: unknown, field: string): number | undefined {
  if (typeof enrichmentData !== 'object' || enrichmentData === null) return undefined;
  const raw = (enrichmentData as Record<string, unknown>)[field];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/** Builds an ES-ready IOC document from a Prisma row; throws ZodError if the row is invalid. */
export function toIocDocument(ioc: IocRow): IocDocument {
  const externalRiskScore = readEnrichmentScore(ioc.enrichmentData, 'externalRiskScore');
  const enrichmentQuality = readEnrichmentScore(ioc.enrichmentData, 'enrichmentQuality');

  return IocDocumentSchema.parse({
    iocId: ioc.id,
    tenantId: ioc.tenantId,
    value: ioc.value,
    normalizedValue: ioc.normalizedValue,
    type: ioc.iocType,
    severity: ioc.severity,
    confidence: ioc.confidence,
    lifecycle: ioc.lifecycle,
    tlp: ioc.tlp.toUpperCase(),
    tags: ioc.tags,
    mitreAttack: ioc.mitreAttack,
    malwareFamilies: ioc.malwareFamilies,
    threatActors: ioc.threatActors,
    firstSeen: ioc.firstSeen.toISOString(),
    lastSeen: ioc.lastSeen.toISOString(),
    updatedAt: ioc.updatedAt.toISOString(),
    ...(ioc.feedSourceId != null && { sourceId: ioc.feedSourceId }),
    enriched: ioc.enrichedAt != null,
    ...(ioc.enrichedAt != null && { enrichedAt: ioc.enrichedAt.toISOString() }),
    ...(externalRiskScore !== undefined && { externalRiskScore }),
    ...(enrichmentQuality !== undefined && { enrichmentQuality }),
    archived: ioc.archivedAt != null,
  });
}

function versionMs(version: Date | string | undefined): number {
  const ms = version instanceof Date ? version.getTime() : new Date(version ?? NaN).getTime();
  if (!Number.isFinite(ms)) {
    throw new Error('iocIndexJobId: a valid version (Date or ISO string) is required for this action');
  }
  return ms;
}

/** Deterministic BullMQ job id. No ':' may appear in the result (RCA #42). */
export function iocIndexJobId(
  action: 'index' | 'update' | 'delete',
  iocId: string,
  version?: Date | string
): string {
  if (action === 'delete') return `ioc-delete-${iocId}`;
  return `ioc-${action}-${iocId}-${versionMs(version)}`;
}
