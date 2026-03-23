/**
 * @module hooks/phase6-demo-data
 * @description Realistic demo data for Phase 6 frontend pages:
 * Billing (Module 19) and Admin Ops (Module 22).
 * Used as fallback when backend services are unreachable.
 */

// ─── Helpers ────────────────────────────────────────────────────

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

function hoursAgo(n: number): string {
  return new Date(Date.now() - n * 3_600_000).toISOString()
}

function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString()
}

// ─── Billing Types ──────────────────────────────────────────────

export interface BillingPlan {
  id: string
  name: 'Free' | 'Starter' | 'Pro' | 'Enterprise'
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

export type ServiceStatus = 'healthy' | 'degraded' | 'down' | 'unknown'

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
  plan: 'Free' | 'Starter' | 'Pro' | 'Enterprise'
  status: 'active' | 'suspended' | 'trial'
  seats: number
  usedSeats: number
  iocCount: number
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

// ─── Billing Demo Data ───────────────────────────────────────────

export const DEMO_BILLING_PLANS: BillingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    priceAnnual: 0,
    seats: 2,
    apiCallsPerMonth: 10_000,
    iocLimit: 10_000,
    storageGb: 1,
    features: [
      'Up to 2 users',
      '10K API calls / month',
      '10K IOC limit',
      '1 GB storage',
      'RSS + STIX feeds',
      'Basic IOC search',
      'Community support',
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 7_999,
    priceAnnual: 6_499,
    seats: 10,
    apiCallsPerMonth: 100_000,
    iocLimit: 50_000,
    storageGb: 10,
    features: [
      'Up to 10 users',
      '100K API calls / month',
      '50K IOC limit',
      '10 GB storage',
      'All feed types',
      'AI enrichment (Haiku)',
      'SIEM integration (1)',
      'Email support',
    ],
  },
  {
    id: 'teams',
    name: 'Teams',
    price: 12_999,
    priceAnnual: 9_999,
    seats: 25,
    apiCallsPerMonth: 250_000,
    iocLimit: 250_000,
    storageGb: 50,
    features: [
      'Up to 25 users',
      '250K API calls / month',
      '250K IOC limit',
      '50 GB storage',
      'All feed types',
      'AI enrichment (Haiku)',
      'Threat Graph (read-only)',
      'SIEM integrations (3)',
      'Priority email support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 14_999,
    priceAnnual: 11_999,
    seats: 50,
    apiCallsPerMonth: 1_000_000,
    iocLimit: 500_000,
    storageGb: 100,
    highlighted: true,
    features: [
      'Up to 50 users',
      '1M API calls / month',
      '500K IOC limit',
      '100 GB storage',
      'AI enrichment (Sonnet)',
      'Threat Graph + Hunting',
      'All SIEM integrations',
      'SSO (SAML + OIDC)',
      'Priority support',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: -1,    // contact sales
    priceAnnual: -1,
    seats: -1,
    apiCallsPerMonth: -1,
    iocLimit: -1,
    storageGb: -1,
    features: [
      'Unlimited users',
      'Unlimited API calls',
      'Unlimited IOCs',
      'Custom storage',
      'AI enrichment (Opus)',
      'Full platform access',
      'Custom integrations',
      'Dedicated SLA',
      'On-prem option',
      '24/7 dedicated support',
    ],
  },
]

export const DEMO_USAGE_METERS: UsageMeters = {
  apiCalls: {
    used: 847_234,
    limit: 1_000_000,
    resetAt: daysFromNow(8),
  },
  iocCount: {
    used: 312_445,
    limit: 500_000,
  },
  storageGb: {
    used: 42.7,
    limit: 100,
  },
  seats: {
    used: 12,
    limit: 50,
  },
  period: {
    start: daysAgo(22),
    end: daysFromNow(8),
  },
}

export const DEMO_CURRENT_SUBSCRIPTION: CurrentSubscription = {
  planId: 'pro',
  planName: 'Pro',
  status: 'active',
  billingCycle: 'annual',
  currentPeriodEnd: daysFromNow(8),
  cancelAtPeriodEnd: false,
  trialEnd: null,
  couponApplied: 'LAUNCH20',
  discountPercent: 20,
}

export const DEMO_PAYMENT_HISTORY: PaymentRecord[] = [
  { id: 'inv-001', date: daysAgo(8),  description: 'Pro Plan — Annual', amount: 143_988, status: 'paid',    invoiceUrl: '/api/v1/billing/invoices/inv-001/download', plan: 'Pro' },
  { id: 'inv-002', date: daysAgo(38), description: 'Pro Plan — Annual', amount: 143_988, status: 'paid',    invoiceUrl: '/api/v1/billing/invoices/inv-002/download', plan: 'Pro' },
  { id: 'inv-003', date: daysAgo(68), description: 'Starter Plan — Monthly', amount: 4_999, status: 'paid', invoiceUrl: '/api/v1/billing/invoices/inv-003/download', plan: 'Starter' },
  { id: 'inv-004', date: daysAgo(98), description: 'Starter Plan — Monthly', amount: 4_999, status: 'paid', invoiceUrl: '/api/v1/billing/invoices/inv-004/download', plan: 'Starter' },
  { id: 'inv-005', date: daysAgo(128), description: 'Starter Plan — Monthly', amount: 4_999, status: 'refunded', invoiceUrl: '/api/v1/billing/invoices/inv-005/download', plan: 'Starter' },
]

export const DEMO_BILLING_STATS: BillingStats = {
  currentPlan: 'Pro',
  monthlySpend: 11_999,
  nextBillingDate: daysFromNow(8),
  apiUsagePercent: 84.7,
}

// ─── Admin Ops Demo Data ─────────────────────────────────────────

export const DEMO_SERVICE_HEALTH: ServiceHealth[] = [
  { name: 'api-gateway',         status: 'healthy',  uptime: 99.98, responseMs: 12,  lastChecked: hoursAgo(0.05), port: 3001, version: '0.1.0', errorRate: 0.01 },
  { name: 'ingestion',           status: 'healthy',  uptime: 99.95, responseMs: 28,  lastChecked: hoursAgo(0.05), port: 3004, version: '0.1.0', errorRate: 0.02 },
  { name: 'normalization',       status: 'healthy',  uptime: 99.97, responseMs: 18,  lastChecked: hoursAgo(0.05), port: 3005, version: '0.1.0', errorRate: 0.01 },
  { name: 'ai-enrichment',       status: 'degraded', uptime: 98.20, responseMs: 340, lastChecked: hoursAgo(0.05), port: 3006, version: '0.3.0', errorRate: 1.80 },
  { name: 'ioc-intelligence',    status: 'healthy',  uptime: 99.90, responseMs: 22,  lastChecked: hoursAgo(0.05), port: 3007, version: '0.1.0', errorRate: 0.05 },
  { name: 'threat-actor-intel',  status: 'healthy',  uptime: 99.92, responseMs: 25,  lastChecked: hoursAgo(0.05), port: 3008, version: '0.1.0', errorRate: 0.04 },
  { name: 'malware-intel',       status: 'healthy',  uptime: 99.91, responseMs: 24,  lastChecked: hoursAgo(0.05), port: 3009, version: '0.1.0', errorRate: 0.04 },
  { name: 'vulnerability-intel', status: 'healthy',  uptime: 99.89, responseMs: 26,  lastChecked: hoursAgo(0.05), port: 3010, version: '0.1.0', errorRate: 0.06 },
  { name: 'digital-risk',        status: 'healthy',  uptime: 99.85, responseMs: 35,  lastChecked: hoursAgo(0.05), port: 3011, version: '0.1.0', errorRate: 0.08 },
  { name: 'threat-graph',        status: 'healthy',  uptime: 99.80, responseMs: 45,  lastChecked: hoursAgo(0.05), port: 3012, version: '2.0.0', errorRate: 0.10 },
  { name: 'correlation-engine',  status: 'healthy',  uptime: 99.82, responseMs: 38,  lastChecked: hoursAgo(0.05), port: 3013, version: '0.1.0', errorRate: 0.09 },
  { name: 'threat-hunting',      status: 'healthy',  uptime: 99.78, responseMs: 42,  lastChecked: hoursAgo(0.05), port: 3014, version: '0.1.0', errorRate: 0.12 },
  { name: 'integration',         status: 'healthy',  uptime: 99.75, responseMs: 55,  lastChecked: hoursAgo(0.05), port: 3015, version: '0.1.0', errorRate: 0.15 },
  { name: 'user-management',     status: 'healthy',  uptime: 99.99, responseMs: 10,  lastChecked: hoursAgo(0.05), port: 3016, version: '0.1.0', errorRate: 0.00 },
  { name: 'customization',       status: 'healthy',  uptime: 99.96, responseMs: 15,  lastChecked: hoursAgo(0.05), port: 3017, version: '0.1.0', errorRate: 0.02 },
  { name: 'onboarding',          status: 'healthy',  uptime: 99.93, responseMs: 20,  lastChecked: hoursAgo(0.05), port: 3018, version: '0.1.0', errorRate: 0.03 },
  { name: 'billing',             status: 'healthy',  uptime: 99.99, responseMs: 8,   lastChecked: hoursAgo(0.05), port: 3019, version: '0.1.0', errorRate: 0.00 },
  { name: 'admin-service',       status: 'healthy',  uptime: 100,   responseMs: 5,   lastChecked: hoursAgo(0.05), port: 3022, version: '0.1.0', errorRate: 0.00 },
]

export const DEMO_SYSTEM_HEALTH_SUMMARY: SystemHealthSummary = {
  healthy: 17,
  degraded: 1,
  down: 0,
  total: 18,
  uptimePercent: 99.87,
  lastUpdated: hoursAgo(0.05),
}

export const DEMO_MAINTENANCE_WINDOWS: MaintenanceWindow[] = [
  {
    id: 'mw-1',
    title: 'Neo4j Index Rebuild',
    description: 'Rebuilding threat graph indices for improved query performance.',
    status: 'active',
    startsAt: hoursAgo(0.5),
    endsAt: daysFromNow(0.1),
    affectedServices: ['threat-graph', 'correlation-engine'],
    createdBy: 'Manish Kumar',
    createdAt: daysAgo(2),
  },
  {
    id: 'mw-2',
    title: 'AI Enrichment Rate Limit Window',
    description: 'Scheduled pause for VirusTotal API quota reset. AI enrichment paused.',
    status: 'scheduled',
    startsAt: daysFromNow(1),
    endsAt: daysFromNow(1.08),
    affectedServices: ['ai-enrichment'],
    createdBy: 'Manish Kumar',
    createdAt: daysAgo(1),
  },
  {
    id: 'mw-3',
    title: 'Database Vacuum + ANALYZE',
    description: 'PostgreSQL maintenance: VACUUM FULL + ANALYZE on all IOC tables.',
    status: 'scheduled',
    startsAt: daysFromNow(3),
    endsAt: daysFromNow(3.13),
    affectedServices: ['normalization', 'ioc-intelligence'],
    createdBy: 'Manish Kumar',
    createdAt: daysAgo(1),
  },
  {
    id: 'mw-4',
    title: 'Nginx Config Reload',
    description: 'Deploying updated nginx routing configuration for Phase 6 services.',
    status: 'completed',
    startsAt: daysAgo(3),
    endsAt: daysAgo(2.99),
    affectedServices: ['api-gateway'],
    createdBy: 'GitHub Actions',
    createdAt: daysAgo(4),
  },
]

export const DEMO_TENANTS: TenantRecord[] = [
  { id: 'tenant-1', name: 'IntelWatch (Internal)', domain: 'intelwatch.in', plan: 'Enterprise', status: 'active', seats: -1, usedSeats: 5, iocCount: 312_445, createdAt: daysAgo(90), lastActiveAt: hoursAgo(0.1) },
  { id: 'tenant-2', name: 'Acme Security Labs', domain: 'acme-sec.com', plan: 'Pro', status: 'active', seats: 50, usedSeats: 23, iocCount: 98_234, createdAt: daysAgo(60), lastActiveAt: hoursAgo(2) },
  { id: 'tenant-3', name: 'SecureFinance Ltd', domain: 'securefinance.io', plan: 'Pro', status: 'active', seats: 50, usedSeats: 41, iocCount: 201_872, createdAt: daysAgo(45), lastActiveAt: hoursAgo(1) },
  { id: 'tenant-4', name: 'CyberShield Startup', domain: 'cybershield.dev', plan: 'Starter', status: 'trial', seats: 10, usedSeats: 3, iocCount: 4_231, createdAt: daysAgo(10), lastActiveAt: daysAgo(1) },
  { id: 'tenant-5', name: 'Blocked Corp', domain: 'blocked.example', plan: 'Free', status: 'suspended', seats: 2, usedSeats: 0, iocCount: 512, createdAt: daysAgo(30), lastActiveAt: daysAgo(15) },
]

export const DEMO_ADMIN_AUDIT: AdminAuditEntry[] = [
  { id: 'adm-1', timestamp: hoursAgo(0.2), adminName: 'Manish Kumar', action: 'maintenance.activate', targetType: 'maintenance_window', targetId: 'mw-1', details: 'Activated Neo4j Index Rebuild window', ip: '72.61.227.64' },
  { id: 'adm-2', timestamp: hoursAgo(1), adminName: 'Manish Kumar', action: 'tenant.update_plan', targetType: 'tenant', targetId: 'tenant-3', details: 'Plan changed: Starter → Pro', ip: '72.61.227.64' },
  { id: 'adm-3', timestamp: hoursAgo(3), adminName: 'Manish Kumar', action: 'backup.trigger', targetType: 'backup', targetId: 'bk-009', details: 'Manual backup triggered — full', ip: '72.61.227.64' },
  { id: 'adm-4', timestamp: hoursAgo(6), adminName: 'GitHub Actions', action: 'maintenance.complete', targetType: 'maintenance_window', targetId: 'mw-4', details: 'Nginx Config Reload completed in 42s', ip: '127.0.0.1' },
  { id: 'adm-5', timestamp: daysAgo(1), adminName: 'Manish Kumar', action: 'tenant.suspend', targetType: 'tenant', targetId: 'tenant-5', details: 'Suspended: payment failure after grace period', ip: '72.61.227.64' },
  { id: 'adm-6', timestamp: daysAgo(1), adminName: 'Manish Kumar', action: 'alert_rule.update', targetType: 'alert_rule', targetId: 'ar-1', details: 'CPU threshold updated: 90% → 85%', ip: '72.61.227.64' },
  { id: 'adm-7', timestamp: daysAgo(2), adminName: 'Manish Kumar', action: 'maintenance.create', targetType: 'maintenance_window', targetId: 'mw-3', details: 'Scheduled DB vacuum for 3 days out', ip: '72.61.227.64' },
  { id: 'adm-8', timestamp: daysAgo(3), adminName: 'Manish Kumar', action: 'tenant.create', targetType: 'tenant', targetId: 'tenant-4', details: 'New tenant onboarded: CyberShield Startup (trial)', ip: '72.61.227.64' },
]

export const DEMO_ADMIN_STATS: AdminStats = {
  totalTenants: 5,
  activeTenants: 3,
  suspendedTenants: 1,
  maintenanceWindowsThisMonth: 4,
  backupsLast7Days: 7,
  openAlerts: 1,
}
