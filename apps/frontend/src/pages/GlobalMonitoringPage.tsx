/**
 * @module pages/GlobalMonitoringPage
 * @description Global Pipeline Monitoring Dashboard — super_admin only.
 * Shows pipeline flow, feed health, IOC stats, corroboration leaders, subscriptions.
 * DECISION-029 Phase E.
 */
import { useState } from 'react'
import { useGlobalMonitoring } from '@/hooks/use-global-monitoring'
import type { QueueHealthEntry } from '@/hooks/use-global-catalog'
import { AdmiraltyBadge } from '@/components/AdmiraltyBadge'
import { StixConfidenceBadge } from '@/components/StixConfidenceBadge'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import {
  Activity, ArrowRight, Globe, Pause, Play,
  RefreshCw, RotateCcw, Shield,
} from 'lucide-react'

const REFRESH_OPTIONS = [
  { label: '10s', value: 10_000 },
  { label: '30s', value: 30_000 },
  { label: '60s', value: 60_000 },
  { label: 'Off', value: 0 },
]

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    healthy: 'bg-sev-low/20 text-sev-low',
    degraded: 'bg-amber-400/20 text-amber-400',
    critical: 'bg-sev-critical/20 text-sev-critical',
  }
  return (
    <span data-testid="status-badge" className={cn('px-2 py-0.5 rounded-full text-xs font-bold uppercase', styles[status] ?? styles.healthy)}>
      {status}
    </span>
  )
}

function getOverallStatus(data: ReturnType<typeof useGlobalMonitoring>): string {
  const feeds = data.feedHealth
  const stale = feeds.filter(f => f.enabled && f.lastFetchAt && Date.now() - new Date(f.lastFetchAt).getTime() > 7_200_000)
  const stuck = data.pipelineHealth?.pipeline?.articlesProcessed24h === 0 && !data.isDemo
  if (stale.length > feeds.filter(f => f.enabled).length * 0.5 || stuck) return 'critical'
  if (stale.length > 0) return 'degraded'
  return 'healthy'
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/* ─── Pipeline Flow Diagram ──────────────────────────────── */
function PipelineFlow({ queues }: { queues: QueueHealthEntry[] }) {
  const stages = [
    { name: 'Fetch', queues: queues.filter(q => q.name.includes('fetch')) },
    { name: 'Normalize', queues: queues.filter(q => q.name.includes('normalize')) },
    { name: 'Enrich', queues: queues.filter(q => q.name.includes('enrich')) },
  ]

  return (
    <div data-testid="pipeline-flow" className="flex items-center gap-2 overflow-x-auto py-2">
      <div className="shrink-0 p-2 rounded-lg bg-bg-secondary border border-border text-center min-w-[80px]">
        <Globe className="w-4 h-4 mx-auto text-teal-400 mb-1" />
        <span className="text-[10px] font-medium text-text-primary">Feeds</span>
      </div>
      {stages.map((stage, _i) => {
        const total = stage.queues.reduce((s, q) => s + q.waiting + q.active, 0)
        const failed = stage.queues.reduce((s, q) => s + q.failed, 0)
        const color = failed > 10 ? 'border-sev-critical' : total > 20 ? 'border-amber-400' : 'border-sev-low'
        return (
          <div key={stage.name} className="flex items-center gap-2">
            <ArrowRight className="w-3 h-3 text-text-muted shrink-0" />
            <div className={cn('shrink-0 p-2 rounded-lg bg-bg-secondary border min-w-[90px] text-center', color)}>
              <span className="text-xs font-medium text-text-primary block">{stage.name}</span>
              <div className="flex justify-center gap-2 mt-1 text-[10px]">
                <span className="text-text-muted">{total} queued</span>
                {failed > 0 && <span className="text-sev-critical">{failed} failed</span>}
              </div>
            </div>
          </div>
        )
      })}
      <ArrowRight className="w-3 h-3 text-text-muted shrink-0" />
      <div className="shrink-0 p-2 rounded-lg bg-bg-secondary border border-border text-center min-w-[80px]">
        <Shield className="w-4 h-4 mx-auto text-accent mb-1" />
        <span className="text-[10px] font-medium text-text-primary">Alert</span>
      </div>
    </div>
  )
}

/* ─── Feed Health Card ──────────────────────────────────── */
function FeedCard({ feed }: { feed: ReturnType<typeof useGlobalMonitoring>['feedHealth'][0] }) {
  const isStale = feed.enabled && feed.lastFetchAt && Date.now() - new Date(feed.lastFetchAt).getTime() > 7_200_000
  const isDisabledByFailure = !feed.enabled && feed.consecutiveFailures >= 3
  const borderColor = isDisabledByFailure ? 'border-sev-critical' : isStale ? 'border-amber-400' : 'border-border'

  return (
    <div data-testid="feed-card" className={cn('p-3 rounded-lg bg-bg-secondary border', borderColor)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-primary truncate flex-1">{feed.name}</span>
        <AdmiraltyBadge source={feed.sourceReliability} cred={feed.infoCred} />
      </div>
      <div className="grid grid-cols-2 gap-1 text-[10px]">
        <span className="text-text-muted">Last fetch</span>
        <span className="text-text-secondary text-right">{timeAgo(feed.lastFetchAt)}</span>
        <span className="text-text-muted">Reliability</span>
        <span className="text-text-secondary text-right">{feed.feedReliability}%</span>
        <span className="text-text-muted">Failures</span>
        <span className={cn('text-right', feed.consecutiveFailures >= 3 ? 'text-sev-critical' : 'text-text-secondary')}>
          {feed.consecutiveFailures}
        </span>
      </div>
      {/* Reliability bar */}
      <div className="mt-2 h-1 rounded-full bg-bg-elevated overflow-hidden">
        <div className="h-full rounded-full bg-sev-low" style={{ width: `${feed.feedReliability}%` }} />
      </div>
      {isDisabledByFailure && (
        <button className="mt-2 text-[10px] px-2 py-0.5 rounded bg-sev-critical/10 text-sev-critical hover:bg-sev-critical/20 transition-colors w-full">
          Re-enable
        </button>
      )}
    </div>
  )
}

/* ─── Stat Card ──────────────────────────────────────────── */
function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="p-3 bg-bg-secondary rounded-lg border border-border">
      <span className="text-[10px] text-text-muted block">{label}</span>
      <span className={cn('text-lg font-bold tabular-nums', color ?? 'text-text-primary')}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
      {sub && <span className="text-[10px] text-text-muted block">{sub}</span>}
    </div>
  )
}

