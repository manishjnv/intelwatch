/**
 * @module components/ioc/IocStatsCards
 * @description 6 compact IOC stats mini-cards — collapsible row between FilterBar and table.
 * Data: useIOCStats() + useEnrichmentStats(). Collapse state persisted in localStorage.
 */
import { useState } from 'react'
import { ChevronDown, Shield, Layers, AlertTriangle, Activity, Radio, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────

interface IOCStatsData {
  total: number
  byType: Record<string, number>
  bySeverity: Record<string, number>
  byLifecycle: Record<string, number>
}

interface EnrichmentStatsData {
  total: number
  enriched: number
  pending: number
  failed: number
}

interface IocStatsCardsProps {
  stats: IOCStatsData | null
  enrichmentStats: EnrichmentStatsData | null
  feedCount?: number
}

// ─── Helpers ─────────────────────────────────────────────────────

const STORAGE_KEY = 'ioc-stats-collapsed'

function getInitialCollapsed(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === 'true' } catch { return false }
}

const SEV_COLORS: Record<string, string> = {
  critical: 'bg-sev-critical',
  high: 'bg-sev-high',
  medium: 'bg-sev-medium',
  low: 'bg-sev-low',
  info: 'bg-text-muted',
}

const SEV_TEXT: Record<string, string> = {
  critical: 'text-sev-critical',
  high: 'text-sev-high',
  medium: 'text-sev-medium',
  low: 'text-sev-low',
  info: 'text-text-muted',
}

const TYPE_COLORS: Record<string, string> = {
  ip: 'bg-blue-400', domain: 'bg-purple-400', url: 'bg-cyan-400',
  hash_sha256: 'bg-slate-400', hash_md5: 'bg-slate-500', hash_sha1: 'bg-slate-500',
  cve: 'bg-orange-400', email: 'bg-green-400',
}

const LIFECYCLE_STYLES: Record<string, string> = {
  new: 'text-accent bg-accent/10',
  active: 'text-sev-low bg-sev-low/10',
  aging: 'text-sev-medium bg-sev-medium/10',
  expired: 'text-text-muted bg-bg-elevated',
}

// ─── Mini cards ──────────────────────────────────────────────────

function MiniCard({ children, icon, label, testId }: {
  children: React.ReactNode
  icon: React.ReactNode
  label: string
  testId: string
}) {
  return (
    <div data-testid={testId} className="px-3 py-2.5 rounded-lg border border-border bg-bg-secondary/60 min-w-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-[10px] text-text-muted font-medium uppercase tracking-wider truncate">{label}</span>
      </div>
      {children}
    </div>
  )
}

