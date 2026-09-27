/**
 * @module hooks/phase5-demo-data
 * @description Realistic demo data for Phase 5 frontend pages:
 * Enterprise Integration, User Management, Customization.
 * Used as fallback when backend services are unreachable.
 */

// ─── Helpers ────────────────────────────────────────────────────

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3_600_000).toISOString()
}

function futureHours(n: number): string {
  return new Date(Date.now() + n * 3_600_000).toISOString()
}

// ─── Integration Types ──────────────────────────────────────────

export interface SIEMIntegration {
  id: string; name: string; type: 'splunk' | 'sentinel' | 'elastic'
  status: 'active' | 'error' | 'disabled'; endpoint: string
  eventsForwarded: number; lastSync: string | null; latencyMs: number
  createdAt: string
}

export interface WebhookConfig {
  id: string; url: string; events: string[]; status: 'active' | 'failing' | 'disabled'
  deliveryRate: number; lastTriggered: string | null; secret: string
  hmacEnabled: boolean; retryCount: number; dlqCount: number; createdAt: string
}

export interface TicketingIntegration {
  id: string; name: string; type: 'servicenow' | 'jira'
  project: string; autoCreateRules: number; status: 'active' | 'error' | 'disabled'
  recentTickets: number; createdAt: string
}

export interface STIXCollection {
  id: string; name: string; type: 'publish' | 'subscribe'
  objectCount: number; lastPollOrPush: string | null; status: 'active' | 'paused'
  pollingInterval: number; createdAt: string
}

export interface BulkExport {
  id: string; name: string; format: 'stix' | 'csv' | 'json'
  schedule: string; lastRun: string | null; nextRun: string | null
  status: 'active' | 'paused' | 'error'; recordCount: number; createdAt: string
}

export interface IntegrationStats {
  total: number; active: number; failing: number
  eventsPerHour: number; lastSync: string | null
}

// ─── User Management Types ──────────────────────────────────────

export interface UserRecord {
  id: string; name: string; email: string; role: string
  team: string | null; status: 'active' | 'locked' | 'invited'
  lastLogin: string | null; mfaEnabled: boolean; createdAt: string
}

export interface TeamRecord {
  id: string; name: string; description: string; memberCount: number
  lead: string; createdAt: string
}

export interface RoleRecord {
  id: string; name: string; permissionCount: number; userCount: number
  isSystem: boolean; description: string; createdAt: string
}

export interface SessionRecord {
  id: string; userId: string; userName: string; ip: string
  device: string; startedAt: string; lastActivity: string
  status: 'active' | 'expired'
}

export interface AuditLogEntry {
  id: string; timestamp: string; userName: string; action: string
  resource: string; ip: string; details: string
}

export interface UserManagementStats {
  totalUsers: number; activeSessions: number; teams: number
  roles: number; mfaPercent: number
}

// ─── Customization Types ────────────────────────────────────────

export interface ModuleToggle {
  id: string; name: string; description: string; enabled: boolean
  icon: string; dependencies: string[]; category: string
}

export interface AIModelConfig {
  id: string; task: string; model: string; maxTokens: number
  monthlyBudget: number; spent: number; confidenceThreshold: number
  enabled: boolean
}

export interface RiskWeight {
  id: string; factor: string; weight: number; description: string
  min: number; max: number; default: number
}

export interface NotificationChannel {
  id: string; type: 'email' | 'slack' | 'webhook' | 'in_app'
  name: string; enabled: boolean; severities: string[]
  quietHoursStart: string | null; quietHoursEnd: string | null
}

export interface CustomizationStats {
  modulesEnabled: number; customRules: number
  aiBudgetUsed: number; theme: string
}

// ─── Integration Demo Data ──────────────────────────────────────

export const DEMO_SIEM_INTEGRATIONS: SIEMIntegration[] = [
  { id: 'siem-1', name: 'Production Splunk', type: 'splunk', status: 'active', endpoint: 'https://splunk.corp.local:8088/services/collector', eventsForwarded: 12847, lastSync: hoursAgo(0.5), latencyMs: 42, createdAt: daysAgo(30) },
  { id: 'siem-2', name: 'Azure Sentinel', type: 'sentinel', status: 'active', endpoint: 'https://sentinel.azure.com/api/collect', eventsForwarded: 8923, lastSync: hoursAgo(1), latencyMs: 85, createdAt: daysAgo(20) },
  { id: 'siem-3', name: 'Elastic SIEM', type: 'elastic', status: 'error', endpoint: 'https://elastic.corp.local:9200/_bulk', eventsForwarded: 3210, lastSync: daysAgo(2), latencyMs: 350, createdAt: daysAgo(15) },
]

