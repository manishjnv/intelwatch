/**
 * @module pages/FeedListPage
 * @description Feed management page — shows active feeds with health status,
 * last fetch time, reliability gauge, and error indicators.
 * UX improvements: animated status dot, feed type icons, next-fetch countdown,
 * inline error details with failure context, row tinting, retry button,
 * source favicon, radial SVG gauge, 24h schedule timeline, card/table toggle.
 */
import { useState, useMemo } from 'react'
import { useFeeds, useRetryFeed, useToggleFeed, useDeleteFeed, useForceFetch, useFeedQuota, type FeedRecord } from '@/hooks/use-intel-data'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { toast, ToastContainer } from '@/components/ui/Toast'
import { DataTable, type Column, type Density } from '@/components/data/DataTable'
import { TableSkeleton } from '@/components/data/TableSkeleton'
import { FilterBar, type FilterOption } from '@/components/data/FilterBar'
import { Pagination } from '@/components/data/Pagination'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { Rss, AlertTriangle, CheckCircle, Clock, RefreshCw, LayoutGrid, List, Trash2, Play, ToggleLeft, ToggleRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  FeedTypeIcon, StatusDot, ReliabilityBar,
  formatTime, getNextFireLabel, FeedFavicon, FeedCard,
  computeFeedHealth, HealthDot, FailureSparkline,
} from '@/components/feed/FeedCard'
import { FeedScheduleTimeline } from '@/components/feed/FeedScheduleTimeline'

