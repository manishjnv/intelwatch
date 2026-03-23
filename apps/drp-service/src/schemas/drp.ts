import { z } from 'zod';

// ─── Asset Types ──────────────────────────────────────────

export const ASSET_TYPES = ['domain', 'brand_name', 'email_domain', 'social_handle', 'mobile_app'] as const;
export const AssetTypeSchema = z.enum(ASSET_TYPES);
export type AssetType = z.infer<typeof AssetTypeSchema>;

export interface MonitoredAsset {
  id: string;
  tenantId: string;
  type: AssetType;
  value: string;
  displayName: string;
  enabled: boolean;
  scanFrequencyHours: number;
  lastScannedAt: string | null;
  alertCount: number;
  criticality: number;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Alert Types ──────────────────────────────────────────

export const DRP_ALERT_TYPES = [
  'typosquatting', 'credential_leak', 'dark_web_mention',
  'social_impersonation', 'rogue_app', 'exposed_service',
] as const;
export const DRPAlertTypeSchema = z.enum(DRP_ALERT_TYPES);
export type DRPAlertType = z.infer<typeof DRPAlertTypeSchema>;

export const DRP_ALERT_STATUSES = ['open', 'investigating', 'resolved', 'false_positive'] as const;
export const DRPAlertStatusSchema = z.enum(DRP_ALERT_STATUSES);
export type DRPAlertStatus = z.infer<typeof DRPAlertStatusSchema>;

export const DRP_SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export const DRPSeveritySchema = z.enum(DRP_SEVERITIES);
export type DRPSeverity = z.infer<typeof DRPSeveritySchema>;

export interface AlertEvidence {
  id: string;
  type: 'screenshot' | 'dns_record' | 'whois' | 'certificate' |
    'paste_content' | 'forum_post' | 'breach_record' | 'scan_result';
  title: string;
  data: Record<string, unknown>;
  collectedAt: string;
}

export interface ConfidenceReason {
  signal: string;
  weight: number;
  value: number;
  description: string;
}

export interface DRPAlert {
  id: string;
  tenantId: string;
  assetId: string;
  type: DRPAlertType;
  severity: DRPSeverity;
  status: DRPAlertStatus;
  title: string;
  description: string;
  evidence: AlertEvidence[];
  confidence: number;
  confidenceReasons: ConfidenceReason[];
  signalIds: string[];
  assignedTo: string | null;
  triageNotes: string;
  tags: string[];
  detectedValue: string;
  sourceUrl: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Detection Signal (#2) ────────────────────────────────

export interface DetectionSignal {
  id: string;
  tenantId: string;
  alertId: string;
  signalType: string;
  rawValue: number;
  considered: boolean;
  reason: string;
  detectedAt: string;
}

export interface SignalStats {
  signalType: string;
  totalFires: number;
  tpCount: number;
  fpCount: number;
  successRate: number;
  lastUpdated: string;
}

// ─── Evidence Chain (#3) ──────────────────────────────────

export interface EvidenceChain {
  alertId: string;
  tenantId: string;
  steps: EvidenceStep[];
  createdAt: string;
}

export interface EvidenceStep {
  order: number;
  type: 'detection' | 'scoring' | 'dedup' | 'classification' | 'alert_created';
  description: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// ─── Alert Feedback ───────────────────────────────────────

export interface AlertFeedback {
  id: string;
  tenantId: string;
  alertId: string;
  verdict: 'true_positive' | 'false_positive';
  reason: string;
  userId: string;
  createdAt: string;
}

// ─── Typosquatting ────────────────────────────────────────

export const TYPOSQUAT_METHODS = [
  'homoglyph', 'insertion', 'deletion', 'transposition', 'tld_variant',
] as const;
export const TyposquatMethodSchema = z.enum(TYPOSQUAT_METHODS);
export type TyposquatMethod = z.infer<typeof TyposquatMethodSchema>;

export interface TyposquatCandidate {
  domain: string;
  method: TyposquatMethod;
  editDistance: number;
  similarity: number;
  isRegistered: boolean;
  registrationDate: string | null;
  hostingProvider: string | null;
  riskScore: number;
}

// ─── Dark Web ─────────────────────────────────────────────

export const DARK_WEB_SOURCE_TYPES = ['paste_site', 'forum', 'marketplace', 'telegram', 'irc'] as const;
export const DarkWebSourceTypeSchema = z.enum(DARK_WEB_SOURCE_TYPES);
export type DarkWebSourceType = z.infer<typeof DarkWebSourceTypeSchema>;

export interface DarkWebMention {
  id: string;
  source: DarkWebSourceType;
  content: string;
  matchedKeywords: string[];
  url: string;
  severity: DRPSeverity;
  detectedAt: string;
}

// ─── Credential Leak ──────────────────────────────────────

export interface CredentialLeak {
  id: string;
  breachName: string;
  breachDate: string;
  emailDomain: string;
  exposedCount: number;
  dataTypes: string[];
  severity: DRPSeverity;
  source: string;
  detectedAt: string;
}

// ─── Attack Surface ───────────────────────────────────────

export interface ExposedService {
  id: string;
  host: string;
  port: number;
  protocol: string;
  service: string;
  version: string | null;
  isVulnerable: boolean;
  certificateExpiry: string | null;
  riskScore: number;
  detectedAt: string;
}

// ─── Scan Result ──────────────────────────────────────────

export interface ScanResult {
  id: string;
  tenantId: string;
  assetId: string;
  scanType: DRPAlertType;
  status: 'running' | 'completed' | 'failed';
  findingsCount: number;
  alertsCreated: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
}

// ─── Zod Input Schemas ────────────────────────────────────

export const CreateAssetSchema = z.object({
  type: AssetTypeSchema,
  value: z.string().min(1).max(500),
  displayName: z.string().min(1).max(200),
  criticality: z.coerce.number().min(0).max(1).default(0.5),
  scanFrequencyHours: z.coerce.number().int().min(1).max(720).default(24),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

export const UpdateAssetSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  criticality: z.coerce.number().min(0).max(1).optional(),
  scanFrequencyHours: z.coerce.number().int().min(1).max(720).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const ChangeAlertStatusSchema = z.object({
  status: DRPAlertStatusSchema,
  notes: z.string().max(2000).optional(),
});

export const AssignAlertSchema = z.object({
  userId: z.string().min(1),
});

export const TriageAlertSchema = z.object({
  severity: DRPSeveritySchema.optional(),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const TyposquatScanSchema = z.object({
  domain: z.string().min(1).max(253),
  methods: z.array(TyposquatMethodSchema).default([...TYPOSQUAT_METHODS]),
  maxCandidates: z.coerce.number().int().min(1).max(500).default(100),
});

export const DarkWebScanSchema = z.object({
  keywords: z.array(z.string().min(1).max(100)).min(1).max(20),
  sources: z.array(DarkWebSourceTypeSchema).default([...DARK_WEB_SOURCE_TYPES]),
});

export const CredentialCheckSchema = z.object({
  emailDomain: z.string().min(1).max(253),
  emails: z.array(z.string().email()).max(100).optional(),
});

export const SurfaceScanSchema = z.object({
  domain: z.string().min(1).max(253),
  portRange: z.enum(['common', 'full', 'web']).default('common'),
  checkCerts: z.boolean().default(true),
  checkDns: z.boolean().default(true),
});

export const AlertFeedbackSchema = z.object({
  verdict: z.enum(['true_positive', 'false_positive']),
  reason: z.string().max(2000).optional(),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const AlertFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  type: DRPAlertTypeSchema.optional(),
  status: DRPAlertStatusSchema.optional(),
  severity: DRPSeveritySchema.optional(),
  assetId: z.string().optional(),
});
