/**
 * @module components/command-center/OverviewTab
 * @description Tab 1: Overview — role-switched.
 * Super-admin: KPIs, CostTimeline, CostBySubtask, CostByModel, Queue Health, Queue Depth, Heatmap.
 * Tenant-admin: User info card, usage/quota dashboard, consumption timeline, budget gauge.
 * Free-tier: upgrade prompt.
 */
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import type { useCommandCenter } from '@/hooks/use-command-center'
import { AreaChart, HorizontalBarChart, HeatmapGrid, BudgetBar, MiniSparkline } from './charts'
import {
  TrendingUp, Zap, Clock, AlertTriangle, Activity,
  Building2, CreditCard,
} from 'lucide-react'

// ─── Provider / Subtask Colors ─────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#8b5cf6', openai: '#10b981', google: '#f59e0b',
}

const SUBTASK_COLORS: Record<string, string> = {
  triage: '#a78bfa', extraction: '#34d399', classification: '#fbbf24',
  summarization: '#60a5fa', risk_scoring: '#f87171',
}

const QUEUE_SUBTASK_BG: Record<string, string> = {
  triage: 'bg-purple-400', extraction: 'bg-accent', scoring: 'bg-sev-medium',
  attribution: 'bg-cyan-400', others: 'bg-text-muted',
}