/* ─── Main Component ─────────────────────────────────────── */
export function GlobalMonitoringPage() {
  const [refreshInterval, setRefreshInterval] = useState(30_000)
  const [showPauseModal, setShowPauseModal] = useState(false)
  const user = useAuthStore(s => s.user)
  const monitoring = useGlobalMonitoring(refreshInterval)
  const { pipelineHealth, feedHealth, iocStats, corroborationLeaders, subscriptionStats, isDemo } = monitoring
  const status = getOverallStatus(monitoring)

  if (user?.role !== 'super_admin' && user?.role !== 'admin') {
    return <div className="p-6 text-text-muted">Access restricted to administrators.</div>
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {isDemo && (
        <div className="bg-bg-elevated border-b border-border px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">Demo</span>
          <span className="text-xs text-text-muted">Demo data — connect backend for live pipeline</span>
        </div>
      )}

      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-semibold text-text-primary">Global Pipeline Monitor</h1>
          <StatusBadge status={status} />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={refreshInterval}
            onChange={e => setRefreshInterval(Number(e.target.value))}
            className="text-xs bg-bg-secondary border border-border rounded px-2 py-1 text-text-primary"
            data-testid="refresh-select"
          >
            {REFRESH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={() => window.location.reload()} className="p-1.5 rounded bg-bg-secondary border border-border hover:bg-bg-elevated transition-colors" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5 text-text-muted" />
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {/* Section 1: Pipeline Flow */}
        <section>
          <h2 className="text-sm font-medium text-text-primary mb-3">Pipeline Flow</h2>
          <PipelineFlow queues={pipelineHealth?.queues ?? []} />
        </section>

        {/* Section 2: Feed Health Grid */}
        <section>
          <h2 className="text-sm font-medium text-text-primary mb-3">Feed Health ({feedHealth.length})</h2>
          <div data-testid="feed-health-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {feedHealth.map(feed => <FeedCard key={feed.id} feed={feed} />)}
          </div>
        </section>

        {/* Section 3: IOC Stats */}
        {iocStats && (
          <section>
            <h2 className="text-sm font-medium text-text-primary mb-3">IOC Pipeline Stats</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <StatCard label="Total Global IOCs" value={iocStats.totalGlobalIOCs} color="text-accent" />
              <StatCard label="Created 24h" value={iocStats.created24h} />
              <StatCard label="Enriched 24h" value={iocStats.enriched24h} />
              <StatCard label="Unenriched" value={iocStats.unenriched} color="text-amber-400" />
              <StatCard label="Warninglist Filtered" value={iocStats.warninglistFiltered} sub="Known-good excluded" />
              <StatCard label="Avg Confidence" value={iocStats.avgConfidence} sub={iocStats.avgConfidence >= 70 ? 'High' : iocStats.avgConfidence >= 30 ? 'Medium' : 'Low'} />
              <StatCard label="High-Confidence" value={iocStats.highConfidenceCount} sub="Score ≥ 70" color="text-sev-low" />
            </div>

            {/* Confidence + Type distribution */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div className="p-3 bg-bg-secondary rounded-lg border border-border">
                <span className="text-xs font-medium text-text-primary mb-2 block">Confidence Tiers</span>
                {Object.entries(iocStats.byConfidenceTier).map(([tier, count]) => {
                  const pct = iocStats.totalGlobalIOCs > 0 ? Math.round(count / iocStats.totalGlobalIOCs * 100) : 0
                  const colors: Record<string, string> = { High: 'bg-sev-low', Medium: 'bg-amber-400', Low: 'bg-sev-critical', None: 'bg-text-muted' }
                  return (
                    <div key={tier} className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-text-muted w-12 shrink-0">{tier}</span>
                      <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', colors[tier] ?? 'bg-text-muted')} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] tabular-nums text-text-secondary w-16 text-right">{count.toLocaleString()} ({pct}%)</span>
                    </div>
                  )
                })}
              </div>
              <div className="p-3 bg-bg-secondary rounded-lg border border-border">
                <span className="text-xs font-medium text-text-primary mb-2 block">IOC Type Distribution</span>
                {Object.entries(iocStats.byType).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
                  const pct = iocStats.totalGlobalIOCs > 0 ? Math.round(count / iocStats.totalGlobalIOCs * 100) : 0
                  return (
                    <div key={type} className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-text-muted w-12 shrink-0 uppercase font-mono">{type}</span>
                      <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] tabular-nums text-text-secondary w-16 text-right">{count.toLocaleString()} ({pct}%)</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* Section 4: Corroboration Leaders */}
        <section>
          <h2 className="text-sm font-medium text-text-primary mb-3">Corroboration Leaders (Top 10)</h2>
          <div className="overflow-x-auto">
            <table data-testid="corroboration-table" className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-text-muted font-medium">Value</th>
                  <th className="text-left py-2 px-2 text-text-muted font-medium">Type</th>
                  <th className="text-left py-2 px-2 text-text-muted font-medium">Confidence</th>
                  <th className="text-left py-2 px-2 text-text-muted font-medium">Sources</th>
                  <th className="text-left py-2 px-2 text-text-muted font-medium">First Seen</th>
                </tr>
              </thead>
              <tbody>
                {corroborationLeaders.map(row => (
                  <tr
                    key={row.id}
                    data-testid="corroboration-row"
                    className="border-b border-border/50 hover:bg-bg-elevated/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedIocId(row.id)}
                  >
                    <td className="py-1.5 px-2 font-mono text-text-primary truncate max-w-[200px]">{row.value}</td>
                    <td className="py-1.5 px-2 uppercase text-text-muted font-mono">{row.iocType}</td>
                    <td className="py-1.5 px-2"><StixConfidenceBadge score={row.confidence} variant="compact" /></td>
                    <td className="py-1.5 px-2 text-text-secondary">{row.crossFeedCorroboration} feeds</td>
                    <td className="py-1.5 px-2 text-text-muted">{timeAgo(row.firstSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 5: Subscriptions */}
        <section>
          <h2 className="text-sm font-medium text-text-primary mb-3">Subscription Overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Total Subscriptions" value={subscriptionStats.total} />
            <StatCard label="Unique Tenants" value={subscriptionStats.uniqueTenants} />
            <div className="p-3 bg-bg-secondary rounded-lg border border-border">
              <span className="text-[10px] text-text-muted block mb-1">Most Popular Feeds</span>
              {subscriptionStats.popularFeeds.map(f => (
                <div key={f.name} className="flex items-center justify-between text-[10px]">
                  <span className="text-text-secondary truncate">{f.name}</span>
                  <span className="text-text-muted tabular-nums">{f.count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 6: Actions */}
        <section>
          <div data-testid="action-bar" className="flex flex-wrap items-center gap-2 p-3 bg-bg-secondary rounded-lg border border-border">
            <button
              data-testid="pause-btn"
              onClick={() => setShowPauseModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-sev-critical/10 text-sev-critical hover:bg-sev-critical/20 transition-colors"
            >
              <Pause className="w-3 h-3" /> Pause Pipeline
            </button>
            <button
              onClick={() => monitoring.resumePipeline()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-sev-low/10 text-sev-low hover:bg-sev-low/20 transition-colors"
            >
              <Play className="w-3 h-3" /> Resume Pipeline
            </button>
            <button
              onClick={() => monitoring.retriggerFailed('etip-enrich-global')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Retrigger Failed
            </button>
          </div>
        </section>
      </div>

      {/* Pause confirmation modal */}
      {showPauseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="pause-modal">
          <div className="bg-bg-primary border border-border rounded-lg p-6 max-w-sm mx-4">
            <h3 className="text-sm font-medium text-text-primary mb-2">Pause Global Pipeline?</h3>
            <p className="text-xs text-text-muted mb-4">This will stop all global feed fetching, normalization, and enrichment. Existing jobs will complete.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowPauseModal(false)} className="px-3 py-1.5 text-xs rounded bg-bg-secondary text-text-primary hover:bg-bg-elevated border border-border">Cancel</button>
              <button
                onClick={() => { monitoring.pausePipeline(); setShowPauseModal(false) }}
                className="px-3 py-1.5 text-xs rounded bg-sev-critical text-white hover:bg-sev-critical/80"
              >
                Pause
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
