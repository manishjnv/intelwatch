import { z } from 'zod';

// ─── Wizard Steps ────────────────────────────────────────
export const WIZARD_STEPS = [
  'welcome',
  'org_profile',
  'team_invite',
  'feed_activation',
  'integration_setup',
  'dashboard_config',
  'readiness_check',
  'launch',
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export const STEP_STATUS = ['pending', 'in_progress', 'completed', 'skipped'] as const;
export type StepStatus = (typeof STEP_STATUS)[number];

// ─── Data Source Types ───────────────────────────────────
export const DATA_SOURCE_TYPES = [
  'rss_feed',
  'stix_taxii',
  'rest_api',
  'csv_upload',
  'siem_splunk',
  'siem_sentinel',
  'siem_elastic',
  'webhook',
] as const;

export type DataSourceType = (typeof DATA_SOURCE_TYPES)[number];

// ─── Module Names ────────────────────────────────────────
export const PLATFORM_MODULES = [
  'ingestion',
  'normalization',
  'ai-enrichment',
  'ioc-intelligence',
  'threat-actor-intel',
  'malware-intel',
  'vulnerability-intel',
  'digital-risk-protection',
  'threat-graph',
  'correlation-engine',
  'threat-hunting',
  'enterprise-integration',
  'user-management',
  'customization',
] as const;

export type PlatformModule = (typeof PLATFORM_MODULES)[number];

/** Module dependencies: key depends on values */
export const MODULE_DEPENDENCIES: Record<string, readonly string[]> = {
  'normalization': ['ingestion'],
  'ai-enrichment': ['normalization'],
  'ioc-intelligence': ['normalization'],
  'threat-actor-intel': ['ioc-intelligence'],
  'malware-intel': ['ioc-intelligence'],
  'vulnerability-intel': ['ioc-intelligence'],
  'digital-risk-protection': ['ioc-intelligence'],
  'threat-graph': ['ioc-intelligence'],
  'correlation-engine': ['ioc-intelligence'],
  'threat-hunting': ['ioc-intelligence'],
  'enterprise-integration': [],
  'user-management': [],
  'customization': [],
  'ingestion': [],
} as const;

// ─── Request Schemas ─────────────────────────────────────

/** Welcome step: org profile survey */
export const OrgProfileSchema = z.object({
  orgName: z.string().min(1).max(200),
  industry: z.string().min(1).max(100),
  teamSize: z.enum(['1-5', '6-20', '21-50', '51-200', '200+']),
  primaryUseCase: z.enum([
    'soc_operations',
    'threat_intelligence',
    'vulnerability_management',
    'incident_response',
    'compliance',
    'executive_reporting',
  ]),
  timezone: z.string().default('UTC'),
});
export type OrgProfileInput = z.infer<typeof OrgProfileSchema>;

/** Team invite request */
export const TeamInviteSchema = z.object({
  invites: z.array(z.object({
    email: z.string().email(),
    role: z.enum(['admin', 'analyst', 'viewer']).default('analyst'),
    name: z.string().max(200).optional(),
  })).min(1).max(20),
});
export type TeamInviteInput = z.infer<typeof TeamInviteSchema>;

/** Data source connector validation */
export const DataSourceSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(DATA_SOURCE_TYPES),
  url: z.string().url().optional(),
  apiKey: z.string().max(1000).optional(),
  config: z.record(z.unknown()).optional(),
});
export type DataSourceInput = z.infer<typeof DataSourceSchema>;

/** Step completion marker */
export const CompleteStepSchema = z.object({
  step: z.enum(WIZARD_STEPS),
  data: z.record(z.unknown()).optional(),
});
export type CompleteStepInput = z.infer<typeof CompleteStepSchema>;

/** Skip step */
export const SkipStepSchema = z.object({
  step: z.enum(WIZARD_STEPS),
  reason: z.string().max(500).optional(),
});
export type SkipStepInput = z.infer<typeof SkipStepSchema>;

/** Dashboard widget preference */
export const DashboardPreferenceSchema = z.object({
  layout: z.enum(['default', 'compact', 'detailed']).default('default'),
  widgets: z.array(z.string()).optional(),
  defaultTimeRange: z.enum(['24h', '7d', '30d', '90d']).default('7d'),
});
export type DashboardPreferenceInput = z.infer<typeof DashboardPreferenceSchema>;

/** Integration test request */
export const IntegrationTestSchema = z.object({
  sourceId: z.string().uuid(),
});

/** Seed demo data request */
export const SeedDemoSchema = z.object({
  categories: z.array(z.enum(['iocs', 'actors', 'malware', 'vulnerabilities', 'alerts'])).optional(),
});
export type SeedDemoInput = z.infer<typeof SeedDemoSchema>;

// ─── Response Shapes ─────────────────────────────────────

export interface WizardState {
  id: string;
  tenantId: string;
  currentStep: WizardStep;
  steps: Record<WizardStep, StepStatus>;
  completionPercent: number;
  orgProfile: OrgProfileInput | null;
  teamInvites: TeamInviteInput['invites'];
  dataSources: DataSourceRecord[];
  dashboardPrefs: DashboardPreferenceInput | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface DataSourceRecord {
  id: string;
  tenantId: string;
  name: string;
  type: DataSourceType;
  url: string | null;
  status: 'pending' | 'testing' | 'connected' | 'failed';
  lastTestedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface ModuleReadiness {
  module: PlatformModule;
  enabled: boolean;
  healthy: boolean;
  configured: boolean;
  dependencies: string[];
  missingDeps: string[];
  status: 'ready' | 'needs_config' | 'needs_deps' | 'disabled';
}

export interface PipelineHealthResult {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  stages: PipelineStageHealth[];
  lastCheckedAt: string;
}

export interface PipelineStageHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  latencyMs: number | null;
  message: string;
}

export interface ReadinessCheckResult {
  overall: 'ready' | 'not_ready';
  checks: ReadinessCheck[];
  score: number;
  maxScore: number;
}

export interface ReadinessCheck {
  name: string;
  passed: boolean;
  description: string;
  required: boolean;
}

export interface WelcomeDashboard {
  tenantId: string;
  onboardingComplete: boolean;
  completionPercent: number;
  nextStep: WizardStep | null;
  stats: {
    feedsActive: number;
    iocsIngested: number;
    teamMembers: number;
    modulesEnabled: number;
  };
  quickActions: QuickAction[];
  tips: GuidedTip[];
}

export interface QuickAction {
  id: string;
  title: string;
  description: string;
  actionUrl: string;
  icon: string;
  completed: boolean;
}

export interface GuidedTip {
  id: string;
  title: string;
  content: string;
  category: 'getting_started' | 'best_practice' | 'feature_highlight';
  order: number;
}

export interface DemoSeedResult {
  seeded: boolean;
  counts: {
    iocs: number;
    actors: number;
    malware: number;
    vulnerabilities: number;
    feeds: number;
    alerts: number;
  };
  tag: 'DEMO';
}
