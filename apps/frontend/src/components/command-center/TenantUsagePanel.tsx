/**
 * @module components/command-center/TenantUsagePanel
 * @description Tenant usage page — 16 feature usage cards + summary header.
 * Visible to tenant_admin + analyst in Billing & Plans tab.
 * Data: GET /api/v1/billing/limits via useFeatureLimits().
 */
import { cn } from '@/lib/utils'
import {
  Shield, UserX, Bug, ShieldAlert, Crosshair, GitBranch,
  Globe, Workflow, FileText, Sparkles, Rss, Users,
  Archive, Key, Database, Bell, Lock, ArrowUpCircle, Crown,
} from 'lucide-react'
import { useFeatureLimits, FEATURE_LABELS, FEATURE_KEYS, type FeatureLimitEntry, type FeatureKey } from '@/hooks/use-feature-limits'

// ─── Icon Map ───────────────────────────────────────────────

const ICON_MAP: Record<FeatureKey, React.FC<{ className?: string }>> = {
  ioc_management: Shield,
  threat_actors: UserX,
  malware_intel: Bug,
  vulnerability_intel: ShieldAlert,
  threat_hunting: Crosshair,
  graph_exploration: GitBranch,
  digital_risk_protection: Globe,
  correlation_engine: Workflow,
  reports: FileText,
  ai_enrichment: Sparkles,
  feed_subscriptions: Rss,
  users: Users,
  data_retention: Archive,
  api_access: Key,
  ioc_storage: Database,
  alerts: Bell,
}

// ─── Helpers ────────────────────────────────────────────────

function usageColor(pct: number): string {
  if (pct >= 90) return 'bg-sev-critical'
  if (pct >= 80) return 'bg-sev-high'
  if (pct >= 60) return 'bg-sev-medium'
  return 'bg-sev-low'
}

function usageTextColor(pct: number): string {
  if (pct >= 90) return 'text-sev-critical'
  if (pct >= 80) return 'text-sev-high'
  if (pct >= 60) return 'text-sev-medium'
  return 'text-sev-low'
}

function fmtNum(n: number): string {
  if (n < 0) return '∞'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ─── Feature Usage Card ─────────────────────────────────────

function FeatureUsageCard({ entry }: { entry: FeatureLimitEntry }) {
  const Icon = ICON_MAP[entry.featureKey]
  const isUnlimited = entry.limitDaily < 0 && entry.limitMonthly < 0

  if (!entry.enabled) {
    return (
      <div className="p-3 rounded-lg border border-border bg-bg-elevated/50 opacity-60" data-testid={`usage-card-${entry.featureKey}`}>
        <div className="flex items-center gap-2 mb-2">
          <Lock className="w-4 h-4 text-text-muted" />
          <span className="text-xs font-medium text-text-muted">{FEATURE_LABELS[entry.featureKey]}</span>
        </div>
        <p className="text-[10px] text-text-muted">Not available on your plan</p>
        <button className="mt-2 text-[10px] text-accent hover:underline flex items-center gap-1">
          <ArrowUpCircle className="w-3 h-3" /> Upgrade to unlock
        </button>
      </div>
    )
  }

  if (isUnlimited) {
    return (
      <div className="p-3 rounded-lg border border-border bg-bg-elevated" data-testid={`usage-card-${entry.featureKey}`}>
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-4 h-4 text-accent" />
          <span className="text-xs font-medium text-text-primary">{FEATURE_LABELS[entry.featureKey]}</span>
        </div>
        <p className="text-lg font-bold text-text-primary">Unlimited</p>
        <p className="text-[10px] text-text-muted mt-1">No usage restrictions</p>
      </div>
    )
  }

  return (
    <div className="p-3 rounded-lg border border-border bg-bg-elevated" data-testid={`usage-card-${entry.featureKey}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-accent" />
        <span className="text-xs font-medium text-text-primary">{FEATURE_LABELS[entry.featureKey]}</span>
      </div>

      {/* Daily progress */}
      {entry.limitDaily > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-text-muted">Daily</span>
            <span className={usageTextColor(entry.percentDaily)}>
              {fmtNum(entry.usedDaily)} / {fmtNum(entry.limitDaily)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-bg-active overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', usageColor(entry.percentDaily))}
              style={{ width: `${Math.min(entry.percentDaily, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Monthly progress */}
      {entry.limitMonthly > 0 && (
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-text-muted">Monthly</span>
            <span className={usageTextColor(entry.percentMonthly)}>
              {fmtNum(entry.usedMonthly)} / {fmtNum(entry.limitMonthly)}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-bg-active overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', usageColor(entry.percentMonthly))}
              style={{ width: `${Math.min(entry.percentMonthly, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Summary Header ─────────────────────────────────────────

function UsageSummaryHeader({ features }: { features: FeatureLimitEntry[] }) {
  const enabledCount = features.filter(f => f.enabled).length
  const warningCount = features.filter(f => f.enabled && (f.percentDaily >= 80 || f.percentMonthly >= 80)).length

  return (
    <div className="flex flex-wrap items-center gap-4 p-3 rounded-lg bg-bg-elevated border border-border" data-testid="usage-summary-header">
      <div className="flex items-center gap-2">
        <Crown className="w-4 h-4 text-accent" />
        <span className="text-sm font-semibold text-text-primary">Feature Usage</span>
      </div>
      <div className="flex items-center gap-1 text-xs">
        <span className="text-text-muted">{enabledCount} of 16 features enabled</span>
      </div>
      {warningCount > 0 && (
        <div className="flex items-center gap-1 text-xs text-sev-high">
          <ShieldAlert className="w-3 h-3" />
          {warningCount} feature{warningCount > 1 ? 's' : ''} near limit
        </div>
      )}
      <button className="ml-auto px-3 py-1.5 text-xs font-medium rounded-lg border border-accent text-accent hover:bg-accent/10 transition-colors">
        Upgrade Plan
      </button>
    </div>
  )
}

// ─── Main Export ────────────────────────────────────────────

export function TenantUsagePanel() {
  const { features, isLoading, isDemo } = useFeatureLimits()

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" data-testid="usage-skeleton">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-28 rounded-lg bg-bg-elevated border border-border animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="tenant-usage-panel">
      {isDemo && (
        <div className="text-[10px] text-sev-medium px-2 py-1 rounded bg-sev-medium/10 border border-sev-medium/20 inline-block">
          Demo data — connect API for live usage
        </div>
      )}

      <UsageSummaryHeader features={features} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" data-testid="usage-cards-grid">
        {features.map(entry => (
          <FeatureUsageCard key={entry.featureKey} entry={entry} />
        ))}
      </div>
    </div>
  )
}
