/**
 * @module pages/FeedListPage
 * @description Feed management page — shows active feeds with health status,
 * last fetch time, reliability gauge, and error indicators.
 * UX improvements: animated status dot, feed type icons, next-fetch countdown,
 * inline error details with failure context, row tinting, retry button,
 * source favicon, radial SVG gauge, 24h schedule timeline, card/table toggle.
 */
import { useState, useMemo } from 'react'
import { useFeeds, useRetryFeed, type FeedRecord } from '@/hooks/use-intel-data'
import { toast, ToastContainer } from '@/components/ui/Toast'
import { DataTable, type Column, type Density } from '@/components/data/DataTable'
import { FilterBar, type FilterOption } from '@/components/data/FilterBar'
import { Pagination } from '@/components/data/Pagination'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { Rss, AlertTriangle, CheckCircle, Clock, RefreshCw, LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  FeedTypeIcon, StatusDot, ReliabilityBar,
  formatTime, getNextFireLabel, FeedFavicon, FeedCard,
} from '@/components/feed/FeedCard'
import { FeedScheduleTimeline } from '@/components/feed/FeedScheduleTimeline'

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

// ─── View toggle ──────────────────────────────────────────────

type ViewMode = 'table' | 'card'

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden ml-1">
      <button
        className={cn(
          'p-1.5 transition-colors',
          mode === 'table' ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-primary hover:bg-bg-hover',
        )}
        title="Table view"
        data-testid="view-toggle-table"
        onClick={() => onChange('table')}
      >
        <List className="w-3.5 h-3.5" />
      </button>
      <button
        className={cn(
          'p-1.5 transition-colors',
          mode === 'card' ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-primary hover:bg-bg-hover',
        )}
        title="Card view"
        data-testid="view-toggle-card"
        onClick={() => onChange('card')}
      >
        <LayoutGrid className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export function FeedListPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [density, setDensity] = useState<Density>('compact')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [viewMode, setViewMode] = useState<ViewMode>('table')

  const { data, isLoading } = useFeeds({ page: 1, limit: 50 })
  const retryFeed = useRetryFeed()

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
          <div className="flex items-center gap-1.5">
            {row.url && <FeedFavicon url={row.url} />}
            <span className="text-text-primary font-medium truncate">{row.name}</span>
          </div>
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
              data-testid={`retry-feed-${row.id}`}
              onClick={(e) => {
                e.stopPropagation()
                retryFeed.mutate(row.id, {
                  onSuccess: () => toast(`Retry triggered for ${row.name}`, 'success'),
                  onError: () => toast(`Failed to retry ${row.name}`, 'error'),
                })
              }}
            >
              <RefreshCw className={cn('w-3 h-3', retryFeed.isPending && 'animate-spin')} />
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
      >
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </FilterBar>

      <FeedScheduleTimeline feeds={displayFeeds} />

      {viewMode === 'table' ? (
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
      ) : (
        <div
          className="flex-1 overflow-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-3 content-start"
          data-testid="feed-card-grid"
        >
          {displayFeeds.map(feed => (
            <FeedCard key={feed.id} feed={feed} />
          ))}
          {displayFeeds.length === 0 && !isLoading && (
            <div className="col-span-full text-center text-text-muted text-sm py-8">
              No feeds matching your search or filters.
            </div>
          )}
        </div>
      )}

      <Pagination
        page={page} limit={50} total={data?.total ?? 0}
        onPageChange={setPage} density={density} onDensityChange={setDensity}
      />
      <ToastContainer />
    </div>
  )
}
