/**
 * @module hooks/phase6-demo-data
 * @description Types for Phase 6 frontend pages: Billing (Module 19) and Admin
 * Ops (Module 22), plus demo data for the Onboarding hooks only (S161a: billing
 * and admin-ops hooks are honest UI — no demo fallback — see use-phase6-data.ts).
 */

// ─── Helpers ────────────────────────────────────────────────────

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3_600_000).toISOString()
}

// ─── Billing Types ──────────────────────────────────────────────

export interface BillingPlan {
  id: string
  name: 'Free' | 'Starter' | 'Teams' | 'Enterprise'
  price: number         // monthly INR
  priceAnnual: number   // annual INR (per month)
  seats: number         // -1 = unlimited
  apiCallsPerMonth: number
  iocLimit: number
  storageGb: number
  features: string[]
  highlighted?: boolean
}

export interface UsageMeters {
  apiCalls: { used: number; limit: number; resetAt: string }
  iocCount: { used: number; limit: number }
  storageGb: { used: number; limit: number }
  seats: { used: number; limit: number }
  period: { start: string; end: string }
}

export interface PaymentRecord {
  id: string
  date: string
  description: string
  amount: number
  status: 'paid' | 'pending' | 'failed' | 'refunded'
  invoiceUrl: string | null
  plan: string
}

export interface CurrentSubscription {
  planId: string
  planName: string
  status: 'active' | 'trialing' | 'past_due' | 'canceled'
  billingCycle: 'monthly' | 'annual'
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  trialEnd: string | null
  couponApplied: string | null
  discountPercent: number
}

export interface BillingStats {
  currentPlan: string
  monthlySpend: number
  nextBillingDate: string
  apiUsagePercent: number
}

// ─── Admin Ops Types ─────────────────────────────────────────────

export type ServiceStatus = 'healthy' | 'degraded' | 'down' | 'critical' | 'unknown'

export interface ServiceHealth {
  name: string
  status: ServiceStatus
  uptime: number       // percent, 0-100
  responseMs: number
  lastChecked: string
  port: number
  version: string
  errorRate: number    // percent
}

export interface SystemHealthSummary {
  healthy: number
  degraded: number
  down: number
  total: number
  uptimePercent: number
  lastUpdated: string
}

export interface MaintenanceWindow {
  id: string
  title: string
  description: string
  status: 'scheduled' | 'active' | 'completed' | 'cancelled'
  startsAt: string
  endsAt: string
  affectedServices: string[]
  createdBy: string
  createdAt: string
}

export interface TenantRecord {
  id: string
  name: string
  domain: string
  plan: 'Free' | 'Starter' | 'Teams' | 'Enterprise'
  status: 'active' | 'suspended' | 'trial'
  seats: number
  usedSeats: number
  iocCount: number
  feedCount: number
  createdAt: string
  lastActiveAt: string
}

export interface AdminAuditEntry {
  id: string
  timestamp: string
  adminName: string
  action: string
  targetType: string
  targetId: string
  details: string
  ip: string
}

export interface AdminStats {
  totalTenants: number
  activeTenants: number
  suspendedTenants: number
  maintenanceWindowsThisMonth: number
  backupsLast7Days: number
  openAlerts: number
}

// ─── Onboarding Types ────────────────────────────────────────────

export type ConnectorType =
  | 'rss_feed' | 'stix_taxii' | 'rest_api' | 'csv_upload'
  | 'siem_splunk' | 'siem_sentinel' | 'siem_elastic' | 'webhook'

export interface OnboardingWizard {
  id: string
  currentStep: string
  steps: Record<string, string>
  completionPercent: number
  orgProfile: Record<string, unknown> | null
  teamInvites: unknown[]
  dataSources: unknown[]
  dashboardPrefs: Record<string, unknown> | null
  startedAt: string
  updatedAt: string
  completedAt: string | null
}

export interface PipelineStage {
  name: string
  status: 'healthy' | 'unhealthy' | 'unknown'
  latencyMs: number | null
  message: string
}

export interface PipelineHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  stages: PipelineStage[]
  lastCheckedAt: string
}

export interface ModuleStatus {
  module: string
  enabled: boolean
  healthy: boolean
  configured: boolean
  dependencies: string[]
  missingDeps: string[]
  status: 'ready' | 'needs_config' | 'needs_deps' | 'disabled'
}

export interface ReadinessCheckItem {
  name: string
  passed: boolean
  description: string
  required: boolean
}

export interface ReadinessResult {
  overall: 'ready' | 'not_ready'
  checks: ReadinessCheckItem[]
  score: number
  maxScore: number
}

export interface GuidedTip {
  id: string
  title: string
  content: string
  category: 'getting_started' | 'best_practice' | 'feature_highlight'
  order: number
}

export interface WelcomeDashboard {
  tenantId: string
  onboardingComplete: boolean
  completionPercent: number
  nextStep: string | null
  stats: {
    feedsActive: number
    iocsIngested: number
    teamMembers: number
    modulesEnabled: number
  }
  quickActions: unknown[]
  tips: GuidedTip[]
}

// ─── Onboarding Demo Data ─────────────────────────────────────────