export const DEMO_WEBHOOKS: WebhookConfig[] = [
  { id: 'wh-1', url: 'https://hooks.slack.com/services/T00/B00/xxx', events: ['alert.critical', 'alert.high'], status: 'active', deliveryRate: 99.2, lastTriggered: hoursAgo(2), secret: '••••••', hmacEnabled: true, retryCount: 0, dlqCount: 0, createdAt: daysAgo(25) },
  { id: 'wh-2', url: 'https://api.pagerduty.com/webhooks', events: ['alert.critical'], status: 'active', deliveryRate: 100, lastTriggered: hoursAgo(6), secret: '••••••', hmacEnabled: true, retryCount: 0, dlqCount: 0, createdAt: daysAgo(20) },
  { id: 'wh-3', url: 'https://corp.local/security/ingest', events: ['ioc.new', 'alert.critical', 'alert.high', 'alert.medium'], status: 'failing', deliveryRate: 72.5, lastTriggered: daysAgo(1), secret: '••••••', hmacEnabled: false, retryCount: 3, dlqCount: 12, createdAt: daysAgo(10) },
]

export const DEMO_TICKETING: TicketingIntegration[] = [
  { id: 'tick-1', name: 'ServiceNow Production', type: 'servicenow', project: 'SEC-OPS', autoCreateRules: 4, status: 'active', recentTickets: 23, createdAt: daysAgo(30) },
  { id: 'tick-2', name: 'Jira Security Board', type: 'jira', project: 'SECIR', autoCreateRules: 2, status: 'active', recentTickets: 15, createdAt: daysAgo(15) },
]

export const DEMO_STIX_COLLECTIONS: STIXCollection[] = [
  { id: 'stix-1', name: 'ETIP Published IOCs', type: 'publish', objectCount: 1245, lastPollOrPush: hoursAgo(4), status: 'active', pollingInterval: 3600, createdAt: daysAgo(20) },
  { id: 'stix-2', name: 'MITRE ATT&CK Feed', type: 'subscribe', objectCount: 8432, lastPollOrPush: hoursAgo(12), status: 'active', pollingInterval: 86400, createdAt: daysAgo(25) },
  { id: 'stix-3', name: 'ISAC Threat Share', type: 'subscribe', objectCount: 2156, lastPollOrPush: daysAgo(3), status: 'paused', pollingInterval: 43200, createdAt: daysAgo(10) },
]

export const DEMO_BULK_EXPORTS: BulkExport[] = [
  { id: 'exp-1', name: 'Daily IOC Export', format: 'stix', schedule: '0 2 * * *', lastRun: hoursAgo(8), nextRun: futureHours(16), status: 'active', recordCount: 342, createdAt: daysAgo(15) },
  { id: 'exp-2', name: 'Weekly CSV Report', format: 'csv', schedule: '0 6 * * 1', lastRun: daysAgo(3), nextRun: futureHours(96), status: 'active', recordCount: 1205, createdAt: daysAgo(20) },
  { id: 'exp-3', name: 'Monthly JSON Dump', format: 'json', schedule: '0 0 1 * *', lastRun: daysAgo(23), nextRun: futureHours(168), status: 'paused', recordCount: 5678, createdAt: daysAgo(30) },
]

export const DEMO_INTEGRATION_STATS: IntegrationStats = {
  total: 14, active: 11, failing: 2, eventsPerHour: 2840, lastSync: hoursAgo(0.5),
}

// ─── User Management Demo Data ──────────────────────────────────

// ponytail: DEMO_USERS/TEAMS/ROLES/SESSIONS/AUDIT_LOG/USER_MANAGEMENT_STATS removed —
// User Management hooks are honest-UI now (S161a), no demo fallback left to feed.

// ─── Customization Demo Data ────────────────────────────────────

