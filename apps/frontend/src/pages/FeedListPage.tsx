/**
 * @module pages/FeedListPage
 * @description Feed management page — shows active feeds with health status,
 * last fetch time, reliability gauge, and error indicators.
 * UX improvements: animated status dot, feed type icons, next-fetch countdown,
 * inline error details with failure context, row tinting, retry button.
 */
import { useState, useMemo } from 'react'
import { useFeeds, type FeedRecord } from '@/hooks/use-intel-data'
import { DataTable, type Column, type Density } from '@/components/data/DataTable'
import { FilterBar, type FilterOption } from '@/components/data/FilterBar'
import { Pagination } from '@/components/data/Pagination'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { Rss, AlertTriangle, CheckCircle, Clock, Globe, Upload, Server, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

const FEED_FILTERS: FilterOption[] = [
  { key: 'feedType', label: 'Type', options: [
    { value: 'rss', label: 'RSS' }, { value: 'stix', label: 'STIX' },
    { value: 'taxii', label: 'TAXII' }, { value: 'misp', label: 'MISP' },
    { value: 'rest_api', label: 'REST API' }, { value: 'csv_upload', label: 'CSV' },
  ]},
  { key: 'status', label: 'Status', options: [
    { value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' },
    { value: 'error', label: 'Error' }, { value: 'disabled', label: 'Disabled' },
  ]},
]

// ─── Feed type icon ───────────────────────────────────────────

function FeedTypeIcon({ type }: { type: string }) {
  const cls = 'w-3.5 h-3.5 flex-shrink-0'
  if (type === 'rss')        return <Rss    className={cn(cls, 'text-orange-400')} />
  if (type === 'rest_api')   return <Globe  className={cn(cls, 'text-blue-400')} />
  if (type === 'csv_upload') return <Upload className={cn(cls, 'text-text-muted')} />
  return <Server className={cn(cls, 'text-purple-400')} />
}

// ─── Animated status dot ──────────────────────────────────────

const STATUS_CONFIG: Record<string, { dot: string; pulse: boolean; label: string; text: string }> = {
  active:   { dot: 'bg-sev-low',       pulse: true,  label: 'Active',   text: 'text-sev-low' },
  error:    { dot: 'bg-sev-critical',  pulse: false, label: 'Error',    text: 'text-sev-critical' },
  disabled: { dot: 'bg-text-muted/40', pulse: false, label: 'Disabled', text: 'text-text-muted' },
  paused:   { dot: 'bg-sev-medium',    pulse: false, label: 'Paused',   text: 'text-sev-medium' },
}

function StatusDot({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] ?? STATUS_CONFIG['disabled']!
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        {c.pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${c.dot} opacity-60`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${c.dot}`} />
      </span>
      <span className={`text-[10px] font-medium ${c.text}`}>{c.label}</span>
    </span>
  )
}

// ─── Next fetch countdown ─────────────────────────────────────

/** Parses common cron patterns → "in Xh Ym". Falls back to raw cron. */
function getNextFireLabel(cron: string | null): string {
  if (!cron) return '—'
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 5) return cron

  const hourField = parts[1] ?? ''
  const now = new Date()
  let nextMs: number | null = null

  // 0 */N * * * — every N hours
  const everyN = hourField.match(/^\*\/(\d+)$/)
  if (everyN) {
    const n = parseInt(everyN[1]!, 10)
    const nextHour = Math.ceil((now.getHours() + 1) / n) * n
    const next = new Date(now)
    if (nextHour >= 24) {
      next.setDate(next.getDate() + 1)
      next.setHours(0, 0, 0, 0)
    } else {
      next.setHours(nextHour, 0, 0, 0)
    }
    nextMs = next.getTime() - now.getTime()
  }

  // 0 H * * * — daily at fixed hour
  const fixedH = hourField.match(/^(\d+)$/)
  if (fixedH && !everyN) {
    const h = parseInt(fixedH[1]!, 10)
    const next = new Date(now)
    next.setHours(h, 0, 0, 0)
    if (next <= now) next.setDate(next.getDate() + 1)
    nextMs = next.getTime() - now.getTime()
  }

  if (nextMs === null) return cron

  const totalMins = Math.floor(nextMs / 60_000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h === 0) return `in ${m}m`
  if (m === 0) return `in ${h}h`
  return `in ${h}h ${m}m`
}

// ─── Reliability bar ──────────────────────────────────────────

function ReliabilityBar({ value }: { value: number }) {
  const color = value >= 70 ? 'bg-sev-low' : value >= 40 ? 'bg-sev-medium' : 'bg-sev-critical'
  return (
    <div className="flex items-center gap-1.5" title={`Reliability: ${value}%`}>
      <div className="w-16 h-1.5 rounded-full bg-bg-elevated overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] tabular-nums text-text-muted">{value}%</span>
    </div>
  )
}

// ─── Time helpers ─────────────────────────────────────────────

