/**
 * @module components/command-center/FeedsTab
 * @description Unified feeds management tab — absorbs FeedListPage + GlobalCatalogPage.
 * 3 sub-tabs: My Feeds, Feed Catalog, Pipeline Health (super-admin only).
 */
import { useState, useMemo, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { PillSwitcher, type PillItem } from './PillSwitcher'
import type { useCommandCenter } from '@/hooks/use-command-center'
import { useFeeds, useToggleFeed, useDeleteFeed, useForceFetch, type FeedRecord } from '@/hooks/use-intel-data'
import { useGlobalCatalog, useMySubscriptions, useGlobalPipelineHealth } from '@/hooks/use-global-catalog'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import {
  FeedTypeIcon, StatusDot, ReliabilityBar, HealthDot, FailureSparkline,
  formatTime, computeFeedHealth,
} from '@/components/feed/FeedCard'
import {
  Search, Rss, Trash2, Play, ToggleLeft, ToggleRight, Star,
  AlertTriangle, Activity, Clock, Zap, Pause, ChevronRight,
  Shield, Crown, X,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────

type SubTab = 'my-feeds' | 'catalog' | 'pipeline'

interface FeedsTabProps {
  data: ReturnType<typeof useCommandCenter>
}

// ─── Helpers ────────────────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-500/20 text-gray-400',
  starter: 'bg-blue-500/20 text-blue-400',
  teams: 'bg-purple-500/20 text-purple-400',
  enterprise: 'bg-amber-500/20 text-amber-400',
}

function PlanBadge({ tier }: { tier: string }) {
  return (
    <span className={cn('px-1.5 py-0.5 text-[10px] rounded font-medium capitalize', PLAN_COLORS[tier] ?? PLAN_COLORS.free)}>
      {tier}
    </span>
  )
}

function AdmiraltyBadge({ code }: { code: string }) {
  const color = code.startsWith('A') ? 'text-sev-low bg-sev-low/10' : code.startsWith('B') ? 'text-blue-400 bg-blue-400/10' : 'text-text-muted bg-bg-hover'
  return <span className={cn('px-1.5 py-0.5 text-[10px] rounded font-mono font-medium', color)}>{code}</span>
}

// ─── My Feeds Sub-Tab ───────────────────────────────────────

function MyFeedsPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const feeds = useFeeds()
  const toggleFeed = useToggleFeed()
  const deleteFeed = useDeleteFeed()
  const forceFetch = useForceFetch()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({})
  const debouncedSearch = useDebouncedValue(search, 300)

  const feedList = feeds.data?.data ?? []

  const filtered = useMemo(() => {
    let list = feedList
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(f => f.name.toLowerCase().includes(q) || f.feedType.toLowerCase().includes(q))
    }
    if (typeFilter) list = list.filter(f => f.feedType === typeFilter)
    if (statusFilter) {
      if (statusFilter === 'active') list = list.filter(f => f.enabled && f.consecutiveFailures === 0)
      else if (statusFilter === 'error') list = list.filter(f => f.consecutiveFailures > 0)
      else if (statusFilter === 'disabled') list = list.filter(f => !f.enabled)
    }
    return list
  }, [feedList, debouncedSearch, typeFilter, statusFilter])

  const handleForceFetch = useCallback((id: string) => {
    forceFetch.mutate(id)
    setCooldowns(prev => ({ ...prev, [id]: Date.now() + 60_000 }))
  }, [forceFetch])

  const handleDelete = useCallback(() => {
    if (deleteId) {
      deleteFeed.mutate(deleteId)
      setDeleteId(null)
    }
  }, [deleteId, deleteFeed])

  const feedStatus = (f: FeedRecord) => {
    if (!f.enabled) return 'disabled'
    if (f.consecutiveFailures > 0) return 'error'
    return 'active'
  }

  if (feeds.isLoading) {
    return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-bg-elevated rounded animate-pulse" />)}</div>
  }

  return (
    <div className="space-y-3" data-testid="my-feeds-panel">
      {/* Search + Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            data-testid="feed-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search feeds..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
        <select data-testid="feed-type-filter" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-2 py-1.5 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary">
          <option value="">All Types</option>
          <option value="rss">RSS</option><option value="nvd">NVD</option>
          <option value="stix">STIX</option><option value="rest_api">REST API</option>
          <option value="misp">MISP</option>
        </select>
        <select data-testid="feed-status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-2 py-1.5 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary">
          <option value="">All Status</option>
          <option value="active">Active</option><option value="error">Error</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      {/* Feed Table */}
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-xs" data-testid="feed-table">
          <thead>
            <tr className="border-b border-border bg-bg-elevated">
              <th className="text-left px-3 py-2 text-text-muted font-medium">Feed</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium hidden sm:table-cell">Type</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium">Status</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium hidden md:table-cell">Health</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium hidden md:table-cell">Reliability</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium hidden lg:table-cell">Schedule</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium hidden lg:table-cell">Last Fetch</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium hidden lg:table-cell">Errors</th>
              {isSuperAdmin && <th className="text-right px-3 py-2 text-text-muted font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => {
              const status = feedStatus(f)
              const health = computeFeedHealth(f)
              const onCooldown = (cooldowns[f.id] ?? 0) > Date.now()
              return (
                <tr key={f.id} className={cn('border-b border-border/50 hover:bg-bg-hover transition-colors', status === 'error' && 'bg-sev-high/5')}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <FeedTypeIcon type={f.feedType} />
                      <span className="text-text-primary font-medium truncate max-w-[200px]">{f.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-text-muted uppercase hidden sm:table-cell">{f.feedType}</td>
                  <td className="px-3 py-2"><StatusDot status={status} /></td>
                  <td className="px-3 py-2 hidden md:table-cell"><HealthDot score={health} /></td>
                  <td className="px-3 py-2 hidden md:table-cell"><ReliabilityBar value={f.feedReliability} /></td>
                  <td className="px-3 py-2 text-text-muted hidden lg:table-cell">{f.schedule ?? '—'}</td>
                  <td className="px-3 py-2 text-text-muted hidden lg:table-cell">{f.lastFetchAt ? formatTime(f.lastFetchAt) : '—'}</td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    {f.consecutiveFailures > 0
                      ? <span className="text-sev-high flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{f.consecutiveFailures}</span>
                      : <span className="text-text-muted">0</span>}
                  </td>
                  {isSuperAdmin && (
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          data-testid={`toggle-feed-${f.id}`}
                          onClick={() => toggleFeed.mutate({ feedId: f.id, enabled: !f.enabled })}
                          title={f.enabled ? 'Disable' : 'Enable'}
                          className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary"
                        >
                          {f.enabled ? <ToggleRight className="w-4 h-4 text-sev-low" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button
                          data-testid={`force-fetch-${f.id}`}
                          onClick={() => handleForceFetch(f.id)}
                          disabled={onCooldown}
                          title={onCooldown ? 'Cooldown active' : 'Force fetch'}
                          className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary disabled:opacity-30"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        <button
                          data-testid={`delete-feed-${f.id}`}
                          onClick={() => setDeleteId(f.id)}
                          title="Delete feed"
                          className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-sev-high"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={isSuperAdmin ? 9 : 8} className="text-center py-8 text-text-muted">No feeds match your filters</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="delete-modal">
          <div className="bg-bg-primary border border-border rounded-lg p-4 max-w-sm w-full mx-4 space-y-3">
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-sev-high" /> Delete Feed</h3>
            <p className="text-xs text-text-muted">This will permanently remove this feed and stop all scheduled fetches. This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-3 py-1.5 text-xs border border-border rounded-lg text-text-secondary hover:text-text-primary">Cancel</button>
              <button data-testid="confirm-delete" onClick={handleDelete} className="px-3 py-1.5 text-xs bg-sev-high text-white rounded-lg hover:bg-sev-high/80">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Feed Catalog Sub-Tab ───────────────────────────────────

function CatalogPanel({ tenantPlan }: { tenantPlan: string }) {
  const catalog = useGlobalCatalog()
  const subs = useMySubscriptions()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)

  const subscribedIds = useMemo(() => new Set((subs.data?.data ?? subs.data ?? []).map((s: { globalFeedId?: string; id?: string }) => s.globalFeedId ?? s.id)), [subs.data])

  const feeds = catalog.data ?? []

  const filtered = useMemo(() => {
    let list = feeds
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(f => f.name.toLowerCase().includes(q) || f.description?.toLowerCase().includes(q))
    }
    if (typeFilter) list = list.filter(f => f.feedType === typeFilter)
    if (tierFilter) list = list.filter(f => f.minPlanTier === tierFilter)
    return list
  }, [feeds, debouncedSearch, typeFilter, tierFilter])

  if (catalog.isLoading) {
    return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-bg-elevated rounded animate-pulse" />)}</div>
  }

  return (
    <div className="space-y-3" data-testid="catalog-panel">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            data-testid="catalog-search"
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search catalog..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
        <select data-testid="catalog-type-filter" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-2 py-1.5 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary">
          <option value="">All Types</option>
          <option value="rss">RSS</option><option value="nvd">NVD</option>
          <option value="stix">STIX</option><option value="rest">REST</option>
        </select>
        <select data-testid="catalog-tier-filter" value={tierFilter} onChange={e => setTierFilter(e.target.value)}
          className="px-2 py-1.5 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary">
          <option value="">All Plans</option>
          <option value="free">Free</option><option value="starter">Starter</option>
          <option value="teams">Teams</option><option value="enterprise">Enterprise</option>
        </select>
      </div>

      {/* Catalog Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(f => {
          const isSubscribed = subscribedIds.has(f.id)
          return (
            <div key={f.id} className="border border-border rounded-lg p-3 bg-bg-primary hover:border-border-strong transition-colors" data-testid={`catalog-feed-${f.id}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FeedTypeIcon type={f.feedType} />
                  <span className="text-xs font-medium text-text-primary truncate">{f.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <AdmiraltyBadge code={f.admiraltyCode} />
                  <PlanBadge tier={f.minPlanTier} />
                </div>
              </div>
              {f.description && <p className="text-[11px] text-text-muted mb-2 line-clamp-2">{f.description}</p>}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-[10px] text-text-muted">
                  <span className="flex items-center gap-1"><Rss className="w-3 h-3" />{f.subscriberCount} subs</span>
                  <span className="flex items-center gap-1"><Activity className="w-3 h-3" />{f.totalItemsIngested.toLocaleString()}</span>
                </div>
                <button
                  data-testid={`subscribe-${f.id}`}
                  onClick={() => isSubscribed ? subs.unsubscribe(f.id) : subs.subscribe(f.id)}
                  disabled={subs.isSubscribing || subs.isUnsubscribing}
                  className={cn(
                    'px-2 py-1 text-[10px] font-medium rounded transition-colors',
                    isSubscribed
                      ? 'bg-sev-low/10 text-sev-low hover:bg-sev-high/10 hover:text-sev-high'
                      : 'bg-accent/10 text-accent hover:bg-accent/20',
                  )}
                >
                  {isSubscribed ? 'Unsubscribe' : 'Subscribe'}
                </button>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-8 text-text-muted text-xs">No feeds match your filters</div>
        )}
      </div>
    </div>
  )
}

// ─── Pipeline Health Sub-Tab ────────────────────────────────

function PipelineHealthPanel() {
  const pipeline = useGlobalPipelineHealth()
  const health = pipeline.data

  if (pipeline.isLoading || !health) {
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-bg-elevated rounded animate-pulse" />)}</div>
  }

  const metrics = health.pipeline

  return (
    <div className="space-y-4" data-testid="pipeline-health-panel">
      {/* Pipeline Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Articles/24h', value: metrics.articlesProcessed24h.toLocaleString(), icon: Rss, color: 'text-blue-400' },
          { label: 'IOCs Created', value: metrics.iocsCreated24h.toLocaleString(), icon: Shield, color: 'text-purple-400' },
          { label: 'IOCs Enriched', value: metrics.iocsEnriched24h.toLocaleString(), icon: Zap, color: 'text-amber-400' },
          { label: 'Normalize Latency', value: `${metrics.avgNormalizeLatencyMs}ms`, icon: Clock, color: 'text-sev-low' },
          { label: 'Enrich Latency', value: `${metrics.avgEnrichLatencyMs}ms`, icon: Clock, color: metrics.avgEnrichLatencyMs > 2000 ? 'text-sev-high' : 'text-sev-low' },
        ].map(m => (
          <div key={m.label} className="border border-border rounded-lg p-3 bg-bg-primary">
            <div className="flex items-center gap-1.5 mb-1">
              <m.icon className={cn('w-3.5 h-3.5', m.color)} />
              <span className="text-[10px] text-text-muted">{m.label}</span>
            </div>
            <span className="text-sm font-bold text-text-primary">{m.value}</span>
          </div>
        ))}
      </div>

      {/* Queue Health Cards */}
      <div>
        <h3 className="text-xs font-medium text-text-muted mb-2">Queue Health</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {health.queues.map(q => {
            const total = q.waiting + q.active + q.completed + q.failed + q.delayed
            const failRate = total > 0 ? (q.failed / total) * 100 : 0
            return (
              <div key={q.name} className={cn('border rounded-lg p-3', failRate > 5 ? 'border-sev-high/30 bg-sev-high/5' : 'border-border bg-bg-primary')} data-testid={`queue-${q.name}`}>
                <div className="text-[11px] font-medium text-text-primary mb-2 truncate" title={q.name}>
                  {q.name.replace('etip-', '').replace(/-/g, ' ')}
                </div>
                <div className="grid grid-cols-5 gap-1 text-[10px]">
                  {[
                    { label: 'Wait', value: q.waiting, color: 'text-amber-400' },
                    { label: 'Act', value: q.active, color: 'text-blue-400' },
                    { label: 'Done', value: q.completed, color: 'text-sev-low' },
                    { label: 'Fail', value: q.failed, color: q.failed > 0 ? 'text-sev-high' : 'text-text-muted' },
                    { label: 'Delay', value: q.delayed, color: q.delayed > 0 ? 'text-amber-400' : 'text-text-muted' },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <div className="text-text-muted">{s.label}</div>
                      <div className={cn('font-medium', s.color)}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Main FeedsTab ──────────────────────────────────────────

export function FeedsTab({ data }: FeedsTabProps) {
  const { isSuperAdmin, tenantPlan } = data
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('my-feeds')

  const pills: PillItem[] = useMemo(() => {
    const items: PillItem[] = [
      { id: 'my-feeds', label: 'My Feeds' },
      { id: 'catalog', label: 'Feed Catalog' },
    ]
    if (isSuperAdmin) {
      items.push({ id: 'pipeline', label: 'Pipeline Health' })
    }
    return items
  }, [isSuperAdmin])

  // Reset to valid sub-tab if role changes
  const effectiveSubTab = pills.find(p => p.id === activeSubTab) ? activeSubTab : 'my-feeds'

  return (
    <div className="space-y-4" data-testid="feeds-tab">
      <PillSwitcher items={pills} activeId={effectiveSubTab} onChange={id => setActiveSubTab(id as SubTab)} />

      {effectiveSubTab === 'my-feeds' && <MyFeedsPanel isSuperAdmin={isSuperAdmin} />}
      {effectiveSubTab === 'catalog' && <CatalogPanel tenantPlan={tenantPlan} />}
      {effectiveSubTab === 'pipeline' && <PipelineHealthPanel />}
    </div>
  )
}