export const DEMO_MODULE_TOGGLES: ModuleToggle[] = [
  { id: 'mod-1', name: 'Ingestion Service', description: 'Feed collection and parsing', enabled: true, icon: 'Download', dependencies: [], category: 'Pipeline' },
  { id: 'mod-2', name: 'Normalization', description: 'IOC extraction and deduplication', enabled: true, icon: 'Filter', dependencies: ['Ingestion Service'], category: 'Pipeline' },
  { id: 'mod-3', name: 'AI Enrichment', description: 'AI-powered threat analysis', enabled: true, icon: 'Brain', dependencies: ['Normalization'], category: 'Pipeline' },
  { id: 'mod-4', name: 'Threat Graph', description: 'Knowledge graph visualization', enabled: true, icon: 'GitBranch', dependencies: ['Normalization'], category: 'Analysis' },
  { id: 'mod-5', name: 'Correlation Engine', description: 'Automated threat correlation', enabled: true, icon: 'Link', dependencies: ['Normalization'], category: 'Analysis' },
  { id: 'mod-6', name: 'Threat Hunting', description: 'Hypothesis-driven hunting', enabled: true, icon: 'Crosshair', dependencies: ['Correlation Engine'], category: 'Analysis' },
  { id: 'mod-7', name: 'Digital Risk Protection', description: 'Brand and domain monitoring', enabled: true, icon: 'Shield', dependencies: [], category: 'Protection' },
  { id: 'mod-8', name: 'Enterprise Integrations', description: 'SIEM, SOAR, ticketing connectors', enabled: true, icon: 'Plug', dependencies: [], category: 'Integration' },
  { id: 'mod-9', name: 'Dark Web Monitoring', description: 'Deep/dark web scanning', enabled: false, icon: 'Eye', dependencies: ['Digital Risk Protection'], category: 'Protection' },
  { id: 'mod-10', name: 'Automated Response', description: 'SOAR playbook execution', enabled: false, icon: 'Zap', dependencies: ['Enterprise Integrations', 'Correlation Engine'], category: 'Integration' },
]

export const DEMO_AI_CONFIGS: AIModelConfig[] = [
  { id: 'ai-1', task: 'IOC Triage', model: 'claude-haiku-4-5', maxTokens: 512, monthlyBudget: 50, spent: 18.40, confidenceThreshold: 0.7, enabled: true },
  { id: 'ai-2', task: 'Threat Extraction', model: 'claude-sonnet-4-6', maxTokens: 2048, monthlyBudget: 200, spent: 82.15, confidenceThreshold: 0.8, enabled: true },
  { id: 'ai-3', task: 'Campaign Detection', model: 'claude-sonnet-4-6', maxTokens: 4096, monthlyBudget: 150, spent: 45.30, confidenceThreshold: 0.85, enabled: true },
  { id: 'ai-4', task: 'Report Generation', model: 'claude-opus-4-6', maxTokens: 8192, monthlyBudget: 100, spent: 12.00, confidenceThreshold: 0.9, enabled: false },
]

export const DEMO_RISK_WEIGHTS: RiskWeight[] = [
  { id: 'rw-1', factor: 'Severity', weight: 0.35, description: 'Impact severity of the threat', min: 0, max: 1, default: 0.35 },
  { id: 'rw-2', factor: 'Confidence', weight: 0.25, description: 'Analysis confidence level', min: 0, max: 1, default: 0.25 },
  { id: 'rw-3', factor: 'Recency', weight: 0.20, description: 'How recently the threat was observed', min: 0, max: 1, default: 0.20 },
  { id: 'rw-4', factor: 'Source Reliability', weight: 0.15, description: 'Trustworthiness of the intel source', min: 0, max: 1, default: 0.15 },
  { id: 'rw-5', factor: 'Corroboration', weight: 0.05, description: 'Number of independent sources confirming', min: 0, max: 1, default: 0.05 },
]

export const DEMO_NOTIFICATION_CHANNELS: NotificationChannel[] = [
  { id: 'notif-1', type: 'email', name: 'Security Team Email', enabled: true, severities: ['critical', 'high'], quietHoursStart: null, quietHoursEnd: null },
  { id: 'notif-2', type: 'slack', name: '#sec-alerts Channel', enabled: true, severities: ['critical', 'high', 'medium'], quietHoursStart: '22:00', quietHoursEnd: '07:00' },
  { id: 'notif-3', type: 'webhook', name: 'PagerDuty Webhook', enabled: true, severities: ['critical'], quietHoursStart: null, quietHoursEnd: null },
  { id: 'notif-4', type: 'in_app', name: 'In-App Notifications', enabled: true, severities: ['critical', 'high', 'medium', 'low'], quietHoursStart: null, quietHoursEnd: null },
]

