import { z } from 'zod';

// ─── Module Toggles ──────────────────────────────────────────────

export const PLATFORM_MODULES = [
  'ingestion', 'normalization', 'enrichment',
  'ioc_intel', 'threat_actor', 'malware', 'vulnerability',
  'drp', 'graph', 'correlation', 'hunting',
  'integration', 'user_management',
] as const;

export type PlatformModule = (typeof PLATFORM_MODULES)[number];

/** Modules that must be enabled for a given module to work. */
export const MODULE_DEPENDENCIES: Record<string, readonly string[]> = {
  normalization: ['ingestion'],
  enrichment: ['normalization'],
  ioc_intel: ['normalization'],
  threat_actor: ['ioc_intel'],
  malware: ['ioc_intel'],
  vulnerability: ['ioc_intel'],
  drp: ['normalization'],
  graph: ['normalization'],
  correlation: ['normalization', 'graph'],
  hunting: ['correlation'],
  integration: [],
  user_management: [],
  ingestion: [],
};

export const SetToggleSchema = z.object({
  enabled: z.boolean(),
  featureFlags: z.record(z.string(), z.boolean()).optional(),
});
export type SetToggleInput = z.infer<typeof SetToggleSchema>;

export const BulkToggleSchema = z.object({
  modules: z.array(z.object({
    name: z.enum(PLATFORM_MODULES),
    enabled: z.boolean(),
  })).min(1).max(PLATFORM_MODULES.length),
});
export type BulkToggleInput = z.infer<typeof BulkToggleSchema>;

export const ModuleParamSchema = z.object({
  module: z.enum(PLATFORM_MODULES),
});

// ─── AI Models ───────────────────────────────────────────────────

export const AI_TASKS = ['triage', 'extraction', 'analysis', 'correlation', 'hunting'] as const;
export type AiTask = (typeof AI_TASKS)[number];

export const AI_MODELS = ['haiku', 'sonnet', 'opus'] as const;
export type AiModel = (typeof AI_MODELS)[number];

export const DEFAULT_TASK_MODELS: Record<string, string> = {
  triage: 'haiku',
  extraction: 'sonnet',
  analysis: 'opus',
  correlation: 'sonnet',
  hunting: 'sonnet',
};

export const SetTaskModelSchema = z.object({
  model: z.enum(AI_MODELS),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.coerce.number().int().min(100).max(200000).optional(),
});
export type SetTaskModelInput = z.infer<typeof SetTaskModelSchema>;

export const TaskParamSchema = z.object({
  task: z.enum(AI_TASKS),
});

export const SetBudgetSchema = z.object({
  dailyTokenLimit: z.coerce.number().int().min(0).max(100_000_000),
  monthlyTokenLimit: z.coerce.number().int().min(0).max(1_000_000_000),
  alertThreshold: z.number().min(0).max(1).default(0.8),
});
export type SetBudgetInput = z.infer<typeof SetBudgetSchema>;

export const UsageQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month']).default('day'),
});

// ─── Risk Weights ────────────────────────────────────────────────

export const IOC_TYPES = [
  'ip', 'domain', 'url', 'hash_md5', 'hash_sha1', 'hash_sha256',
  'email', 'cve', 'cidr', 'asn', 'ja3', 'mutex', 'registry_key',
] as const;
export type IocType = (typeof IOC_TYPES)[number];

export const WEIGHT_FACTORS = [
  'source_reliability', 'freshness', 'corroboration',
  'specificity', 'context',
] as const;
export type WeightFactor = (typeof WEIGHT_FACTORS)[number];

export const WEIGHT_PRESETS = ['conservative', 'balanced', 'aggressive'] as const;
export type WeightPreset = (typeof WEIGHT_PRESETS)[number];

export const WeightsSchema = z.record(
  z.enum(WEIGHT_FACTORS),
  z.number().min(0).max(1),
).refine(
  (w) => {
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    return Math.abs(sum - 1.0) < 0.001;
  },
  { message: 'Weights must sum to 1.0' },
);

export const SetWeightSchema = z.object({
  weights: WeightsSchema,
  decayRate: z.number().min(0).max(1).optional(),
});
export type SetWeightInput = z.infer<typeof SetWeightSchema>;

export const IocTypeParamSchema = z.object({
  type: z.enum(IOC_TYPES),
});

export const ApplyPresetSchema = z.object({
  preset: z.enum(WEIGHT_PRESETS),
});

// ─── Dashboard ───────────────────────────────────────────────────

