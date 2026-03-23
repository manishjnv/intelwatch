import { z } from 'zod';

// ── Correlation Types ──────────────────────────────────────────────

export const CORRELATION_TYPES = [
  'cooccurrence', 'infrastructure_overlap', 'temporal_wave',
  'ttp_similarity', 'campaign_cluster', 'cross_entity_inference',
] as const;
export const CorrelationTypeSchema = z.enum(CORRELATION_TYPES);
export type CorrelationType = z.infer<typeof CorrelationTypeSchema>;

export const SEVERITY_LEVELS = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const SeveritySchema = z.enum(SEVERITY_LEVELS);
export type Severity = z.infer<typeof SeveritySchema>;

export const ENTITY_TYPES = ['ioc', 'threat_actor', 'malware', 'vulnerability'] as const;
export const EntityTypeSchema = z.enum(ENTITY_TYPES);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const DIAMOND_FACETS = ['adversary', 'capability', 'infrastructure', 'victim'] as const;
export type DiamondFacet = (typeof DIAMOND_FACETS)[number];

export const KILL_CHAIN_PHASES = [
  'reconnaissance', 'weaponization', 'delivery', 'exploitation',
  'installation', 'command_and_control', 'actions_on_objectives',
] as const;
export type KillChainPhase = (typeof KILL_CHAIN_PHASES)[number];

// ── In-Memory Entity ───────────────────────────────────────────────

export interface CorrelatedIOC {
  id: string;
  tenantId: string;
  iocType: string;
  value: string;
  normalizedValue: string;
  confidence: number;
  severity: string;
  tags: string[];
  mitreAttack: string[];
  malwareFamilies: string[];
  threatActors: string[];
  sourceFeedIds: string[];
  firstSeen: string;
  lastSeen: string;
  asn?: string;
  cidrPrefix?: string;
  registrar?: string;
  enrichmentQuality: number;
}

// ── Correlation Result ─────────────────────────────────────────────

export interface CorrelatedEntity {
  entityId: string;
  entityType: EntityType;
  label: string;
  role: 'primary' | 'related';
  confidence: number;
}

export interface CorrelationResult {
  id: string;
  tenantId: string;
  correlationType: CorrelationType;
  severity: Severity;
  confidence: number;
  entities: CorrelatedEntity[];
  metadata: Record<string, unknown>;
  diamondFacets?: DiamondMapping[];
  killChainPhases?: KillChainPhase[];
  campaignId?: string;
  suppressed: boolean;
  ruleId: string;
  createdAt: string;
}

// ── Campaign Cluster (#5) ──────────────────────────────────────────

export interface FeatureVector {
  infraOverlap: number;
  temporalProximity: number;
  ttpSimilarity: number;
  feedOverlap: number;
}

export interface CampaignCluster {
  id: string;
  tenantId: string;
  name: string;
  entityIds: string[];
  featureVector: FeatureVector;
  avgConfidence: number;
  maxSeverity: Severity;
  detectedAt: string;
}

// ── Diamond Model (#7) ────────────────────────────────────────────

export interface DiamondMapping {
  facet: DiamondFacet;
  entityId: string;
  entityType: EntityType;
  label: string;
  confidence: number;
}

// ── Kill Chain (#8) ───────────────────────────────────────────────

export interface KillChainCoverage {
  tenantId: string;
  phases: Record<string, { count: number; entityIds: string[]; techniques: string[] }>;
  multiPhaseCampaigns: number;
}

// ── FP Feedback (#9) ──────────────────────────────────────────────

export interface FPFeedback {
  id: string;
  tenantId: string;
  correlationId: string;
  verdict: 'true_positive' | 'false_positive';
  analystId: string;
  reason?: string;
  submittedAt: string;
}

export interface RuleStats {
  ruleId: string;
  totalResults: number;
  fpCount: number;
  tpCount: number;
  fpRate: number;
  suppressed: boolean;
}

// ── Relationship Inference (#10) ──────────────────────────────────

export interface InferredRelationship {
  fromEntityId: string;
  toEntityId: string;
  confidence: number;
  path: string[];
  depth: number;
}

// ── Temporal Wave (#3) ────────────────────────────────────────────

export interface TemporalWave {
  id: string;
  tenantId: string;
  startTime: string;
  endTime: string;
  peakTime: string;
  zScore: number;
  iocCount: number;
  iocIds: string[];
  detectedAt: string;
}

// ── Correlation Store (in-memory) ─────────────────────────────────

export class CorrelationStore {
  readonly iocs = new Map<string, Map<string, CorrelatedIOC>>();
  readonly results = new Map<string, Map<string, CorrelationResult>>();
  readonly campaigns = new Map<string, Map<string, CampaignCluster>>();
  readonly waves = new Map<string, TemporalWave[]>();
  readonly feedback = new Map<string, FPFeedback[]>();
  readonly ruleStats = new Map<string, Map<string, RuleStats>>();

  getTenantIOCs(tenantId: string): Map<string, CorrelatedIOC> {
    if (!this.iocs.has(tenantId)) this.iocs.set(tenantId, new Map());
    return this.iocs.get(tenantId)!;
  }

  getTenantResults(tenantId: string): Map<string, CorrelationResult> {
    if (!this.results.has(tenantId)) this.results.set(tenantId, new Map());
    return this.results.get(tenantId)!;
  }

  getTenantCampaigns(tenantId: string): Map<string, CampaignCluster> {
    if (!this.campaigns.has(tenantId)) this.campaigns.set(tenantId, new Map());
    return this.campaigns.get(tenantId)!;
  }

  getTenantWaves(tenantId: string): TemporalWave[] {
    if (!this.waves.has(tenantId)) this.waves.set(tenantId, []);
    return this.waves.get(tenantId)!;
  }

  getTenantFeedback(tenantId: string): FPFeedback[] {
    if (!this.feedback.has(tenantId)) this.feedback.set(tenantId, []);
    return this.feedback.get(tenantId)!;
  }

  getTenantRuleStats(tenantId: string): Map<string, RuleStats> {
    if (!this.ruleStats.has(tenantId)) this.ruleStats.set(tenantId, new Map());
    return this.ruleStats.get(tenantId)!;
  }
}

// ── Route Query Schemas ───────────────────────────────────────────

export const ListCorrelationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  type: CorrelationTypeSchema.optional(),
  severity: SeveritySchema.optional(),
  suppressed: z.enum(['true', 'false']).optional(),
});

export const FeedbackInputSchema = z.object({
  verdict: z.enum(['true_positive', 'false_positive']),
  reason: z.string().max(500).optional(),
});
export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;

export const CampaignListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── Response Types ────────────────────────────────────────────────

export interface CorrelationListResponse {
  data: CorrelationResult[];
  total: number;
  page: number;
  limit: number;
}

export interface CorrelationStatsResponse {
  total: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  suppressedCount: number;
  campaignCount: number;
  waveCount: number;
}

export interface CampaignListResponse {
  data: CampaignCluster[];
  total: number;
  page: number;
  limit: number;
}