export const DEMO_CUSTOMIZATION_STATS: CustomizationStats = {
  modulesEnabled: 8, customRules: 6, aiBudgetUsed: 31.6, theme: 'dark',
}

// ─── AI Plan Tiers Demo Data ─────────────────────────────────────

export interface PlanTierMeta {
  plan: 'starter' | 'professional' | 'enterprise' | 'custom'
  displayName: string; description: string; stageModel: string
  costPer1KArticlesUsd: string; accuracyPct: string; isRecommended: boolean
}

export const DEMO_PLAN_TIERS: PlanTierMeta[] = [
  { plan: 'starter',      displayName: 'Starter',      description: 'Cost-efficient tier — all stages use Haiku. Best for high-volume, lower-stakes feeds.',      stageModel: 'haiku (all stages)',    costPer1KArticlesUsd: '$4–6',   accuracyPct: '~85%', isRecommended: false },
  { plan: 'professional', displayName: 'Professional', description: 'Balanced tier — all stages use Sonnet. Recommended for most production deployments.',         stageModel: 'sonnet (all stages)',   costPer1KArticlesUsd: '~$27',   accuracyPct: '~93%', isRecommended: true  },
  { plan: 'enterprise',   displayName: 'Enterprise',   description: 'Maximum accuracy — all stages use Opus. Best for high-stakes CTI operations.',               stageModel: 'opus (all stages)',     costPer1KArticlesUsd: '~$85',   accuracyPct: '~96%', isRecommended: false },
  { plan: 'custom',       displayName: 'Custom',       description: 'Per-subtask configuration — set each of the 12 subtasks individually.',                      stageModel: 'per-subtask',           costPer1KArticlesUsd: 'variable', accuracyPct: 'variable', isRecommended: false },
]

export interface SubtaskMapping {
  id: string; tenantId: string; subtask: string; stage: 1 | 2 | 3
  model: 'haiku' | 'sonnet' | 'opus'; fallbackModel: 'haiku' | 'sonnet' | 'opus'
  isRecommended: boolean; updatedAt: string
}

export const DEMO_SUBTASK_MAPPINGS: SubtaskMapping[] = [
  { id: 'sm-1',  tenantId: 'default', subtask: 'summarization',       stage: 1, model: 'sonnet', fallbackModel: 'haiku',  isRecommended: true,  updatedAt: daysAgo(1) },
  { id: 'sm-2',  tenantId: 'default', subtask: 'keyword_extraction',  stage: 1, model: 'sonnet', fallbackModel: 'haiku',  isRecommended: true,  updatedAt: daysAgo(1) },
  { id: 'sm-3',  tenantId: 'default', subtask: 'date_enrichment',     stage: 1, model: 'sonnet', fallbackModel: 'haiku',  isRecommended: true,  updatedAt: daysAgo(1) },
  { id: 'sm-4',  tenantId: 'default', subtask: 'classification',      stage: 1, model: 'sonnet', fallbackModel: 'haiku',  isRecommended: true,  updatedAt: daysAgo(1) },
  { id: 'sm-5',  tenantId: 'default', subtask: 'ioc_extraction',      stage: 2, model: 'sonnet', fallbackModel: 'haiku',  isRecommended: true,  updatedAt: daysAgo(1) },
  { id: 'sm-6',  tenantId: 'default', subtask: 'cve_identification',  stage: 2, model: 'sonnet', fallbackModel: 'opus',   isRecommended: true,  updatedAt: daysAgo(1) },
  { id: 'sm-7',  tenantId: 'default', subtask: 'threat_actor',        stage: 2, model: 'sonnet', fallbackModel: 'haiku',  isRecommended: true,  updatedAt: daysAgo(1) },
  { id: 'sm-8',  tenantId: 'default', subtask: 'graph_relations',     stage: 2, model: 'sonnet', fallbackModel: 'haiku',  isRecommended: true,  updatedAt: daysAgo(1) },
  { id: 'sm-9',  tenantId: 'default', subtask: 'ioc_expiry',          stage: 2, model: 'sonnet', fallbackModel: 'haiku',  isRecommended: true,  updatedAt: daysAgo(1) },
  { id: 'sm-10', tenantId: 'default', subtask: 'ttp_mapping',         stage: 2, model: 'sonnet', fallbackModel: 'opus',   isRecommended: true,  updatedAt: daysAgo(1) },
  { id: 'sm-11', tenantId: 'default', subtask: 'deduplication',       stage: 3, model: 'haiku',  fallbackModel: 'sonnet', isRecommended: true,  updatedAt: daysAgo(1) },
  { id: 'sm-12', tenantId: 'default', subtask: 'cross_article_merge', stage: 3, model: 'sonnet', fallbackModel: 'haiku',  isRecommended: true,  updatedAt: daysAgo(1) },
]

