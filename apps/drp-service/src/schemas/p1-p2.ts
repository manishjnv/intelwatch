import { z } from 'zod';
import {
  TyposquatMethodSchema,
  TYPOSQUAT_METHODS,
  DRPAlertTypeSchema,
  DRPAlertStatusSchema,
  DRPSeveritySchema,
  type TyposquatCandidate,
} from './drp.js';

// ─── #6 Batch Typosquat ─────────────────────────────────

export const BatchTyposquatSchema = z.object({
  domains: z.array(z.string().min(1).max(253)).min(1).max(50),
  methods: z.array(TyposquatMethodSchema).default([...TYPOSQUAT_METHODS]),
  maxCandidatesPerDomain: z.coerce.number().int().min(1).max(200).default(50),
  dedup: z.boolean().default(true),
});

export interface BatchTyposquatResult {
  domain: string;
  candidatesFound: number;
  registeredCount: number;
  alertsCreated: number;
  topCandidates: TyposquatCandidate[];
}

export interface BatchTyposquatReport {
  scanId: string;
  domains: string[];
  totalCandidates: number;
  totalRegistered: number;
  totalAlerts: number;
  crossDomainDuplicates: number;
  results: BatchTyposquatResult[];
  durationMs: number;
}

// ─── #7 AI Alert Enrichment ──────────────────────────────

export const AIEnrichAlertSchema = z.object({
  forceRefresh: z.boolean().default(false),
});

export interface AIEnrichmentResult {
  alertId: string;
  hostingProvider: string | null;
  registrar: string | null;
  takedownContacts: TakedownContact[];
  recommendedActions: string[];
  riskAssessment: string;
  enrichedAt: string;
  model: string;
  cached: boolean;
}

export interface TakedownContact {
  type: 'registrar' | 'hosting' | 'social_platform' | 'app_store' | 'cert_authority';
  name: string;
  email: string | null;
  url: string | null;
  priority: number;
}

// ─── #8 Bulk Alert Triage ────────────────────────────────

export const BulkTriageSchema = z.object({
  alertIds: z.array(z.string()).min(1).max(200).optional(),
  filter: z.object({
    type: DRPAlertTypeSchema.optional(),
    status: DRPAlertStatusSchema.optional(),
    severity: DRPSeveritySchema.optional(),
    assetId: z.string().optional(),
    minConfidence: z.coerce.number().min(0).max(1).optional(),
    maxConfidence: z.coerce.number().min(0).max(1).optional(),
  }).optional(),
  action: z.object({
    status: DRPAlertStatusSchema.optional(),
    severity: DRPSeveritySchema.optional(),
    assignTo: z.string().optional(),
    addTags: z.array(z.string().max(50)).max(20).optional(),
    notes: z.string().max(2000).optional(),
  }),
});

export interface BulkTriageResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ alertId: string; error: string }>;
}

// ─── #9 Trending Risk Analysis ───────────────────────────

export const TrendingQuerySchema = z.object({
  period: z.enum(['24h', '7d', '30d', '90d']).default('7d'),
  granularity: z.enum(['hour', 'day', 'week']).default('day'),
  alertType: DRPAlertTypeSchema.optional(),
  assetId: z.string().optional(),
});

export interface TrendingDataPoint {
  timestamp: string;
  count: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
}

export interface TrendingAnalysis {
  period: string;
  granularity: string;
  dataPoints: TrendingDataPoint[];
  rollingAverage: number;
  zScore: number;
  isAnomaly: boolean;
  trend: 'increasing' | 'decreasing' | 'stable';
  totalAlerts: number;
  peakTimestamp: string | null;
}

// ─── #10 Social Media Impersonation ──────────────────────

export const SocialScanSchema = z.object({
  brandName: z.string().min(1).max(200),
  handles: z.array(z.string().min(1).max(100)).max(20).default([]),
  platforms: z.array(z.enum([
    'twitter', 'linkedin', 'facebook', 'instagram', 'github', 'telegram',
  ])).default(['twitter', 'linkedin', 'facebook', 'instagram']),
});