export const DEMO_ONBOARDING_WIZARD: OnboardingWizard = {
  id: 'wiz-1',
  currentStep: 'feed_activation',
  steps: {
    welcome: 'completed',
    org_profile: 'completed',
    team_invite: 'completed',
    feed_activation: 'in_progress',
    integration_setup: 'pending',
    dashboard_config: 'pending',
    readiness_check: 'pending',
    launch: 'pending',
  },
  completionPercent: 62,
  orgProfile: null,
  teamInvites: [],
  dataSources: [],
  dashboardPrefs: null,
  startedAt: daysAgo(3),
  updatedAt: hoursAgo(2),
  completedAt: null,
}

export const DEMO_PIPELINE_HEALTH: PipelineHealth = {
  overall: 'healthy',
  stages: [
    { name: 'ingestion',     status: 'healthy', latencyMs: 45,  message: 'Processing 127 articles/min' },
    { name: 'normalization', status: 'healthy', latencyMs: 12,  message: 'All IOC types handled' },
    { name: 'enrichment',    status: 'healthy', latencyMs: 340, message: 'VT + AbuseIPDB active' },
    { name: 'indexing',      status: 'healthy', latencyMs: 8,   message: 'IOC index up to date' },
    { name: 'correlation',   status: 'healthy', latencyMs: 28,  message: 'All correlations active' },
  ],
  lastCheckedAt: hoursAgo(0.05),
}

export const DEMO_MODULE_STATUS: ModuleStatus[] = [
  { module: 'ingestion',           enabled: true,  healthy: true,  configured: true,  dependencies: [],                  missingDeps: [], status: 'ready' },
  { module: 'normalization',       enabled: true,  healthy: true,  configured: true,  dependencies: ['ingestion'],       missingDeps: [], status: 'ready' },
  { module: 'ai-enrichment',       enabled: true,  healthy: true,  configured: false, dependencies: ['normalization'],   missingDeps: [], status: 'needs_config' },
  { module: 'ioc-intelligence',    enabled: true,  healthy: true,  configured: true,  dependencies: ['normalization'],   missingDeps: [], status: 'ready' },
  { module: 'threat-actor-intel',  enabled: true,  healthy: true,  configured: true,  dependencies: ['ioc-intelligence'],missingDeps: [], status: 'ready' },
  { module: 'malware-intel',       enabled: true,  healthy: true,  configured: true,  dependencies: ['ioc-intelligence'],missingDeps: [], status: 'ready' },
  { module: 'vulnerability-intel', enabled: true,  healthy: true,  configured: true,  dependencies: ['ioc-intelligence'],missingDeps: [], status: 'ready' },
  { module: 'threat-graph',        enabled: false, healthy: false, configured: false, dependencies: ['ioc-intelligence'],missingDeps: [], status: 'needs_config' },
  { module: 'correlation-engine',  enabled: false, healthy: false, configured: false, dependencies: ['ioc-intelligence'],missingDeps: [], status: 'disabled' },
  { module: 'threat-hunting',      enabled: false, healthy: false, configured: false, dependencies: ['ioc-intelligence'],missingDeps: [], status: 'disabled' },
]

export const DEMO_READINESS_RESULT: ReadinessResult = {
  overall: 'not_ready',
  checks: [
    { name: 'Feed connected',        passed: true,  description: 'At least one active feed',              required: true  },
    { name: 'Team invites sent',     passed: true,  description: 'At least one team member invited',      required: false },
    { name: 'Org profile set',       passed: true,  description: 'Organization profile configured',       required: true  },
    { name: 'Core modules enabled',  passed: true,  description: 'Ingestion and normalization enabled',   required: true  },
    { name: 'IOCs ingested',         passed: true,  description: 'At least 100 IOCs in the system',       required: true  },
    { name: 'Enrichment configured', passed: true,  description: 'AI enrichment API key set',             required: false },
    { name: 'Dashboard configured',  passed: true,  description: 'Dashboard preferences set',             required: false },
    { name: 'Integration connected', passed: false, description: 'At least one SIEM or webhook',          required: false },
    { name: 'Alert rules active',    passed: false, description: 'Correlation rules configured',           required: false },
    { name: 'Graph ready',           passed: false, description: 'Threat graph has at least 50 nodes',    required: false },
  ],
  score: 7,
  maxScore: 10,
}

export const DEMO_WELCOME_DASHBOARD: WelcomeDashboard = {
  tenantId: 'tenant-1',
  onboardingComplete: false,
  completionPercent: 62,
  nextStep: 'feed_activation',
  stats: {
    feedsActive: 3,
    iocsIngested: 1_247,
    teamMembers: 4,
    modulesEnabled: 7,
  },
  quickActions: [],
  tips: [
    { id: 'tip-1', title: 'Activate your first feed',    content: 'Connect to a threat intel feed to start ingesting IOCs automatically.', category: 'getting_started',   order: 1 },
    { id: 'tip-2', title: 'Configure AI enrichment',     content: 'Add your VirusTotal API key to enable automatic IOC enrichment.',       category: 'best_practice',     order: 2 },
    { id: 'tip-3', title: 'Invite your team',            content: 'Add SOC analysts and set up roles for your team members.',              category: 'getting_started',   order: 3 },
  ],
}