/** Check if a feed fetch is overdue (last fetch > 2x schedule interval) */
function isScheduleOverdue(lastFetchAt: string | null, schedule: string | null): boolean {
  if (!lastFetchAt || !schedule) return false;
  // Parse simple cron patterns: */N in minute field = every N minutes
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return false;
  const minField = parts[0] ?? '';
  const everyN = minField.match(/^\*\/(\d+)$/);
  if (!everyN) return false;
  const intervalMs = parseInt(everyN[1]!, 10) * 60_000;
  const elapsed = Date.now() - new Date(lastFetchAt).getTime();
  return elapsed > intervalMs * 2;
}

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
  const btn = (m: ViewMode, Icon: typeof List, label: string) => (
    <button className={cn('p-1.5 transition-colors', mode === m ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text-primary hover:bg-bg-hover')}
      title={label} data-testid={`view-toggle-${m}`} onClick={() => onChange(m)}>
      <Icon className="w-3.5 h-3.5" />
    </button>
  )
  return <div className="inline-flex rounded-md border border-border overflow-hidden ml-1">{btn('table', List, 'Table view')}{btn('card', LayoutGrid, 'Card view')}</div>
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

  const debouncedSearch = useDebouncedValue(search, 300)

  const [deleteConfirm, setDeleteConfirm] = useState<FeedRecord | null>(null)
  const [fetchCooldowns, setFetchCooldowns] = useState<Record<string, number>>({})

  const { data, isLoading } = useFeeds({ page: 1, limit: 50 })
  const retryFeed = useRetryFeed()
  const toggleFeed = useToggleFeed()
  const deleteFeed = useDeleteFeed()
  const forceFetch = useForceFetch()
  const { data: quota } = useFeedQuota()

  const feeds = data?.data ?? []

  // Client-side filter + sort — works in both demo and live mode
  const displayFeeds = useMemo(() => {
    let result = feeds

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(f =>
        f.name.toLowerCase().includes(q) ||
        (f.description ?? '').toLowerCase().includes(q) ||
        (f.url ?? '').toLowerCase().includes(q),
      )
    }
    if (filters.feedType) result = result.filter(f => f.feedType === filters.feedType)
    if (filters.status)   result = result.filter(f => f.status   === filters.status)

    return [...result].sort((a, b) => {
      if (sortBy === 'health') {
        const ah = computeFeedHealth(a), bh = computeFeedHealth(b);
        return sortOrder === 'asc' ? ah - bh : bh - ah;
      }
      const av = a[sortBy as keyof FeedRecord] ?? ''
      const bv = b[sortBy as keyof FeedRecord] ?? ''
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortOrder === 'asc' ? cmp : -cmp
    })
  }, [feeds, debouncedSearch, filters, sortBy, sortOrder])

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
      key: 'status', label: 'Status', sortable: true, width: '8%',
      render: (row) => <StatusDot status={row.status} />,
    },
    {
      key: 'health', label: 'Health', sortable: true, width: '7%',
      render: (row) => (
        <span className={isDimmed(row) ? 'opacity-50' : undefined}>
          <HealthDot score={computeFeedHealth(row)} />
        </span>
      ),
    },
    {
      key: 'feedReliability', label: 'Reliability', sortable: true, width: '10%',
      render: (row) => (
        <span className={isDimmed(row) ? 'opacity-50' : undefined}>
          <ReliabilityBar value={row.feedReliability} />
        </span>
      ),
    },
    {
      key: 'schedule', label: 'Next Fetch', width: '9%',
      render: (row) => {
        const label = isDimmed(row) ? '—' : getNextFireLabel(row.schedule);
        // Overdue detection: if lastFetchAt is older than 2x the schedule interval
        const isOverdue = !isDimmed(row) && row.lastFetchAt && row.schedule
          && isScheduleOverdue(row.lastFetchAt, row.schedule);
        return (
          <span
            className={cn(
              'text-[10px] tabular-nums',
              isDimmed(row) ? 'text-text-muted opacity-40'
                : isOverdue ? 'text-sev-critical font-medium'
                : 'text-text-secondary',
            )}
            title={isOverdue ? `Overdue — last fetch ${formatTime(row.lastFetchAt)}` : (row.schedule ?? undefined)}
          >
            {isOverdue ? 'Overdue' : label}
          </span>
        );
      },
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
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          <FailureSparkline consecutiveFailures={row.consecutiveFailures} />
          {row.consecutiveFailures > 0 && (
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
          )}
        </span>
      ),
    },
    {
      key: 'actions', label: '', width: '11%',
      render: (row) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => toggleFeed.mutate({ feedId: row.id, enabled: !row.enabled }, {
            onSuccess: () => toast(`Feed ${row.enabled ? 'disabled' : 'enabled'}`, 'success'),
            onError: () => toast('Failed to toggle feed', 'error'),
          })} title={row.enabled ? 'Disable feed' : 'Enable feed'} data-testid={`toggle-feed-${row.id}`}
            className="p-1 rounded text-text-muted hover:text-accent transition-colors">
            {row.enabled ? <ToggleRight className="w-4 h-4 text-sev-low" /> : <ToggleLeft className="w-4 h-4 text-text-muted" />}
          </button>
          <button onClick={() => {
            const cd = (fetchCooldowns[row.id] ?? 0) > Date.now()
            if (cd) return
            setFetchCooldowns(prev => ({ ...prev, [row.id]: Date.now() + 60_000 }))
            forceFetch.mutate(row.id, {
              onSuccess: () => toast(`Fetch queued for ${row.name}`, 'success'),
              onError: () => { setFetchCooldowns(prev => ({ ...prev, [row.id]: 0 })); toast('Failed to queue fetch', 'error') },
            })
          }} disabled={(fetchCooldowns[row.id] ?? 0) > Date.now() || forceFetch.isPending}
            title={(fetchCooldowns[row.id] ?? 0) > Date.now() ? 'Cooldown — wait 60s' : 'Fetch now'}
            data-testid={`force-fetch-${row.id}`}
            className="p-1 rounded text-text-muted hover:text-accent transition-colors disabled:opacity-40">
            <Play className="w-3 h-3" />
          </button>
          <button onClick={() => setDeleteConfirm(row)} title="Delete feed" data-testid={`delete-feed-${row.id}`}
            className="p-1 rounded text-text-muted hover:text-sev-critical transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <PageStatsBar>
        {(() => {
          const max = quota?.maxFeeds ?? -1
          const count = feeds.length
          const pct = max > 0 ? Math.round((count / max) * 100) : 0
          const quotaColor = max === -1 ? 'text-sev-low' : pct >= 90 ? 'text-sev-critical' : pct >= 70 ? 'text-sev-high' : 'text-sev-low'
          const label = max === -1 ? `${count} (${quota?.displayName ?? 'Enterprise'})` : `${count}/${max} (${quota?.displayName ?? 'Free'})`
          return <CompactStat icon={<Rss className="w-3 h-3" />} label="Feeds" value={label} color={quotaColor} />
        })()}
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
          {isLoading ? (
            <TableSkeleton rows={10} columns={columns.length} />
          ) : (
            <DataTable
              columns={columns}
              data={displayFeeds}
              loading={false}
              rowKey={(r) => r.id}
              density={density}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
              emptyMessage="No feeds matching your search or filters."
              severityField={(row) => row.status === 'error' ? 'critical' : undefined}
            />
          )}
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
      {deleteConfirm && (<>
        <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setDeleteConfirm(null)} />
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" data-testid="delete-feed-modal">
          <div className="bg-bg-primary border border-border rounded-lg shadow-xl p-5 max-w-sm w-full">
            <h3 className="text-sm font-semibold text-text-primary mb-2">Delete Feed</h3>
            <p className="text-xs text-text-secondary mb-4">Delete feed &ldquo;{deleteConfirm.name}&rdquo;? This cannot be undone.</p>
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)} data-testid="delete-cancel"
                className="text-xs px-3 py-1.5 rounded-md border border-border text-text-secondary hover:bg-bg-hover transition-colors">Cancel</button>
              <button onClick={() => deleteFeed.mutate(deleteConfirm.id, {
                onSuccess: () => { toast(`Feed "${deleteConfirm.name}" deleted`, 'success'); setDeleteConfirm(null) },
                onError: () => toast('Failed to delete feed', 'error'),
              })} disabled={deleteFeed.isPending} data-testid="delete-confirm"
                className="text-xs px-3 py-1.5 rounded-md bg-sev-critical/10 border border-sev-critical/20 text-sev-critical hover:bg-sev-critical/20 transition-colors disabled:opacity-50">
                {deleteFeed.isPending ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      </>)}
      <ToastContainer />
    </div>
  )
}
