/**
 * @module components/command-center/FeedsTab
 * @description Unified feeds management tab — merges My Feeds + Feed Catalog into single table.
 * 2 sub-tabs: Feeds (unified), Pipeline Health (super-admin only).
 */
import { useState, useMemo, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { PillSwitcher, type PillItem } from './PillSwitcher'
import type { useCommandCenter } from '@/hooks/use-command-center'
import { useFeeds, useToggleFeed, useDeleteFeed, useForceFetch, type FeedRecord } from '@/hooks/use-intel-data'
import { useGlobalCatalog, useMySubscriptions, useGlobalPipelineHealth } from '@/hooks/use-global-catalog'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import {
  FeedTypeIcon, StatusDot, ReliabilityBar, HealthDot,
  formatTime, computeFeedHealth,
} from '@/components/feed/FeedCard'
import {
  Search, Rss, Trash2, Play, ToggleLeft, ToggleRight,
  AlertTriangle, Activity, Clock, Zap, Shield, Plus,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────

type SubTab = 'feeds' | 'pipeline'
type FeedSource = 'subscribed' | 'available'

interface FeedsTabProps {
  data: ReturnType<typeof useCommandCenter>
}

interface UnifiedFeedRow {
  id: string
  catalogId: string | null
  name: string
  description: string | null
  feedType: string
  source: FeedSource
  admiraltyCode: string | null
  minPlanTier: string | null
  subscriberCount: number | null
  status: string | null
  enabled: boolean | null
  schedule: string | null
  feedReliability: number
  consecutiveFailures: number
  lastFetchAt: string | null
  totalItemsIngested: number
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

function SourceBadge({ source }: { source: FeedSource }) {
  return (
    <span className={cn(
      'px-1.5 py-0.5 text-[10px] rounded font-medium',
      source === 'subscribed' ? 'bg-sev-low/15 text-sev-low' : 'bg-accent/15 text-accent',
    )} data-testid={`source-badge-${source}`}>
      {source === 'subscribed' ? 'Subscribed' : 'Available'}
    </span>
  )
}

function feedStatus(f: { enabled: boolean | null; consecutiveFailures: number }): string {
  if (f.enabled === false) return 'disabled'
  if (f.consecutiveFailures > 0) return 'error'
  return 'active'
}

// ─── Unified Feeds Panel ────────────────────────────────────

function UnifiedFeedsPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const feeds = useFeeds()
  const catalog = useGlobalCatalog()
  const subs = useMySubscriptions()
  const toggleFeed = useToggleFeed()
  const deleteFeed = useDeleteFeed()
  const forceFetch = useForceFetch()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({})
  const debouncedSearch = useDebouncedValue(search, 300)

  // Build unified rows from both data sources
  const unifiedRows = useMemo(() => {
    const tenantFeeds: FeedRecord[] = feeds.data?.data ?? []
    const catalogFeeds = catalog.data ?? []
    const subList: Array<{ globalFeedId?: string; id?: string }> = subs.data?.data ?? subs.data ?? []
    const subscribedCatalogIds = new Set(subList.map(s => s.globalFeedId ?? s.id))
    const tenantNameMap = new Map(tenantFeeds.map(f => [f.name.toLowerCase().trim(), f]))
    const claimedNames = new Set<string>()
    const rows: UnifiedFeedRow[] = []

    // 1. Tenant feeds → always subscribed, enrich with catalog data if name matches
    for (const tf of tenantFeeds) {
      const matchingCatalog = catalogFeeds.find(cf => cf.name.toLowerCase().trim() === tf.name.toLowerCase().trim())
      claimedNames.add(tf.name.toLowerCase().trim())
      rows.push({
        id: tf.id,
        catalogId: matchingCatalog?.id ?? null,
        name: tf.name,
        description: tf.description ?? matchingCatalog?.description ?? null,
        feedType: tf.feedType,
        source: 'subscribed',
        admiraltyCode: matchingCatalog?.admiraltyCode ?? null,
        minPlanTier: matchingCatalog?.minPlanTier ?? null,
        subscriberCount: matchingCatalog?.subscriberCount ?? null,
        status: feedStatus(tf),
        enabled: tf.enabled,
        schedule: tf.schedule,
        feedReliability: tf.feedReliability,
        consecutiveFailures: tf.consecutiveFailures,
        lastFetchAt: tf.lastFetchAt,
        totalItemsIngested: tf.totalItemsIngested,
      })
    }

    // 2. Catalog feeds not claimed by tenant feeds
    for (const cf of catalogFeeds) {
      if (claimedNames.has(cf.name.toLowerCase().trim())) continue
      const isSubscribed = subscribedCatalogIds.has(cf.id)
      rows.push({
        id: cf.id,
        catalogId: cf.id,
        name: cf.name,
        description: cf.description,
        feedType: cf.feedType,
        source: isSubscribed ? 'subscribed' : 'available',
        admiraltyCode: cf.admiraltyCode,
        minPlanTier: cf.minPlanTier,
        subscriberCount: cf.subscriberCount,
        status: isSubscribed ? (cf.consecutiveFailures > 0 ? 'error' : 'active') : null,
        enabled: isSubscribed ? cf.enabled : null,
        schedule: null,
        feedReliability: cf.feedReliability,
        consecutiveFailures: cf.consecutiveFailures,
        lastFetchAt: cf.lastFetchAt,
        totalItemsIngested: cf.totalItemsIngested,
      })
    }

    // Sort: subscribed first, then available, alphabetical within
    rows.sort((a, b) => {
      if (a.source !== b.source) return a.source === 'subscribed' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return rows
  }, [feeds.data, catalog.data, subs.data])

  // Filter
  const filtered = useMemo(() => {
    let list = unifiedRows
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      list = list.filter(r => r.name.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q) || r.feedType.toLowerCase().includes(q))
    }
    if (typeFilter) list = list.filter(r => r.feedType === typeFilter)
    if (sourceFilter) list = list.filter(r => r.source === sourceFilter)
    if (tierFilter) list = list.filter(r => r.minPlanTier === tierFilter)
    return list
  }, [unifiedRows, debouncedSearch, typeFilter, sourceFilter, tierFilter])

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

  if (feeds.isLoading || catalog.isLoading) {
    return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-bg-elevated rounded animate-pulse" />)}</div>
  }

  return (
    <div className="space-y-3" data-testid="unified-feeds-panel">
      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            data-testid="feed-search"
            value={search} onChange={e => setSearch(e.target.value)}
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
        <select data-testid="feed-source-filter" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}
          className="px-2 py-1.5 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary">
          <option value="">All Sources</option>
          <option value="subscribed">Subscribed</option>
          <option value="available">Available</option>
        </select>
        <select data-testid="catalog-tier-filter" value={tierFilter} onChange={e => setTierFilter(e.target.value)}
          className="px-2 py-1.5 text-xs bg-bg-elevated border border-border rounded-lg text-text-primary">
          <option value="">All Plans</option>
          <option value="free">Free</option><option value="starter">Starter</option>
          <option value="teams">Teams</option><option value="enterprise">Enterprise</option>
        </select>
      </div>

      {/* Unified Feed Table */}
      <div className="overflow-x-auto border border-border rounded-lg">
        <table className="w-full text-xs" data-testid="feed-table">
          <thead>
            <tr className="border-b border-border bg-bg-elevated">
              <th className="text-left px-3 py-2 text-text-muted font-medium">Feed</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium hidden sm:table-cell">Type</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium">Source</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium hidden sm:table-cell">Status</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium hidden md:table-cell">Health</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium hidden md:table-cell">Reliability</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium hidden lg:table-cell">Schedule</th>
              <th className="text-left px-3 py-2 text-text-muted font-medium hidden lg:table-cell">Last Fetch</th>
              <th className="text-right px-3 py-2 text-text-muted font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => {
              const health = row.source === 'subscribed' ? computeFeedHealth(row as any) : null
              const onCooldown = (cooldowns[row.id] ?? 0) > Date.now()
              return (
                <tr key={`${row.source}-${row.id}`} className={cn(
                  'border-b border-border/50 hover:bg-bg-hover transition-colors',
                  row.status === 'error' && 'bg-sev-high/5',
                )}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <FeedTypeIcon type={row.feedType} />
                      <span className="text-text-primary font-medium truncate max-w-[160px]">{row.name}</span>
                      {row.admiraltyCode && <AdmiraltyBadge code={row.admiraltyCode} />}
                      {row.minPlanTier && <PlanBadge tier={row.minPlanTier} />}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-text-muted uppercase hidden sm:table-cell">{row.feedType}</td>
                  <td className="px-3 py-2"><SourceBadge source={row.source} /></td>
                  <td className="px-3 py-2 hidden sm:table-cell">
                    {row.status ? <StatusDot status={row.status} /> : <span className="text-text-muted">—</span>}
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    {health != null ? <HealthDot score={health} /> : <span className="text-text-muted">—</span>}
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell"><ReliabilityBar value={row.feedReliability} /></td>
                  <td className="px-3 py-2 text-text-muted hidden lg:table-cell">{row.schedule ?? '—'}</td>
                  <td className="px-3 py-2 text-text-muted hidden lg:table-cell">{row.lastFetchAt ? formatTime(row.lastFetchAt) : '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {row.source === 'subscribed' && isSuperAdmin ? (
                      <div className="flex items-center justify-end gap-1">
                        <button data-testid={`toggle-feed-${row.id}`}
                          onClick={() => toggleFeed.mutate({ feedId: row.id, enabled: !row.enabled })}
                          title={row.enabled ? 'Disable' : 'Enable'}
                          className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary">
                          {row.enabled ? <ToggleRight className="w-4 h-4 text-sev-low" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button data-testid={`force-fetch-${row.id}`}
                          onClick={() => handleForceFetch(row.id)} disabled={onCooldown}
                          title={onCooldown ? 'Cooldown active' : 'Force fetch'}
                          className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary disabled:opacity-30">
                          <Play className="w-3.5 h-3.5" />
                        </button>
                        <button data-testid={`delete-feed-${row.id}`}
                          onClick={() => setDeleteId(row.id)} title="Delete feed"
                          className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-sev-high">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : row.source === 'available' ? (
                      <button data-testid={`subscribe-${row.id}`}
                        onClick={() => subs.subscribe(row.id)}
                        disabled={subs.isSubscribing}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors">
                        <Plus className="w-3 h-3" /> Subscribe
                      </button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-text-muted">No feeds match your filters</td></tr>
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
  const { isSuperAdmin } = data
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('feeds')

  const pills: PillItem[] = useMemo(() => {
    const items: PillItem[] = [{ id: 'feeds', label: 'Feeds' }]
    if (isSuperAdmin) items.push({ id: 'pipeline', label: 'Pipeline Health' })
    return items
  }, [isSuperAdmin])

  const effectiveSubTab = pills.find(p => p.id === activeSubTab) ? activeSubTab : 'feeds'

  return (
    <div className="space-y-4" data-testid="feeds-tab">
      <PillSwitcher items={pills} activeId={effectiveSubTab} onChange={id => setActiveSubTab(id as SubTab)} />

      {effectiveSubTab === 'feeds' && <UnifiedFeedsPanel isSuperAdmin={isSuperAdmin} />}
      {effectiveSubTab === 'pipeline' && <PipelineHealthPanel />}
    </div>
  )
}
