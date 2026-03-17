// DESIGN LOCKED — see UI_DESIGN_LOCK.md
// FROZEN: h-9, bg-bg-secondary, item order, live indicator rightmost
// Architecture: pure presentational — no data fetching in shared-ui.
// Parent (DashboardLayout) passes stats as props; '—' shown when undefined.
import React from 'react'
import { Shield, AlertTriangle, Activity, Zap, Clock } from 'lucide-react'

export interface TopStatsBarProps {
  totalIOCs?:     number | string
  criticalIOCs?:  number | string
  activeFeeds?:   number | string
  enrichedToday?: number | string
  lastIngestTime?:string
}

function StatItem({ icon, label, value, highlight }: {
  icon: React.ReactNode; label: string; value?: number | string; highlight?: 'critical'
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={highlight === 'critical' ? 'text-[var(--sev-critical)] font-medium' : 'text-[var(--text-primary)]'}>
        {value ?? '—'}
      </span>
    </div>
  )
}

function StatDivider() {
  return <span className="text-[var(--border-strong)]">·</span>
}

// FROZEN: h-9, bg-bg-secondary border-b border-border, item order, live indicator rightmost
// min-w-max ensures single-line scroll on mobile (parent wraps in overflow-x-auto)
export function TopStatsBar({
  totalIOCs, criticalIOCs, activeFeeds, enrichedToday, lastIngestTime,
}: TopStatsBarProps) {
  return (
    <div className="h-9 bg-[var(--bg-secondary)] border-b border-[var(--border)] flex items-center px-4 gap-6 text-xs shrink-0 min-w-max">
      <StatItem icon={<Shield className="w-3 h-3 text-[var(--text-muted)]"/>}          label="IOCs"           value={typeof totalIOCs === 'number' ? totalIOCs.toLocaleString() : totalIOCs}/>
      <StatDivider/>
      <StatItem icon={<AlertTriangle className="w-3 h-3 text-[var(--sev-critical)]"/>}  label="Critical"       value={criticalIOCs} highlight="critical"/>
      <StatDivider/>
      <StatItem icon={<Activity className="w-3 h-3 text-[var(--text-muted)]"/>}         label="Feeds"          value={activeFeeds !== undefined ? `${activeFeeds} active` : undefined}/>
      <StatDivider/>
      <StatItem icon={<Zap className="w-3 h-3 text-yellow-400"/>}                       label="Enriched today" value={typeof enrichedToday === 'number' ? enrichedToday.toLocaleString() : enrichedToday}/>
      <StatDivider/>
      <StatItem icon={<Clock className="w-3 h-3 text-[var(--text-muted)]"/>}            label="Last ingest"    value={lastIngestTime}/>
      {/* FROZEN: live indicator — always ml-auto rightmost, exact classes */}
      <div className="ml-auto flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>
        <span className="text-[var(--text-muted)]">Live</span>
      </div>
    </div>
  )
}
