/**
 * @module components/command-center/QueueTab
 * @description Tab 3: AI processing queue management — health bar,
 * queue depth chart, pending items table with batch enrich.
 */
import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { useCommandCenter } from '@/hooks/use-command-center'
import {
  useEnrichmentPending, useTriggerEnrichment, useBatchEnrichment,
  type PendingIOC,
} from '@/hooks/use-enrichment-data'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { EntityChip } from '@etip/shared-ui/components/EntityChip'
import { SeverityBadge } from '@etip/shared-ui/components/SeverityBadge'
import {
  Activity, Zap, AlertTriangle, Clock,
  Play, CheckCircle,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────

interface QueueTabProps {
  data: ReturnType<typeof useCommandCenter>
}

// ─── Queue Health Bar ───────────────────────────────────────────

function QueueHealthBar({ stats }: { stats: ReturnType<typeof useCommandCenter>['queueStats'] }) {
  const items = [
    { label: 'Pending', value: String(stats.pendingItems), icon: <Clock className="w-3 h-3" />, color: stats.pendingItems > 50 ? 'text-sev-high' : 'text-text-primary' },
    { label: 'Rate', value: `${stats.processingRate}/min`, icon: <Zap className="w-3 h-3" />, color: 'text-sev-low' },
    { label: 'Stuck', value: String(stats.stuckItems ?? 0), icon: <AlertTriangle className="w-3 h-3" />, color: (stats.stuckItems ?? 0) > 0 ? 'text-sev-critical' : 'text-text-primary' },
    { label: 'Age', value: stats.oldestAge ?? '—', icon: <Activity className="w-3 h-3" />, color: 'text-text-primary' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="queue-health-bar">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-2 p-3 bg-bg-elevated rounded-lg border border-border">
          <span className="text-text-muted">{item.icon}</span>
          <div>
            <p className="text-[10px] text-text-muted">{item.label}</p>
            <p className={cn('text-sm font-bold tabular-nums', item.color)}>{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Queue Depth Chart ──────────────────────────────────────────

function QueueDepthChart({ bySubtask }: { bySubtask: Record<string, number> }) {
  const entries = Object.entries(bySubtask).sort((a, b) => b[1] - a[1])
  const max = Math.max(...entries.map(([, v]) => v), 1)

  const SUBTASK_COLORS: Record<string, string> = {
    triage: 'bg-purple-400', extraction: 'bg-accent', scoring: 'bg-sev-medium',
    attribution: 'bg-cyan-400', others: 'bg-text-muted',
  }

  return (
    <div className="space-y-2" data-testid="queue-depth-chart">
      <p className="text-xs text-text-muted font-medium">Queue Depth by Subtask</p>
      {entries.map(([subtask, count]) => (
        <div key={subtask} className="flex items-center gap-2">
          <span className="text-xs text-text-secondary w-24 truncate capitalize">{subtask}</span>
          <div className="flex-1 h-5 bg-bg-elevated rounded overflow-hidden border border-border">
            <div
              className={cn('h-full rounded transition-all duration-300', SUBTASK_COLORS[subtask] ?? 'bg-accent/60')}
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
          <span className="text-xs text-text-primary tabular-nums w-8 text-right">{count}</span>
        </div>
      ))}
    </div>
  )
}

// ─── IOC type mapping ───────────────────────────────────────────

function toChipType(iocType: string): string {
  if (iocType === 'hash_sha256') return 'file_hash_sha256'
  if (iocType === 'hash_sha1') return 'file_hash_sha1'
  if (iocType === 'hash_md5') return 'file_hash_md5'
  return iocType
}

// ─── Queue Tab ──────────────────────────────────────────────────

export function QueueTab({ data }: QueueTabProps) {
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: pendingData, isLoading: pendingLoading } = useEnrichmentPending(page)
  const triggerMutation = useTriggerEnrichment()
  const batchMutation = useBatchEnrichment()

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

  const columns: Column<PendingIOC>[] = [
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
      key: 'normalizedValue', label: 'IOC', sortable: true, width: '30%',
      render: (row) => <EntityChip type={toChipType(row.iocType) as any} value={row.normalizedValue} />,
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
      render: (row) => {
        const ago = Date.now() - new Date(row.createdAt).getTime()
        const mins = Math.round(ago / 60_000)
        return <span className="text-text-muted tabular-nums text-xs">{mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`}</span>
      },
    },
    {
      key: 'actions', label: '', width: '11%',
      render: (row) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleTrigger(row.id) }}
          disabled={triggerMutation.isPending}
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
        >
          <Play className="w-3 h-3" /> Enrich
        </button>
      ),
    },
  ]

  return (
    <div data-testid="queue-tab" className="space-y-6 max-w-6xl">
      {/* Queue Health Bar */}
      <QueueHealthBar stats={data.queueStats} />

      {/* Queue Depth Chart */}
      <div className="p-4 bg-bg-secondary rounded-lg border border-border">
        <QueueDepthChart bySubtask={data.queueStats.bySubtask} />
      </div>

      {/* Pending Items Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold text-text-primary">Pending Items</h3>
            <span className="text-xs text-text-muted">({pendingData?.total ?? data.queueStats.pendingItems} total)</span>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                data-testid="batch-enrich-btn"
                onClick={handleBatchEnrich}
                disabled={batchMutation.isPending}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                <Zap className={cn('w-3 h-3', batchMutation.isPending && 'animate-spin')} /> Batch Enrich ({selectedIds.size})
              </button>
            )}
            {pendingRows.length > 0 && (
              <button
                data-testid="select-all-btn"
                onClick={selectAll}
                className="text-xs px-2 py-1 rounded border border-border text-text-secondary hover:text-text-primary"
              >
                {selectedIds.size === pendingRows.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>
        </div>

        {batchMutation.isSuccess && (
          <div className="flex items-center gap-2 p-2 mb-3 bg-sev-low/5 border border-sev-low/20 rounded-lg text-xs text-green-300">
            <CheckCircle className="w-3 h-3" /> Batch enrichment submitted successfully
          </div>
        )}

        <DataTable
          columns={columns}
          data={pendingRows}
          loading={pendingLoading}
          rowKey={(r) => r.id}
          density="compact"
          emptyMessage="No items pending enrichment. Queue is clear!"
        />

        {(pendingData?.total ?? 0) > 20 && (
          <Pagination
            page={page} limit={20} total={pendingData?.total ?? 0}
            onPageChange={setPage}
            density="compact"
          />
        )}
      </div>
    </div>
  )
}