function formatUsd(v: number): string { return `$${v.toFixed(2)}` }
function formatSubtask(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Shared Components ─────────────────────────────────────────

function ChartCard({ title, children, testId, className }: {
  title: string; children: React.ReactNode; testId: string; className?: string
}) {
  return (
    <div className={cn('p-4 bg-bg-secondary rounded-lg border border-border', className)} data-testid={testId}>
      <h4 className="text-xs font-semibold text-text-primary mb-3">{title}</h4>
      {children}
    </div>
  )
}

function KpiCard({ label, value, sparkline, color, testId }: {
  label: string; value: string; sparkline?: number[]; color?: string; testId: string
}) {
  return (
    <div className="p-3 bg-bg-secondary rounded-lg border border-border" data-testid={testId}>
      <p className="text-[10px] text-text-muted mb-1">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <span className={cn('text-lg font-bold tabular-nums', color ?? 'text-text-primary')}>{value}</span>
        {sparkline && sparkline.length >= 2 && <MiniSparkline values={sparkline} />}
      </div>
    </div>
  )
}

// ─── Queue Health Section (super-admin only) ───────────────────

function QueueHealthSection({ stats }: { stats: ReturnType<typeof useCommandCenter>['queueStats'] }) {
  const items = [
    { label: 'Pending', value: String(stats.pendingItems), icon: <Clock className="w-3 h-3" />, color: stats.pendingItems > 50 ? 'text-sev-high' : 'text-text-primary' },
    { label: 'Rate', value: `${stats.processingRate}/min`, icon: <Zap className="w-3 h-3" />, color: 'text-sev-low' },
    { label: 'Stuck', value: String(stats.stuckItems ?? 0), icon: <AlertTriangle className="w-3 h-3" />, color: (stats.stuckItems ?? 0) > 0 ? 'text-sev-critical' : 'text-text-primary' },
    { label: 'Age', value: stats.oldestAge ?? '—', icon: <Activity className="w-3 h-3" />, color: 'text-text-primary' },
  ]

  const entries = Object.entries(stats.bySubtask).sort((a, b) => b[1] - a[1])
  const max = Math.max(...entries.map(([, v]) => v), 1)

  return (
    <ChartCard title="Queue Status" testId="queue-status-section">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-2 p-2 bg-bg-elevated rounded-lg border border-border">
            <span className="text-text-muted">{item.icon}</span>
            <div>
              <p className="text-[10px] text-text-muted">{item.label}</p>
              <p className={cn('text-sm font-bold tabular-nums', item.color)}>{item.value}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-text-muted font-medium mb-2">Queue Depth by Subtask</p>
      <div className="space-y-1.5">
        {entries.map(([subtask, count]) => (
          <div key={subtask} className="flex items-center gap-2">
            <span className="text-xs text-text-secondary w-20 truncate capitalize">{subtask}</span>
            <div className="flex-1 h-4 bg-bg-elevated rounded overflow-hidden border border-border">
              <div
                className={cn('h-full rounded transition-all duration-300', QUEUE_SUBTASK_BG[subtask] ?? 'bg-accent/60')}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs text-text-primary tabular-nums w-8 text-right">{count}</span>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}

// ─── Super-Admin View ──────────────────────────────────────────

interface OverviewTabProps {
  data: ReturnType<typeof useCommandCenter>
}

function SuperAdminOverview({ data }: OverviewTabProps) {
  const { globalStats, queueStats } = data

  const costTimelinePoints = useMemo(() =>
    globalStats.costTrend.map(t => ({ label: t.date.slice(5), value: t.cost })),
    [globalStats.costTrend])

  const feedTypeBars = useMemo(() =>
    Object.entries(globalStats.costBySubtask).map(([key, val]) => ({
      label: formatSubtask(key), value: val, color: SUBTASK_COLORS[key],
    })), [globalStats.costBySubtask])

  const modelBars = useMemo(() =>
    Object.entries(globalStats.costByModel).map(([model, cost]) => {
      const provider = model.includes('claude') ? 'anthropic'
        : model.includes('gpt') || model.includes('o3') ? 'openai' : 'google'
      return { label: model, value: cost, color: PROVIDER_COLORS[provider] }
    }), [globalStats.costByModel])

  const heatmapData = useMemo(() => {
    const subtasks = Object.keys(globalStats.costBySubtask)
    const days = globalStats.costTrend.map(t => t.date.slice(5))
    const totalCost = Object.values(globalStats.costBySubtask).reduce((a, b) => a + b, 0) || 1
    const cells = subtasks.flatMap(sub => {
      const ratio = (globalStats.costBySubtask[sub] ?? 0) / totalCost
      return days.map((day, di) => ({
        row: sub, col: day,
        value: Number(((globalStats.costTrend[di]?.cost ?? 0) * ratio).toFixed(2)),
      }))
    })
    return { cells, rows: subtasks, cols: days }
  }, [globalStats])

  const costSparkValues = useMemo(() =>
    globalStats.costTrend.map(t => t.cost), [globalStats.costTrend])

  return (
    <div data-testid="overview-tab" className="space-y-4 max-w-6xl">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total AI Cost" value={formatUsd(globalStats.totalCostUsd)}
          sparkline={costSparkValues} color="text-purple-400" testId="kpi-total-cost" />
        <KpiCard label="Items Processed" value={globalStats.totalItems.toLocaleString()}
          color="text-accent" testId="kpi-total-items" />
        <KpiCard label="Providers Active"
          value={String(Object.keys(globalStats.costByProvider).filter(k => globalStats.costByProvider[k] > 0).length)}
          color="text-sev-low" testId="kpi-providers" />
        <KpiCard label="Subtasks" value={String(Object.keys(globalStats.costBySubtask).length)}
          color="text-cyan-400" testId="kpi-subtasks" />
      </div>

      {/* Cost Timeline */}
      <ChartCard title="Cost Timeline" testId="chart-cost-timeline">
        <AreaChart points={costTimelinePoints} height={180} color="#8b5cf6" formatValue={formatUsd} />
      </ChartCard>

      {/* Cost by Subtask + Cost by Model */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Cost by Subtask" testId="chart-cost-by-subtask">
          <HorizontalBarChart items={feedTypeBars} formatValue={formatUsd} />
        </ChartCard>
        <ChartCard title="Cost by Model" testId="chart-cost-by-model">
          <HorizontalBarChart items={modelBars} formatValue={formatUsd} />
        </ChartCard>
      </div>

      {/* Queue Status (merged from Queue tab) */}
      <QueueHealthSection stats={queueStats} />

      {/* Subtask Heatmap */}
      <ChartCard title="Subtask Cost Heatmap" testId="chart-subtask-heatmap">
        <HeatmapGrid cells={heatmapData.cells} rows={heatmapData.rows}
          cols={heatmapData.cols} formatValue={formatUsd} />
      </ChartCard>
    </div>
  )
}

// ─── Tenant-Admin View ─────────────────────────────────────────

function TenantAdminOverview({ data }: OverviewTabProps) {
  const { tenantStats, tenantPlan } = data
  const user = useAuthStore(s => s.user)
  const tenant = useAuthStore(s => s.tenant)
  const isFree = tenantPlan === 'free'

  const consumptionPoints = useMemo(() =>
    tenantStats.consumptionTrend.map(t => ({ label: t.date.slice(5), value: t.count })),
    [tenantStats.consumptionTrend])

  const consumptionSparkValues = useMemo(() =>
    tenantStats.consumptionTrend.slice(-7).map(t => t.count), [tenantStats.consumptionTrend])

  if (isFree) {
    return (
      <div data-testid="overview-tab" className="space-y-4 max-w-4xl">
        <TenantUserCard user={user} tenant={tenant} plan="Free" />
        <div className="p-6 bg-bg-secondary rounded-lg border border-border text-center">
          <Zap className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-40" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">AI Not Active</h3>
          <p className="text-sm text-text-muted mb-4">
            AI-powered enrichment is not included in the Free tier. Upgrade to Starter or higher
            to unlock automated triage, extraction, and scoring.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand/10 text-brand rounded-lg text-sm font-medium">
            <TrendingUp className="w-4 h-4" /> Upgrade Plan
          </div>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="overview-tab" className="space-y-4 max-w-6xl">
      {/* User & Org Info */}
      <TenantUserCard user={user} tenant={tenant} plan={tenantPlan} />

      {/* Usage KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Items Consumed" value={tenantStats.itemsConsumed.toLocaleString()}
          sparkline={consumptionSparkValues} color="text-accent" testId="kpi-consumed" />
        <KpiCard label="Budget Limit" value={formatUsd(tenantStats.budgetLimitUsd)}
          color="text-sev-low" testId="kpi-budget-limit" />
        <KpiCard label="Budget Used" value={`${tenantStats.budgetUsedPercent}%`}
          color={tenantStats.budgetUsedPercent > 80 ? 'text-sev-high' : 'text-sev-low'}
          testId="kpi-budget-used" />
        <KpiCard label="Plan" value={tenantPlan.charAt(0).toUpperCase() + tenantPlan.slice(1)}
          color="text-purple-400" testId="kpi-plan" />
      </div>

      {/* Consumption Timeline */}
      <ChartCard title="Usage Over Time" testId="chart-consumption-timeline">
        <AreaChart points={consumptionPoints} height={160} color="var(--accent)" />
      </ChartCard>

      {/* Budget Gauge */}
      <ChartCard title="Budget Usage" testId="chart-budget-gauge">
        <BudgetBar usedPercent={tenantStats.budgetUsedPercent}
          label={`${formatUsd(tenantStats.attributedCostUsd)} of ${formatUsd(tenantStats.budgetLimitUsd)} used`} />
      </ChartCard>
    </div>
  )
}

// ─── Tenant User Card ──────────────────────────────────────────

function TenantUserCard({ user, tenant, plan }: {
  user: { displayName: string; email: string; role: string; avatarUrl: string | null } | null
  tenant: { name: string; slug: string } | null
  plan: string
}) {
  const initials = (user?.displayName ?? 'U').split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1)

  return (
    <div className="flex items-center gap-4 p-4 bg-bg-secondary rounded-lg border border-border" data-testid="tenant-user-card">
      {user?.avatarUrl ? (
        <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-full border border-border" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-bold">
          {initials}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-text-primary truncate">{user?.displayName ?? 'User'}</p>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-medium">{planLabel}</span>
        </div>
        <p className="text-xs text-text-muted truncate">{user?.email}</p>
      </div>
      <div className="hidden sm:flex items-center gap-3 text-xs text-text-secondary">
        <div className="flex items-center gap-1">
          <Building2 className="w-3 h-3" />
          <span>{tenant?.name ?? '—'}</span>
        </div>
        <div className="flex items-center gap-1">
          <CreditCard className="w-3 h-3" />
          <span>{planLabel}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Exported Tab Component ────────────────────────────────────

export function OverviewTab({ data }: OverviewTabProps) {
  if (data.isSuperAdmin) return <SuperAdminOverview data={data} />
  return <TenantAdminOverview data={data} />
}