export interface SocialProfile {
  id: string;
  platform: string;
  handle: string;
  displayName: string;
  bio: string;
  followersCount: number;
  createdAt: string;
  profileUrl: string;
  avatarSimilarity: number;
  nameSimilarity: number;
  handleSimilarity: number;
  riskScore: number;
  isVerified: boolean;
  isSuspicious: boolean;
}

// ─── #11 Takedown Request Generation ─────────────────────

export const TakedownRequestSchema = z.object({
  platform: z.enum(['registrar', 'hosting', 'social', 'app_store']),
  contactOverride: z.object({
    email: z.string().email().optional(),
    name: z.string().max(200).optional(),
  }).optional(),
  includeEvidence: z.boolean().default(true),
  language: z.enum(['en', 'es', 'fr', 'de']).default('en'),
});

export interface TakedownRequest {
  id: string;
  alertId: string;
  tenantId: string;
  platform: string;
  status: 'draft' | 'sent' | 'acknowledged' | 'completed' | 'rejected';
  subject: string;
  body: string;
  contactName: string;
  contactEmail: string;
  evidence: Array<{ type: string; description: string }>;
  createdAt: string;
  updatedAt: string;
}

// ─── #12 Alert Export ────────────────────────────────────

export const AlertExportSchema = z.object({
  format: z.enum(['csv', 'json', 'stix']),
  filter: z.object({
    type: DRPAlertTypeSchema.optional(),
    status: DRPAlertStatusSchema.optional(),
    severity: DRPSeveritySchema.optional(),
    assetId: z.string().optional(),
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
  }).optional(),
  maxRecords: z.coerce.number().int().min(1).max(10000).default(1000),
});

export type ExportFormat = 'csv' | 'json' | 'stix';

// ─── #13 Rogue Mobile App Detection ─────────────────────

export const RogueAppScanSchema = z.object({
  appName: z.string().min(1).max(200),
  packageName: z.string().max(300).optional(),
  stores: z.array(z.enum(['google_play', 'apple_app_store', 'third_party'])).default(['google_play', 'apple_app_store', 'third_party']),
});

export interface RogueApp {
  id: string;
  storeName: string;
  appName: string;
  packageName: string;
  developer: string;
  nameSimilarity: number;
  iconSimilarity: number;
  downloadCount: number;
  rating: number;
  lastUpdated: string;
  storeUrl: string;
  riskScore: number;
  isOfficial: boolean;
  isSuspicious: boolean;
}

// ─── #14 Per-Asset Risk Aggregation ──────────────────────

export interface AssetRiskScore {
  assetId: string;
  assetValue: string;
  assetType: string;
  compositeScore: number;
  componentScores: {
    typosquatting: number;
    credentialLeak: number;
    darkWeb: number;
    socialImpersonation: number;
    rogueApp: number;
    exposedService: number;
  };
  openAlertCount: number;
  criticalAlertCount: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  lastCalculated: string;
}

// ─── #15 Cross-Alert Correlation ─────────────────────────

export interface CorrelationCluster {
  id: string;
  tenantId: string;
  alertIds: string[];
  sharedInfrastructure: SharedInfra[];
  correlationType: 'shared_hosting' | 'shared_registrar' | 'shared_asn' | 'temporal_cluster' | 'multi_vector';
  confidence: number;
  description: string;
  createdAt: string;
}

export interface SharedInfra {
  type: 'ip' | 'hosting_provider' | 'registrar' | 'asn' | 'nameserver';
  value: string;
  alertIds: string[];
}

export const CorrelateAlertsSchema = z.object({
  alertIds: z.array(z.string()).min(2).max(500).optional(),
  autoDetect: z.boolean().default(true),
  minClusterSize: z.coerce.number().int().min(2).max(50).default(2),
  pushToGraph: z.boolean().default(false),
});