export interface RecommendedSubtask {
  subtask: string; stage: 1 | 2 | 3
  recommendedModel: 'haiku' | 'sonnet' | 'opus'; fallbackModel: 'haiku' | 'sonnet' | 'opus'
  description: string
}

export const DEMO_RECOMMENDED_MODELS: RecommendedSubtask[] = [
  { subtask: 'summarization',       stage: 1, recommendedModel: 'sonnet', fallbackModel: 'haiku',  description: 'Stage 1 — generate 2-3 sentence article summary' },
  { subtask: 'keyword_extraction',  stage: 1, recommendedModel: 'sonnet', fallbackModel: 'haiku',  description: 'Stage 1 — extract key threat terms and named entities' },
  { subtask: 'date_enrichment',     stage: 1, recommendedModel: 'sonnet', fallbackModel: 'haiku',  description: 'Stage 1 — normalise and enrich timestamps' },
  { subtask: 'classification',      stage: 1, recommendedModel: 'sonnet', fallbackModel: 'haiku',  description: 'Stage 1 — classify article type and CTI relevance' },
  { subtask: 'ioc_extraction',      stage: 2, recommendedModel: 'sonnet', fallbackModel: 'haiku',  description: 'Stage 2 — extract all IOC values with context' },
  { subtask: 'cve_identification',  stage: 2, recommendedModel: 'sonnet', fallbackModel: 'opus',   description: 'Stage 2 — identify and validate CVE identifiers' },
  { subtask: 'threat_actor',        stage: 2, recommendedModel: 'sonnet', fallbackModel: 'haiku',  description: 'Stage 2 — attribute activity to known threat groups' },
  { subtask: 'graph_relations',     stage: 2, recommendedModel: 'sonnet', fallbackModel: 'haiku',  description: 'Stage 2 — extract entity relationships for knowledge graph' },
  { subtask: 'ioc_expiry',          stage: 2, recommendedModel: 'sonnet', fallbackModel: 'haiku',  description: 'Stage 2 — determine IOC validity and expiry signal' },
  { subtask: 'ttp_mapping',         stage: 2, recommendedModel: 'sonnet', fallbackModel: 'opus',   description: 'Stage 2 — map behaviours to MITRE ATT&CK techniques' },
  { subtask: 'deduplication',       stage: 3, recommendedModel: 'haiku',  fallbackModel: 'sonnet', description: 'Stage 3 — detect near-duplicate articles (LLM arbitration)' },
  { subtask: 'cross_article_merge', stage: 3, recommendedModel: 'sonnet', fallbackModel: 'haiku',  description: 'Stage 3 — merge IOC context across related articles' },
]

export interface StageEstimate {
  stage: 1 | 2 | 3; model: string; articles: number; subtasks: number; costUsd: number
}

export interface CostEstimate {
  perStage: StageEstimate[]
  totalMonthlyUsd: number
  comparedTo: { starter: number; professional: number; enterprise: number }
}

export const DEMO_COST_ESTIMATE: CostEstimate = {
  perStage: [
    { stage: 1, model: 'sonnet', articles: 1000, subtasks: 4, costUsd: 25.5 },
    { stage: 2, model: 'sonnet', articles: 200,  subtasks: 6, costUsd: 6.6  },
    { stage: 3, model: 'haiku',  articles: 1000, subtasks: 2, costUsd: 1.13 },
  ],
  totalMonthlyUsd: 33.23,
  comparedTo: { starter: 3.8, professional: 45.6, enterprise: 228 },
}
