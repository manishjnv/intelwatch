/**
 * @module pages/EnrichmentPage
 * @description AI Enrichment management page — replaces ComingSoonPage.
 * Sections: stats bar, pending queue, batch enrichment, cost dashboard,
 * budget gauge, cache hit rate, re-enrichment scheduler.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  useEnrichmentStats, useEnrichmentPending, useTriggerEnrichment,
  useBatchEnrichment, useCostStats, useBudgetStatus,
  type PendingIOC,
} from '@/hooks/use-enrichment-data'
import { DataTable, type Column, type Density } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { EntityChip } from '@etip/shared-ui/components/EntityChip'
import { SeverityBadge } from '@etip/shared-ui/components/SeverityBadge'
import { TooltipHelp } from '@etip/shared-ui/components/TooltipHelp'
import {
  Brain, Zap, Clock, DollarSign, BarChart3,
  RefreshCw, Play, CheckCircle, XCircle, Layers,
} from 'lucide-react'

// ─── Budget Gauge ──────────────────────────────────────────────

function BudgetGauge({ spent, limit, percent }: { spent: number; limit: number; percent: number }) {
  const color = percent >= 90 ? 'bg-sev-critical' : percent >= 70 ? 'bg-sev-high' : percent >= 50 ? 'bg-sev-medium' : 'bg-accent'
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">Budget Usage</span>
        <span className="text-text-primary font-medium tabular-nums">${spent.toFixed(2)} / ${limit.toFixed(2)}</span>
      </div>
      <div className="h-2 bg-bg-elevated rounded-full overflow-hidden border border-border">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <p className="text-[10px] text-text-muted text-right">{percent.toFixed(1)}% used</p>
    </div>
  )
}

// ─── Cost Chart (simple bar) ──────────────────────────────────

function CostBarChart({ data, label }: { data: Record<string, { count: number; costUsd: number }>; label: string }) {
  const entries = Object.entries(data)
  const maxCost = Math.max(...entries.map(([, v]) => v.costUsd), 0.001)

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-text-muted uppercase font-medium">{label}</p>
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="text-xs text-text-secondary w-24 truncate" title={key}>{key}</span>
          <div className="flex-1 h-4 bg-bg-elevated rounded overflow-hidden border border-border">
            <div
              className="h-full bg-accent/60 rounded transition-all duration-300"
              style={{ width: `${(val.costUsd / maxCost) * 100}%` }}
            />
          </div>
          <span className="text-xs text-text-primary tabular-nums w-16 text-right">${val.costUsd.toFixed(4)}</span>
          <span className="text-[10px] text-text-muted w-12 text-right">{val.count}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Map backend IOC types to EntityChip types ──────────────────

function toChipType(iocType: string): string {
  if (iocType === 'hash_sha256') return 'file_hash_sha256'
  if (iocType === 'hash_sha1') return 'file_hash_sha1'
  if (iocType === 'hash_md5') return 'file_hash_md5'
  return iocType
}

// ─── Main Component ─────────────────────────────────────────────

export function EnrichmentPage() {
  const [pendingPage, setPendingPage] = useState(1)
  const [density, setDensity] = useState<Density>('compact')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: stats, isDemo: isStatsDemo } = useEnrichmentStats()
  const { data: pendingData, isLoading: pendingLoading } = useEnrichmentPending(pendingPage)
  const { data: costStats, isDemo: isCostDemo } = useCostStats()
  const { data: budget } = useBudgetStatus()
  const triggerMutation = useTriggerEnrichment()
  const batchMutation = useBatchEnrichment()

  const isDemo = isStatsDemo || isCostDemo

  const pendingRows = useMemo(() => pendingData?.data ?? [], [pendingData])

  const handleTrigger = (iocId: string) => {
    triggerMutation.mutate(iocId)
  }

  const handleBatchEnrich = () => {
    if (selectedIds.size === 0) return
    batchMutation.mutate(Array.from(selectedIds))
    setSelectedIds(new Set())
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === pendingRows.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pendingRows.map(r => r.id)))
    }
  }

  const pendingColumns: Column<PendingIOC>[] = [
    {
      key: 'select', label: '', width: '5%',
      render: (row) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.id)}
          onChange={() => toggleSelect(row.id)}
          className="accent-accent"
        />
      ),
    },
    {
      key: 'normalizedValue', label: 'IOC', sortable: true, width: '35%',
      render: (row) => (
        <EntityChip type={toChipType(row.iocType) as any} value={row.normalizedValue} />
      ),
    },
    {
      key: 'iocType', label: 'Type', width: '12%',
      render: (row) => <span className="text-text-muted uppercase text-[10px] font-mono">{row.iocType}</span>,
    },
    {
      key: 'severity', label: 'Severity', width: '12%',
      render: (row) => <SeverityBadge severity={row.severity.toUpperCase() as any} />,
    },
    {
      key: 'confidence', label: 'Conf', width: '10%',
      render: (row) => <span className="tabular-nums">{row.confidence}%</span>,
    },
    {
      key: 'createdAt', label: 'Queued', width: '15%',
      render: (row) => <span className="text-text-muted tabular-nums">{new Date(row.createdAt).toLocaleDateString()}</span>,
    },
    {
      key: 'actions', label: '', width: '11%',
      render: (row) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleTrigger(row.id) }}
          disabled={triggerMutation.isPending}
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
        >
          <Play className="w-3 h-3" />
          Enrich
        </button>
      ),
    },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Demo banner */}
      {isDemo && (
        <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">Demo</span>
          <span className="text-xs text-[var(--text-muted)]">Demo data — connect backend for live enrichment</span>
        </div>
      )}

      {/* Stats bar */}
      <PageStatsBar>
        <CompactStat icon={<Brain className="w-3 h-3" />} label="Total IOCs" value={stats?.total?.toLocaleString() ?? '—'} />
        <CompactStat icon={<CheckCircle className="w-3 h-3" />} label="Enriched" value={stats?.enriched?.toLocaleString() ?? '0'} color="text-sev-low" />
        <CompactStat icon={<Clock className="w-3 h-3" />} label="Pending" value={stats?.pending?.toLocaleString() ?? '0'} color="text-accent" />
        <CompactStat icon={<XCircle className="w-3 h-3" />} label="Failed" value={stats?.failed?.toLocaleString() ?? '0'} color="text-sev-critical" />
        <CompactStat icon={<Zap className="w-3 h-3" />} label="Today" value={stats?.enrichedToday?.toLocaleString() ?? '0'} color="text-sev-medium" />
        <CompactStat icon={<BarChart3 className="w-3 h-3" />} label="Avg Quality" value={stats?.avgQualityScore != null ? `${stats.avgQualityScore}%` : '—'} />
        <CompactStat icon={<Layers className="w-3 h-3" />} label="Cache Hit" value={stats?.cacheHitRate != null ? `${(stats.cacheHitRate * 100).toFixed(0)}%` : '—'} />
      </PageStatsBar>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* ─── Cost Dashboard ──────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-text-primary">Cost Dashboard</h2>
            <TooltipHelp message="Shows AI enrichment costs across all providers. VT and AbuseIPDB are free-tier. Haiku triage uses Claude API tokens." />
          </div>

          {/* Headline + budget */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {/* Headline card */}
            <div className="p-4 bg-bg-secondary rounded-lg border border-border">
              <p className="text-text-muted text-xs mb-1">Total Cost</p>
              <p className="text-xl font-bold text-text-primary">
                {costStats?.headline ?? '—'}
              </p>
              <p className="text-[10px] text-text-muted mt-1">
                {costStats?.totalTokens?.toLocaleString() ?? 0} tokens used
              </p>
            </div>

            {/* Budget gauge */}
            {budget && (
              <div className="p-4 bg-bg-secondary rounded-lg border border-border">
                <BudgetGauge spent={budget.currentSpendUsd} limit={budget.dailyLimitUsd} percent={budget.percentUsed} />
                {budget.isOverBudget && (
                  <p className="text-[10px] text-sev-critical mt-1 font-medium">Budget exceeded — fallback to rule-based enrichment</p>
                )}
              </div>
            )}

            {/* Cache + scheduler */}
            <div className="p-4 bg-bg-secondary rounded-lg border border-border space-y-3">
              <div>
                <p className="text-text-muted text-xs">Cache Hit Rate</p>
                <p className="text-lg font-bold text-text-primary tabular-nums">
                  {stats?.cacheHitRate != null ? `${(stats.cacheHitRate * 100).toFixed(1)}%` : '—'}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs">Re-enrichment Scheduler</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <RefreshCw className="w-3 h-3 text-sev-low" />
                  <span className="text-xs text-sev-low">Active</span>
                  <span className="text-[10px] text-text-muted">— hourly scan, type-specific TTLs</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cost charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {costStats?.byProvider && (
              <div className="p-4 bg-bg-secondary rounded-lg border border-border">
                <CostBarChart data={costStats.byProvider} label="Cost by Provider" />
              </div>
            )}
            {costStats?.byIOCType && (
              <div className="p-4 bg-bg-secondary rounded-lg border border-border">
                <CostBarChart data={costStats.byIOCType} label="Cost by IOC Type" />
              </div>
            )}
          </div>
        </div>

        {/* ─── Pending Enrichment Queue ────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-text-primary">Pending Queue</h2>
              <TooltipHelp message="IOCs waiting to be enriched. Click 'Enrich' to trigger AI analysis for individual IOCs, or select multiple and use 'Batch Enrich'." />
              <span className="text-xs text-text-muted">({pendingData?.total ?? 0} total)</span>
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <button
                  onClick={handleBatchEnrich}
                  disabled={batchMutation.isPending}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  <Zap className={cn('w-3 h-3', batchMutation.isPending && 'animate-spin')} />
                  Batch Enrich ({selectedIds.size})
                </button>
              )}
              {pendingRows.length > 0 && (
                <button
                  onClick={selectAll}
                  className="text-xs px-2 py-1 rounded border border-border text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors"
                >
                  {selectedIds.size === pendingRows.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>
          </div>

          {batchMutation.isSuccess && (
            <div className="flex items-center gap-2 p-2 mb-3 bg-sev-low/5 border border-sev-low/20 rounded-lg text-xs text-green-300">
              <CheckCircle className="w-3 h-3" />
              Batch enrichment submitted successfully
            </div>
          )}

          <DataTable
            columns={pendingColumns}
            data={pendingRows}
            loading={pendingLoading}
            rowKey={(r) => r.id}
            density={density}
            emptyMessage="No IOCs pending enrichment. All caught up!"
          />

          {(pendingData?.total ?? 0) > 20 && (
            <Pagination
              page={pendingPage} limit={20} total={pendingData?.total ?? 0}
              onPageChange={setPendingPage}
              density={density}
              onDensityChange={setDensity}
            />
          )}
        </div>
      </div>
    </div>
  )
}
