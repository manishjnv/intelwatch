/**
 * @module pages/GlobalCatalogPage
 * @description Global Feed Catalog — browse, subscribe, manage global feeds + pipeline health.
 * 3 tabs: Catalog, My Subscriptions, Pipeline Health (admin only).
 * DECISION-029 Phase C.
 */
import { useState, useMemo } from 'react'
import {
  useGlobalCatalog, useMySubscriptions, useGlobalPipelineHealth,
  type GlobalCatalogFeed, type QueueHealthEntry,
} from '@/hooks/use-global-catalog'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { DataTable, type Column } from '@/components/data/DataTable'
import { TableSkeleton } from '@/components/data/TableSkeleton'
import { FilterBar, type FilterOption } from '@/components/data/FilterBar'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { StatusDot } from '@/components/feed/FeedCard'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { Globe, Rss, Shield, Activity, Pause, Play, AlertTriangle } from 'lucide-react'

type TabId = 'catalog' | 'subscriptions' | 'pipeline'

const TABS: { id: TabId; label: string; adminOnly?: boolean }[] = [
  { id: 'catalog', label: 'Catalog' },
  { id: 'subscriptions', label: 'My Subscriptions' },
  { id: 'pipeline', label: 'Pipeline Health', adminOnly: true },
]

const FEED_TYPE_FILTERS: FilterOption[] = [
  { value: '', label: 'All Types' },
  { value: 'rss', label: 'RSS' },
  { value: 'nvd', label: 'NVD' },
  { value: 'stix', label: 'STIX/TAXII' },
  { value: 'rest', label: 'REST API' },
  { value: 'misp', label: 'MISP' },
]

const PLAN_FILTERS: FilterOption[] = [
  { value: '', label: 'All Plans' },
  { value: 'free', label: 'Free' },
  { value: 'starter', label: 'Starter' },
  { value: 'teams', label: 'Teams' },
  { value: 'enterprise', label: 'Enterprise' },
]

function FeedTypeIcon({ type }: { type: string }) {
  const colors: Record<string, string> = { rss: 'text-orange-400', nvd: 'text-blue-400', stix: 'text-purple-400', rest: 'text-green-400', misp: 'text-cyan-400' }
  return <span className={cn('text-xs font-mono uppercase font-bold', colors[type] ?? 'text-text-muted')}>{type}</span>
}

function AdmiraltyBadge({ code }: { code: string }) {
  const letter = code[0] ?? ''
  const num = code[1] ?? ''
  const bg = letter <= 'B' ? 'bg-sev-low/20 text-sev-low' : letter <= 'C' ? 'bg-amber-400/20 text-amber-400' : 'bg-text-muted/20 text-text-muted'
  return <span className={cn('px-1.5 py-0.5 rounded text-xs font-mono font-bold', bg)}>{letter}{num}</span>
}

function PlanBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = { free: 'text-text-muted bg-text-muted/10', starter: 'text-sev-low bg-sev-low/10', teams: 'text-accent bg-accent/10', enterprise: 'text-purple-400 bg-purple-400/10' }
  return <span className={cn('px-1.5 py-0.5 rounded text-xs capitalize', colors[tier] ?? colors.free)}>{tier}</span>
}

function ReliabilityBar({ value }: { value: number }) {
  const color = value >= 90 ? 'bg-sev-low' : value >= 70 ? 'bg-amber-400' : 'bg-sev-high'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-bg-elevated overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-text-muted">{value}%</span>
    </div>
  )
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60_000) return 'Just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return `${Math.floor(diff / 86400_000)}d ago`
}

function QueueCard({ q }: { q: QueueHealthEntry }) {
  const shortName = q.name.replace('etip-feed-fetch-global-', 'fetch-').replace('etip-', '')
  const hasFailures = q.failed > 0
  return (
    <div className={cn('rounded-lg border p-3', hasFailures ? 'border-sev-high/30 bg-sev-high/5' : 'border-border bg-bg-surface')}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-mono font-bold text-text-primary">{shortName}</span>
        {hasFailures && <AlertTriangle size={14} className="text-sev-high" />}
      </div>
      <div className="grid grid-cols-3 gap-1 text-xs">
        <div><span className="text-text-muted">Wait:</span> <span className="text-amber-400">{q.waiting}</span></div>
        <div><span className="text-text-muted">Active:</span> <span className="text-sev-low">{q.active}</span></div>
        <div><span className="text-text-muted">Failed:</span> <span className={q.failed > 0 ? 'text-sev-high' : 'text-text-muted'}>{q.failed}</span></div>
        <div><span className="text-text-muted">Done:</span> <span className="text-text-secondary">{q.completed}</span></div>
        <div><span className="text-text-muted">Delay:</span> <span className="text-text-secondary">{q.delayed}</span></div>
      </div>
    </div>
  )
}