function formatTime(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// ─── Page ─────────────────────────────────────────────────────

export function FeedListPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [density, setDensity] = useState<Density>('compact')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const { data, isLoading } = useFeeds({ page: 1, limit: 50 })

  const feeds = data?.data ?? []

  // Client-side filter + sort — works in both demo and live mode
  const displayFeeds = useMemo(() => {
    let result = feeds

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(f =>
        f.name.toLowerCase().includes(q) ||
        (f.description ?? '').toLowerCase().includes(q) ||
        (f.url ?? '').toLowerCase().includes(q),
      )
    }
    if (filters.feedType) result = result.filter(f => f.feedType === filters.feedType)
    if (filters.status)   result = result.filter(f => f.status   === filters.status)

    return [...result].sort((a, b) => {
      const av = a[sortBy as keyof FeedRecord] ?? ''
      const bv = b[sortBy as keyof FeedRecord] ?? ''
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [feeds, search, filters, sortBy, sortOrder])

  function handleSort(key: string) {
    if (sortBy === key) setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortOrder('asc') }
  }

  const activeCount    = feeds.filter(f => f.status === 'active').length
  const errorCount     = feeds.filter(f => f.status === 'error').length
  const totalIngested  = feeds.reduce((s, f) => s + f.totalItemsIngested, 0)
  const avgReliability = feeds.length
    ? Math.round(feeds.reduce((s, f) => s + f.feedReliability, 0) / feeds.length)
    : 0

  const isDimmed = (row: FeedRecord) => !row.enabled || row.status === 'disabled'

  const columns: Column<FeedRecord>[] = [
    {
      key: 'name', label: 'Feed Name', sortable: true, width: '30%',
      render: (row) => (
        <div className={cn('min-w-0', isDimmed(row) && 'opacity-50')}>
          <div className="text-text-primary font-medium truncate">{row.name}</div>
          {row.status !== 'error' && row.description && (
            <div className="text-[10px] text-text-muted truncate max-w-[260px]">{row.description}</div>
          )}
          {row.status === 'error' && (
            <>
              {row.lastErrorMessage && (
                <div
                  className="text-[10px] text-sev-critical truncate max-w-[260px]"
                  title={row.lastErrorMessage}
                >
                  ⚠ {row.lastErrorMessage}
                </div>
              )}
              {row.lastErrorAt && (
                <div className="text-[10px] text-text-muted">
                  failed {formatTime(row.lastErrorAt)} · {row.consecutiveFailures} consecutive
                </div>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      key: 'feedType', label: 'Type', sortable: true, width: '9%',
      render: (row) => (
        <span className={cn('inline-flex items-center gap-1.5', isDimmed(row) && 'opacity-50')}>
          <FeedTypeIcon type={row.feedType} />
          <span className="text-[10px] font-mono uppercase text-text-muted">
            {row.feedType.replace('_', '\u00a0')}
          </span>
        </span>
      ),
    },
    {
      key: 'status', label: 'Status', sortable: true, width: '10%',
      render: (row) => <StatusDot status={row.status} />,
    },
    {
      key: 'feedReliability', label: 'Reliability', sortable: true, width: '12%',
      render: (row) => (
        <span className={isDimmed(row) ? 'opacity-50' : undefined}>
          <ReliabilityBar value={row.feedReliability} />
        </span>
      ),
    },
    {
      key: 'schedule', label: 'Next Fetch', width: '9%',
      render: (row) => (
        <span
          className={cn('text-[10px] tabular-nums', isDimmed(row) ? 'text-text-muted opacity-40' : 'text-text-secondary')}
          title={row.schedule ?? undefined}
        >
          {isDimmed(row) ? '—' : getNextFireLabel(row.schedule)}
        </span>
      ),
    },
    {
      key: 'totalItemsIngested', label: 'Ingested', sortable: true, width: '9%',
      render: (row) => (
        <span className={cn('tabular-nums', isDimmed(row) && 'opacity-50')}>
          {row.totalItemsIngested.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'lastFetchAt', label: 'Last Fetch', sortable: true, width: '10%',
      render: (row) => (
        <span className={cn(
          row.consecutiveFailures > 0 ? 'text-sev-critical' : 'text-text-muted',
          isDimmed(row) && 'opacity-50',
        )}>
          {formatTime(row.lastFetchAt)}
        </span>
      ),
    },
    {
      key: 'consecutiveFailures', label: 'Errors', width: '7%',
      render: (row) => row.consecutiveFailures > 0
        ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="text-sev-critical font-medium tabular-nums">{row.consecutiveFailures}</span>
            <button
              className="text-text-muted hover:text-accent transition-colors"
              title="Retry feed fetch"
              onClick={(e) => e.stopPropagation()}
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </span>
        )
        : <span className="text-text-muted tabular-nums">0</span>,
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <PageStatsBar>
        <CompactStat icon={<Rss className="w-3 h-3" />} label="Total Feeds" value={data?.total?.toString() ?? '—'} />
        <CompactStat icon={<CheckCircle className="w-3 h-3" />} label="Active" value={activeCount.toString()} color="text-sev-low" />
        <CompactStat icon={<AlertTriangle className="w-3 h-3" />} label="Errors" value={errorCount.toString()} color={errorCount > 0 ? 'text-sev-critical' : undefined} />
        <CompactStat icon={<Clock className="w-3 h-3" />} label="Items Ingested" value={totalIngested.toLocaleString()} />
        <CompactStat
          icon={<CheckCircle className="w-3 h-3" />}
          label="Avg Reliability"
          value={`${avgReliability}%`}
          color={avgReliability >= 90 ? 'text-sev-low' : avgReliability >= 70 ? 'text-sev-medium' : 'text-sev-critical'}
        />
      </PageStatsBar>

      <FilterBar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Search feeds by name…"
        filters={FEED_FILTERS}
        filterValues={filters}
        onFilterChange={(k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1) }}
      />

      <div className="flex-1 overflow-hidden">
        <DataTable
          columns={columns}
          data={displayFeeds}
          loading={isLoading}
          rowKey={(r) => r.id}
          density={density}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          emptyMessage="No feeds matching your search or filters."
          severityField={(row) => row.status === 'error' ? 'critical' : undefined}
        />
      </div>

      <Pagination
        page={page} limit={50} total={data?.total ?? 0}
        onPageChange={setPage} density={density} onDensityChange={setDensity}
      />
    </div>
  )
}
