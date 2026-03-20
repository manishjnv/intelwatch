import { z } from 'zod';

/** IOC types matching the Prisma IocType enum */
export const IOC_TYPES = [
  'ip', 'ipv6', 'domain', 'fqdn', 'url', 'email',
  'hash_md5', 'hash_sha1', 'hash_sha256', 'hash_sha512',
  'cve', 'asn', 'cidr', 'bitcoin_address', 'unknown',
] as const;
export type IOCTypeEnum = typeof IOC_TYPES[number];

export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
export const TLP_LEVELS = ['white', 'green', 'amber', 'red'] as const;
export const LIFECYCLES = ['new', 'active', 'aging', 'expired', 'archived', 'false_positive', 'revoked', 'reactivated'] as const;

/** Inbound job data from ingestion — one IOC to normalize */
export const NormalizeIOCJobSchema = z.object({
  articleId: z.string().uuid(),
  feedSourceId: z.string().uuid(),
  tenantId: z.string().uuid(),
  feedName: z.string(),
  /** Raw IOC value as extracted from article content */
  rawValue: z.string().min(1),
  /** IOC type from ingestion's regex detection (may need remapping) */
  rawType: z.string(),
  /** Surrounding context sentence from context-extractor */
  context: z.string().optional(),
  /** Confidence from ingestion's calibrator (0-100) */
  calibratedConfidence: z.coerce.number().min(0).max(100).optional(),
  /** Corroboration count from ingestion */
  corroborationCount: z.coerce.number().int().min(0).optional(),
  /** Extraction-level metadata (threat actors, malware families, etc.) */
  extractionMeta: z.object({
    threatActors: z.array(z.string()).optional(),
    malwareFamilies: z.array(z.string()).optional(),
    mitreAttack: z.array(z.string()).optional(),
    tlp: z.string().optional(),
    severity: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
});
export type NormalizeIOCJob = z.infer<typeof NormalizeIOCJobSchema>;

/** Batch job: multiple IOCs from a single article */
export const NormalizeBatchJobSchema = z.object({
  articleId: z.string().uuid(),
  feedSourceId: z.string().uuid(),
  tenantId: z.string().uuid(),
  feedName: z.string(),
  iocs: z.array(NormalizeIOCJobSchema.omit({ articleId: true, feedSourceId: true, tenantId: true, feedName: true })),
});
export type NormalizeBatchJob = z.infer<typeof NormalizeBatchJobSchema>;

/** Query params for GET /api/v1/iocs */
export const ListIOCsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  type: z.enum(IOC_TYPES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  lifecycle: z.enum(LIFECYCLES).optional(),
  tlp: z.enum(TLP_LEVELS).optional(),
  search: z.string().max(500).optional(),
  feedSourceId: z.string().uuid().optional(),
  minConfidence: z.coerce.number().min(0).max(100).optional(),
  sortBy: z.enum(['lastSeen', 'firstSeen', 'confidence', 'createdAt']).default('lastSeen'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type ListIOCsQuery = z.infer<typeof ListIOCsQuerySchema>;

export const IOCIdParamsSchema = z.object({
  id: z.string().uuid(),
});