export function GlobalCatalogPage() {
  const [tab, setTab] = useState<TabId>('catalog')
  const [search, setSearch] = useState('')
  const [feedTypeFilter, setFeedTypeFilter] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const user = useAuthStore(s => s.user)
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin'

  const { data: feeds, isLoading: feedsLoading, isDemo } = useGlobalCatalog()
  const { data: subs, subscribe, unsubscribe, isSubscribing } = useMySubscriptions()
  const { data: health, isLoading: healthLoading } = useGlobalPipelineHealth()

  const subscribedIds = useMemo(() => new Set(subs?.map(s => s.globalFeedId) ?? []), [subs])

  const filteredFeeds = useMemo(() => {
    let list = feeds ?? []
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(f => f.name.toLowerCase().includes(q) || f.description?.toLowerCase().includes(q))
    }
    if (feedTypeFilter) list = list.filter(f => f.feedType === feedTypeFilter)
    if (planFilter) list = list.filter(f => f.minPlanTier === planFilter)
    return list
  }, [feeds, debouncedSearch, feedTypeFilter, planFilter])

  const myFeeds = useMemo(() => {
    return (feeds ?? []).filter(f => subscribedIds.has(f.id))
  }, [feeds, subscribedIds])

  // Stats
  const totalFeeds = feeds?.length ?? 0
  const activeFeeds = feeds?.filter(f => f.enabled).length ?? 0
  const articlesToday = health?.pipeline?.articlesProcessed24h ?? 0
  const iocsToday = health?.pipeline?.iocsCreated24h ?? 0

  const catalogColumns: Column<GlobalCatalogFeed>[] = [
    {
      key: 'name', label: 'Feed', sortable: true,
      render: (row: GlobalCatalogFeed) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">{row.name}</span>
          {row.description && <span className="text-xs text-text-muted truncate max-w-[200px]">{row.description}</span>}
        </div>
      ),
    },
    {
      key: 'feedType', label: 'Type', sortable: true, width: '80px',
      render: (row: GlobalCatalogFeed) => <FeedTypeIcon type={row.feedType} />,
    },
    {
      key: 'enabled', label: 'Status', width: '70px',
      render: (row: GlobalCatalogFeed) => <StatusDot status={row.enabled ? (row.consecutiveFailures > 0 ? 'error' : 'active') : 'disabled'} />,
    },
    {
      key: 'admiraltyCode', label: 'Admiralty', width: '80px',
      render: (row: GlobalCatalogFeed) => <AdmiraltyBadge code={row.admiraltyCode} />,
    },
    {
      key: 'feedReliability', label: 'Reliability', sortable: true, width: '120px',
      render: (row: GlobalCatalogFeed) => <ReliabilityBar value={row.feedReliability} />,
    },
    {
      key: 'minPlanTier', label: 'Plan', width: '80px',
      render: (row: GlobalCatalogFeed) => <PlanBadge tier={row.minPlanTier} />,
    },
    {
      key: 'subscriberCount', label: 'Subs', sortable: true, width: '60px',
      render: (row: GlobalCatalogFeed) => <span className="text-text-secondary">{row.subscriberCount}</span>,
    },
    {
      key: 'lastFetchAt', label: 'Last Fetch', sortable: true, width: '90px',
      render: (row: GlobalCatalogFeed) => <span className="text-xs text-text-muted">{formatRelativeTime(row.lastFetchAt)}</span>,
    },
    {
      key: 'id', label: '', width: '100px',
      render: (row: GlobalCatalogFeed) => {
        const isSubbed = subscribedIds.has(row.id)
        return (
          <button
            data-testid={`subscribe-${row.id}`}
            className={cn(
              'px-2 py-1 rounded text-xs font-medium transition-colors',
              isSubbed ? 'bg-sev-high/10 text-sev-high hover:bg-sev-high/20' : 'bg-accent/10 text-accent hover:bg-accent/20',
            )}
            disabled={isSubscribing}
            onClick={() => isSubbed ? unsubscribe(row.id) : subscribe(row.id)}
          >
            {isSubbed ? 'Unsubscribe' : 'Subscribe'}
          </button>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-4 p-4 min-h-0" data-testid="global-catalog-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Globe size={24} className="text-accent" />
        <div>
          <h1 className="text-xl font-bold text-text-primary">Global Feed Catalog</h1>
          <p className="text-sm text-text-muted">Browse and subscribe to curated threat intelligence feeds</p>
        </div>
        {isDemo && <span className="ml-auto px-2 py-0.5 rounded bg-amber-400/10 text-amber-400 text-xs">Demo Data</span>}
      </div>

      {/* Stats Bar */}
      <PageStatsBar>
        <CompactStat icon={<Globe size={14} />} label="Total Feeds" value={totalFeeds} color="text-accent" />
        <CompactStat icon={<Rss size={14} />} label="Active Feeds" value={activeFeeds} color="text-sev-low" />
        <CompactStat icon={<Shield size={14} />} label="Articles/24h" value={articlesToday} color="text-cyan-400" />
        <CompactStat icon={<Activity size={14} />} label="IOCs/24h" value={iocsToday} color="text-purple-400" />
      </PageStatsBar>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.filter(t => !t.adminOnly || isAdmin).map(t => (
          <button
            key={t.id}
            data-testid={`tab-${t.id}`}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === t.id ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text-secondary',
            )}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'catalog' && (
        <div className="flex flex-col gap-3">
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search feeds..."
            filters={[
              { label: 'Type', value: feedTypeFilter, options: FEED_TYPE_FILTERS, onChange: setFeedTypeFilter },
              { label: 'Plan', value: planFilter, options: PLAN_FILTERS, onChange: setPlanFilter },
            ]}
          />
          {feedsLoading ? (
            <TableSkeleton rows={5} columns={8} />
          ) : (
            <DataTable columns={catalogColumns} data={filteredFeeds} rowKey={(r) => r.id} emptyMessage="No feeds available" />
          )}
        </div>
      )}

      {tab === 'subscriptions' && (
        <div className="flex flex-col gap-3">
          {myFeeds.length === 0 ? (
            <div className="text-center py-12 text-text-muted">
              <Globe size={48} className="mx-auto mb-3 opacity-40" />
              <p className="text-lg font-medium">No subscriptions yet</p>
              <p className="text-sm">Browse the catalog and subscribe to feeds to get started</p>
            </div>
          ) : (
            <DataTable columns={catalogColumns} data={myFeeds} rowKey={(r) => r.id} emptyMessage="No subscriptions" />
          )}
        </div>
      )}

      {tab === 'pipeline' && isAdmin && (
        <div className="flex flex-col gap-4">
          {/* Pipeline stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="rounded-lg border border-border bg-bg-surface p-3">
              <div className="text-xs text-text-muted">Articles/24h</div>
              <div className="text-2xl font-bold text-text-primary">{health?.pipeline?.articlesProcessed24h ?? 0}</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-surface p-3">
              <div className="text-xs text-text-muted">IOCs Created/24h</div>
              <div className="text-2xl font-bold text-sev-low">{health?.pipeline?.iocsCreated24h ?? 0}</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-surface p-3">
              <div className="text-xs text-text-muted">IOCs Enriched/24h</div>
              <div className="text-2xl font-bold text-purple-400">{health?.pipeline?.iocsEnriched24h ?? 0}</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-surface p-3">
              <div className="text-xs text-text-muted">Avg Normalize</div>
              <div className="text-2xl font-bold text-cyan-400">{health?.pipeline?.avgNormalizeLatencyMs ?? 0}ms</div>
            </div>
            <div className="rounded-lg border border-border bg-bg-surface p-3">
              <div className="text-xs text-text-muted">Avg Enrich</div>
              <div className="text-2xl font-bold text-amber-400">{health?.pipeline?.avgEnrichLatencyMs ?? 0}ms</div>
            </div>
          </div>

          {/* Queue cards */}
          <div>
            <h3 className="text-sm font-semibold text-text-secondary mb-2">Queue Health</h3>
            {healthLoading ? (
              <TableSkeleton rows={2} columns={3} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(health?.queues ?? []).map(q => <QueueCard key={q.name} q={q} />)}
              </div>
            )}
          </div>

          {/* Admin actions */}
          <div className="flex gap-2">
            <button data-testid="pause-pipeline" className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-400/10 text-amber-400 text-sm hover:bg-amber-400/20 transition-colors">
              <Pause size={14} /> Pause Pipeline
            </button>
            <button data-testid="resume-pipeline" className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-sev-low/10 text-sev-low text-sm hover:bg-sev-low/20 transition-colors">
              <Play size={14} /> Resume Pipeline
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