/** Stacked horizontal bar from a record of counts */
function MiniBar({ data, colors, total }: { data: Record<string, number>; colors: Record<string, string>; total: number }) {
  if (total === 0) return <div className="h-2 rounded-full bg-bg-elevated" />
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-bg-elevated">
      {Object.entries(data).filter(([, v]) => v > 0).map(([key, val]) => (
        <div
          key={key}
          className={cn('h-full', colors[key] ?? 'bg-text-muted')}
          style={{ width: `${(val / total) * 100}%` }}
          title={`${key}: ${val}`}
        />
      ))}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────

export function IocStatsCards({ stats, enrichmentStats, feedCount }: IocStatsCardsProps) {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed)

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem(STORAGE_KEY, String(next)) } catch { /* noop */ }
  }

  const total = stats?.total ?? 0
  const sevTotal = Object.values(stats?.bySeverity ?? {}).reduce((s, v) => s + v, 0)
  const enrichTotal = enrichmentStats?.total ?? 0
  const enrichPct = enrichTotal > 0 ? Math.round(((enrichmentStats?.enriched ?? 0) / enrichTotal) * 100) : 0

  return (
    <div data-testid="ioc-stats-cards" className="border-b border-border">
      {/* Collapse toggle */}
      <button
        onClick={toggle}
        data-testid="ioc-stats-toggle"
        className="w-full flex items-center justify-between px-4 py-1.5 text-[10px] text-text-muted hover:text-text-secondary transition-colors"
      >
        <span className="uppercase tracking-wider font-medium">IOC Summary</span>
        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', !collapsed && 'rotate-180')} />
      </button>

      {/* Cards grid */}
      {!collapsed && (
        <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {/* 1: Total IOCs */}
          <MiniCard icon={<Shield className="w-3.5 h-3.5 text-accent" />} label="Total" testId="stat-total">
            <span className="text-lg font-bold text-text-primary tabular-nums">{total.toLocaleString()}</span>
          </MiniCard>

          {/* 2: By Type */}
          <MiniCard icon={<Layers className="w-3.5 h-3.5 text-purple-400" />} label="By Type" testId="stat-by-type">
            <MiniBar data={stats?.byType ?? {}} colors={TYPE_COLORS} total={total} />
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
              {Object.entries(stats?.byType ?? {}).slice(0, 4).map(([k, v]) => (
                <span key={k} className="text-[10px] text-text-muted">
                  <span className="text-text-secondary tabular-nums">{v}</span> {k}
                </span>
              ))}
            </div>
          </MiniCard>

          {/* 3: By Severity */}
          <MiniCard icon={<AlertTriangle className="w-3.5 h-3.5 text-sev-high" />} label="Severity" testId="stat-severity">
            <MiniBar data={stats?.bySeverity ?? {}} colors={SEV_COLORS} total={sevTotal} />
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
              {['critical', 'high', 'medium', 'low'].map(s => {
                const v = (stats?.bySeverity ?? {})[s] ?? 0
                if (v === 0) return null
                return (
                  <span key={s} className={cn('text-[10px] tabular-nums', SEV_TEXT[s])}>
                    {v} {s}
                  </span>
                )
              })}
            </div>
          </MiniCard>

          {/* 4: By Lifecycle */}
          <MiniCard icon={<Activity className="w-3.5 h-3.5 text-sev-low" />} label="Lifecycle" testId="stat-lifecycle">
            <div className="flex flex-wrap gap-1 mt-0.5">
              {['new', 'active', 'aging', 'expired'].map(lc => {
                const v = (stats?.byLifecycle ?? {})[lc] ?? 0
                return (
                  <span key={lc} className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium tabular-nums', LIFECYCLE_STYLES[lc] ?? 'text-text-muted')}>
                    {v} {lc}
                  </span>
                )
              })}
            </div>
          </MiniCard>

          {/* 5: Sources / Feeds */}
          <MiniCard icon={<Radio className="w-3.5 h-3.5 text-green-400" />} label="Sources" testId="stat-sources">
            <span className="text-lg font-bold text-text-primary tabular-nums">{feedCount ?? '—'}</span>
            <span className="text-[10px] text-text-muted ml-1">active feeds</span>
          </MiniCard>

          {/* 6: Enrichment Coverage */}
          <MiniCard icon={<Cpu className="w-3.5 h-3.5 text-amber-400" />} label="Enrichment" testId="stat-enrichment">
            <div className="flex items-baseline gap-1.5">
              <span className={cn('text-lg font-bold tabular-nums', enrichPct >= 70 ? 'text-sev-low' : enrichPct >= 40 ? 'text-sev-medium' : 'text-text-muted')}>
                {enrichPct}%
              </span>
              <span className="text-[10px] text-text-muted">covered</span>
            </div>
            <div className="h-1.5 rounded-full bg-bg-elevated mt-1 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', enrichPct >= 70 ? 'bg-sev-low' : enrichPct >= 40 ? 'bg-sev-medium' : 'bg-text-muted')}
                style={{ width: `${enrichPct}%` }}
              />
            </div>
          </MiniCard>
        </div>
      )}
    </div>
  )
}