export const WIDGET_TYPES = [
  'ioc_summary', 'threat_feed', 'recent_alerts', 'risk_score',
  'actor_timeline', 'malware_trends', 'vuln_overview', 'geo_map',
  'enrichment_stats', 'cost_tracker', 'hunting_results', 'correlation_graph',
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const DENSITY_OPTIONS = ['compact', 'comfortable'] as const;

export const LANDING_PAGES = [
  'dashboard', 'ioc', 'feeds', 'actors', 'malware',
  'vulnerabilities', 'hunting', 'graph', 'alerts',
] as const;

export const WidgetSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(WIDGET_TYPES),
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(8),
  visible: z.boolean().default(true),
});
export type WidgetInput = z.infer<typeof WidgetSchema>;

export const SetLayoutSchema = z.object({
  widgets: z.array(WidgetSchema).min(1).max(24),
});
export type SetLayoutInput = z.infer<typeof SetLayoutSchema>;

export const TIME_RANGES = ['1h', '6h', '24h', '7d', '30d', '90d'] as const;
export const SEVERITY_LEVELS = ['info', 'low', 'medium', 'high', 'critical'] as const;

export const SaveFilterSchema = z.object({
  name: z.string().min(1).max(64),
  timeRange: z.enum(TIME_RANGES).optional(),
  severities: z.array(z.enum(SEVERITY_LEVELS)).optional(),
  iocTypes: z.array(z.enum(IOC_TYPES)).optional(),
  modules: z.array(z.enum(PLATFORM_MODULES)).optional(),
  isDefault: z.boolean().default(false),
});
export type SaveFilterInput = z.infer<typeof SaveFilterSchema>;

export const SetPreferencesSchema = z.object({
  density: z.enum(DENSITY_OPTIONS).optional(),
  landingPage: z.enum(LANDING_PAGES).optional(),
  autoRefreshSeconds: z.coerce.number().int().min(0).max(300).optional(),
});
export type SetPreferencesInput = z.infer<typeof SetPreferencesSchema>;

// ─── Notifications ───────────────────────────────────────────────

export const NOTIFICATION_CHANNELS = ['email', 'webhook', 'in_app'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const DIGEST_FREQUENCIES = ['realtime', 'hourly', 'daily'] as const;

export const ChannelParamSchema = z.object({
  channel: z.enum(NOTIFICATION_CHANNELS),
});

export const SetChannelSchema = z.object({
  enabled: z.boolean(),
  threshold: z.enum(SEVERITY_LEVELS).default('medium'),
  config: z.record(z.string(), z.string()).optional(),
});
export type SetChannelInput = z.infer<typeof SetChannelSchema>;

export const DAYS_OF_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const TimeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const SetQuietHoursSchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(TimeRegex, 'Must be HH:MM format'),
  end: z.string().regex(TimeRegex, 'Must be HH:MM format'),
  timezone: z.string().min(1).max(64).default('UTC'),
  daysOfWeek: z.array(z.enum(DAYS_OF_WEEK)).min(1).max(7),
});
export type SetQuietHoursInput = z.infer<typeof SetQuietHoursSchema>;

export const SetDigestSchema = z.object({
  frequency: z.enum(DIGEST_FREQUENCIES),
  modules: z.array(z.enum(PLATFORM_MODULES)).optional(),
});
export type SetDigestInput = z.infer<typeof SetDigestSchema>;

export const SetNotificationPrefsSchema = z.object({
  channels: z.record(z.enum(NOTIFICATION_CHANNELS), SetChannelSchema).optional(),
  quietHours: SetQuietHoursSchema.optional(),
  digest: SetDigestSchema.optional(),
  moduleToggles: z.record(z.enum(PLATFORM_MODULES), z.boolean()).optional(),
});
export type SetNotificationPrefsInput = z.infer<typeof SetNotificationPrefsSchema>;

// ─── Cross-cutting ───────────────────────────────────────────────

export const CONFIG_SECTIONS = [
  'modules', 'ai', 'risk', 'dashboard', 'notifications',
] as const;
export type ConfigSection = (typeof CONFIG_SECTIONS)[number];

export const ExportSchema = z.object({
  sections: z.array(z.enum(CONFIG_SECTIONS)).optional(),
});

export const ImportSchema = z.object({
  config: z.record(z.string(), z.unknown()),
  merge: z.boolean().default(false),
});

export const AuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  section: z.enum(CONFIG_SECTIONS).optional(),
  userId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const VersionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  section: z.enum(CONFIG_SECTIONS).optional(),
});

export const RollbackSchema = z.object({
  versionId: z.string().min(1),
  section: z.enum(CONFIG_SECTIONS),
});
