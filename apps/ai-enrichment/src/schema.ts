import { z } from 'zod';

/** Inbound job data from normalization — one IOC to enrich */
export const EnrichJobSchema = z.object({
  iocId: z.string().uuid(),
  tenantId: z.string().uuid(),
  iocType: z.string(),
  normalizedValue: z.string().min(1),
  confidence: z.number().min(0).max(100),
  severity: z.string(),
  /** Existing enrichment data to merge with */
  existingEnrichment: z.record(z.unknown()).optional(),
});
export type EnrichJob = z.infer<typeof EnrichJobSchema>;

/** VirusTotal API response (simplified) */
export const VTResultSchema = z.object({
  malicious: z.number().int().min(0),
  suspicious: z.number().int().min(0),
  harmless: z.number().int().min(0),
  undetected: z.number().int().min(0),
  totalEngines: z.number().int().min(0),
  detectionRate: z.number().min(0).max(100),
  tags: z.array(z.string()).default([]),
  lastAnalysisDate: z.string().nullable().default(null),
});
export type VTResult = z.infer<typeof VTResultSchema>;

/** AbuseIPDB API response (simplified) */
export const AbuseIPDBResultSchema = z.object({
  abuseConfidenceScore: z.number().int().min(0).max(100),
  totalReports: z.number().int().min(0),
  numDistinctUsers: z.number().int().min(0),
  lastReportedAt: z.string().nullable().default(null),
  isp: z.string().default(''),
  countryCode: z.string().default(''),
  usageType: z.string().default(''),
  isWhitelisted: z.boolean().default(false),
  isTor: z.boolean().default(false),
});
export type AbuseIPDBResult = z.infer<typeof AbuseIPDBResultSchema>;

/** Haiku AI triage result for IOC classification */
export const HaikuTriageResultSchema = z.object({
  riskScore: z.number().int().min(0).max(100),
  confidence: z.number().int().min(0).max(100),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
  threatCategory: z.string().max(50),
  reasoning: z.string().max(500),
  tags: z.array(z.string().max(50)).default([]),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  costUsd: z.number().min(0),
  durationMs: z.number().int().min(0),
});
export type HaikuTriageResult = z.infer<typeof HaikuTriageResultSchema>;

/** Per-provider cost record */
export const ProviderCostRecordSchema = z.object({
  provider: z.enum(['virustotal', 'abuseipdb', 'haiku_triage']),
  model: z.enum(['haiku', 'sonnet', 'opus']).nullable(),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  costUsd: z.number().min(0),
  durationMs: z.number().int().min(0),
  timestamp: z.string(),
});

/** Cost breakdown for an IOC */
export const CostBreakdownSchema = z.object({
  iocId: z.string().uuid(),
  providers: z.array(ProviderCostRecordSchema),
  totalTokens: z.number().int().min(0),
  totalCostUsd: z.number().min(0),
  providerCount: z.number().int().min(0),
});

/** Combined enrichment result stored on IOC */
export const EnrichmentResultSchema = z.object({
  vtResult: VTResultSchema.nullable().default(null),
  abuseipdbResult: AbuseIPDBResultSchema.nullable().default(null),
  haikuResult: HaikuTriageResultSchema.nullable().default(null),
  enrichedAt: z.string(),
  enrichmentStatus: z.enum(['enriched', 'partial', 'pending', 'failed', 'skipped']),
  failureReason: z.string().nullable().default(null),
  /** Composite risk score from all sources (0-100) */
  externalRiskScore: z.number().min(0).max(100).nullable().default(null),
  costBreakdown: CostBreakdownSchema.nullable().default(null),
});
export type EnrichmentResult = z.infer<typeof EnrichmentResultSchema>;

/** Query params for GET /api/v1/enrichment/status */
export const EnrichmentStatusQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['enriched', 'partial', 'pending', 'failed', 'skipped']).optional(),
});
export type EnrichmentStatusQuery = z.infer<typeof EnrichmentStatusQuerySchema>;

/** Params for POST /api/v1/enrichment/trigger */
export const TriggerEnrichmentSchema = z.object({
  iocId: z.string().uuid(),
});

/** Params for GET /api/v1/enrichment/cost/ioc/:iocId */
export const CostIOCParamsSchema = z.object({
  iocId: z.string().uuid(),
});
