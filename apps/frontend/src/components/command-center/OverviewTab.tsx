/**
 * @module components/command-center/OverviewTab
 * @description Tab 1: Overview — role-switched.
 * Super-admin: CostTimeline, CostByFeedType, CostByModel, SubtaskHeatmap.
 * Tenant-admin: ConsumptionTimeline, CostByProvider donut, CostByIOCType, BudgetGauge.
 * Free-tier: upgrade prompt, $0.00 cost, "AI not active" messaging.
 */
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { useCommandCenter } from '@/hooks/use-command-center'
import { AreaChart, HorizontalBarChart, DonutChart, HeatmapGrid, BudgetBar, MiniSparkline } from './charts'
import { TrendingUp, Zap } from 'lucide-react'

// ─── Provider Colors ───────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#8b5cf6',
  openai: '#10b981',
  google: '#f59e0b',
}

const SUBTASK_COLORS: Record<string, string> = {
  triage: '#a78bfa',
  extraction: '#34d399',
  classification: '#fbbf24',
  summarization: '#60a5fa',
  risk_scoring: '#f87171',
}

function formatUsd(v: number): string {
  return `$${v.toFixed(2)}`
}

function formatSubtask(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

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

// ─── Super-Admin View ──────────────────────────────────────────

interface OverviewTabProps {
  data: ReturnType<typeof useCommandCenter>
}

function SuperAdminOverview({ data }: OverviewTabProps) {
  const { globalStats } = data

  // Cost timeline points
  const costTimelinePoints = useMemo(() =>
    globalStats.costTrend.map(t => ({
      label: t.date.slice(5), // MM-DD
      value: t.cost,
    })), [globalStats.costTrend])

  // Cost by feed type (derived from costBySubtask)
  const feedTypeBars = useMemo(() =>
    Object.entries(globalStats.costBySubtask).map(([key, val]) => ({
      label: formatSubtask(key),
      value: val,
      color: SUBTASK_COLORS[key],
    })), [globalStats.costBySubtask])

  // Cost by model (grouped by provider)
  const modelBars = useMemo(() =>
    Object.entries(globalStats.costByModel).map(([model, cost]) => {
      const provider = model.includes('claude') ? 'anthropic'
        : model.includes('gpt') || model.includes('o3') ? 'openai'
        : 'google'
      return { label: model, value: cost, color: PROVIDER_COLORS[provider] }
    }), [globalStats.costByModel])

  // Heatmap: subtask rows × day columns
  const heatmapData = useMemo(() => {
    const subtasks = Object.keys(globalStats.costBySubtask)
    const days = globalStats.costTrend.map(t => t.date.slice(5))
    const cells = subtasks.flatMap(sub => {
      const subCost = globalStats.costBySubtask[sub] ?? 0
      const totalCost = Object.values(globalStats.costBySubtask).reduce((a, b) => a + b, 0) || 1
      const ratio = subCost / totalCost
      return days.map((day, di) => ({
        row: sub,
        col: day,
        value: Number(((globalStats.costTrend[di]?.cost ?? 0) * ratio).toFixed(2)),
      }))
    })
    return { cells, rows: subtasks, cols: days }
  }, [globalStats])

  // KPI sparkline values from cost trend
  const costSparkValues = useMemo(() =>
    globalStats.costTrend.map(t => t.cost), [globalStats.costTrend])

  return (
    <div data-testid="overview-tab" className="space-y-4 max-w-6xl">
      {/* KPI Cards row */}
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

      {/* Cost Timeline — full width */}
      <ChartCard title="Cost Timeline" testId="chart-cost-timeline">
        <AreaChart points={costTimelinePoints} height={180} color="#8b5cf6"
          formatValue={formatUsd} />
      </ChartCard>

      {/* 2-col grid: Cost by Subtask + Cost by Model */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Cost by Subtask" testId="chart-cost-by-subtask">
          <HorizontalBarChart items={feedTypeBars} formatValue={formatUsd} />
        </ChartCard>
        <ChartCard title="Cost by Model" testId="chart-cost-by-model">
          <HorizontalBarChart items={modelBars} formatValue={formatUsd} />
        </ChartCard>
      </div>

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
  const isFree = tenantPlan === 'free'

  // Consumption timeline
  const consumptionPoints = useMemo(() =>
    tenantStats.consumptionTrend.map(t => ({
      label: t.date.slice(5),
      value: t.count,
    })), [tenantStats.consumptionTrend])

  // Cost by provider donut
  const providerSegments = useMemo(() =>
    Object.entries(tenantStats.costByProvider).map(([prov, cost]) => ({
      label: prov.charAt(0).toUpperCase() + prov.slice(1),
      value: cost,
      color: PROVIDER_COLORS[prov] ?? '#6b7280',
    })), [tenantStats.costByProvider])

  // Cost by IOC type bars
  const iocTypeBars = useMemo(() =>
    Object.entries(tenantStats.costByItemType).map(([type, cost]) => ({
      label: type.toUpperCase(),
      value: cost,
    })), [tenantStats.costByItemType])

  // Consumption sparkline
  const consumptionSparkValues = useMemo(() =>
    tenantStats.consumptionTrend.slice(-7).map(t => t.count), [tenantStats.consumptionTrend])

  if (isFree) {
    return (
      <div data-testid="overview-tab" className="space-y-4 max-w-4xl">
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
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-lg font-bold text-text-primary">$0.00</p>
              <p className="text-[10px] text-text-muted">AI Cost</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-text-primary">0</p>
              <p className="text-[10px] text-text-muted">Items Enriched</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-text-primary">0%</p>
              <p className="text-[10px] text-text-muted">Budget Used</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="overview-tab" className="space-y-4 max-w-6xl">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Items Consumed" value={tenantStats.itemsConsumed.toLocaleString()}
          sparkline={consumptionSparkValues} color="text-accent" testId="kpi-consumed" />
        <KpiCard label="AI Cost" value={formatUsd(tenantStats.attributedCostUsd)}
          color="text-purple-400" testId="kpi-tenant-cost" />
        <KpiCard label="Budget Limit" value={formatUsd(tenantStats.budgetLimitUsd)}
          color="text-sev-low" testId="kpi-budget-limit" />
        <KpiCard label="Budget Used" value={`${tenantStats.budgetUsedPercent}%`}
          color={tenantStats.budgetUsedPercent > 80 ? 'text-sev-high' : 'text-sev-low'}
          testId="kpi-budget-used" />
      </div>

      {/* Consumption Timeline — full width */}
      <ChartCard title="Consumption Over Time" testId="chart-consumption-timeline">
        <AreaChart points={consumptionPoints} height={160} color="var(--accent)" />
      </ChartCard>

      {/* 2-col: Donut + IOC type bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard title="Cost by Provider" testId="chart-cost-by-provider">
          <DonutChart
            segments={providerSegments}
            centerValue={formatUsd(tenantStats.attributedCostUsd)}
            centerLabel="Total"
          />
        </ChartCard>
        <ChartCard title="Cost by Item Type" testId="chart-cost-by-ioc-type">
          <HorizontalBarChart items={iocTypeBars} formatValue={formatUsd} />
        </ChartCard>
      </div>

      {/* Budget Gauge — full width */}
      <ChartCard title="Budget Usage" testId="chart-budget-gauge">
        <BudgetBar usedPercent={tenantStats.budgetUsedPercent}
          label={`${formatUsd(tenantStats.attributedCostUsd)} of ${formatUsd(tenantStats.budgetLimitUsd)} used`} />
      </ChartCard>
    </div>
  )
}

// ─── KPI Card ──────────────────────────────────────────────────

function KpiCard({ label, value, sparkline, color, testId }: {
  label: string; value: string; sparkline?: number[]; color?: string; testId: string
}) {
  return (
    <div className="p-3 bg-bg-secondary rounded-lg border border-border" data-testid={testId}>
      <p className="text-[10px] text-text-muted mb-1">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <span className={cn('text-lg font-bold tabular-nums', color ?? 'text-text-primary')}>
          {value}
        </span>
        {sparkline && sparkline.length >= 2 && (
          <MiniSparkline values={sparkline} />
        )}
      </div>
    </div>
  )
}

// ─── Exported Tab Component ────────────────────────────────────

export function OverviewTab({ data }: OverviewTabProps) {
  if (data.isSuperAdmin) {
    return <SuperAdminOverview data={data} />
  }
  return <TenantAdminOverview data={data} />
}
