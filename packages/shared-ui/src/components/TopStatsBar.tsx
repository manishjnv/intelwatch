// DESIGN LOCKED — see UI_DESIGN_LOCK.md
// FROZEN: h-9, bg-bg-secondary, item order, live indicator rightmost
import { Shield, AlertTriangle, Activity, Zap, Clock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
interface PlatformStats { totalIOCs:number; criticalIOCs:number; activeFeeds:number; enrichedToday:number; lastIngestTime:string }
function StatItem({ icon, label, value, highlight }: { icon:React.ReactNode; label:string; value?:number|string; highlight?:'critical' }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className={highlight==='critical' ? 'text-[var(--sev-critical)] font-medium' : 'text-[var(--text-primary)]'}>{value ?? '—'}</span>
    </div>
  )
}
function StatDivider() { return <span className="text-[var(--border-strong)]">·</span> }
export function TopStatsBar() {
  const { data: stats } = useQuery<PlatformStats>({
    queryKey: ['platform-stats'],
    queryFn: async () => { const res = await fetch('/api/v1/stats/platform'); return res.json() },
    staleTime: 30 * 60 * 1000,
  })
  return (
    <div className="h-9 bg-[var(--bg-secondary)] border-b border-[var(--border)] flex items-center px-4 gap-6 text-xs shrink-0 min-w-max">
      <StatItem icon={<Shield className="w-3 h-3 text-[var(--text-muted)]"/>} label="IOCs" value={stats?.totalIOCs?.toLocaleString()}/>
      <StatDivider/>
      <StatItem icon={<AlertTriangle className="w-3 h-3 text-[var(--sev-critical)]"/>} label="Critical" value={stats?.criticalIOCs} highlight="critical"/>
      <StatDivider/>
      <StatItem icon={<Activity className="w-3 h-3 text-[var(--text-muted)]"/>} label="Feeds" value={stats ? `${stats.activeFeeds} active` : undefined}/>
      <StatDivider/>
      <StatItem icon={<Zap className="w-3 h-3 text-yellow-400"/>} label="Enriched today" value={stats?.enrichedToday?.toLocaleString()}/>
      <StatDivider/>
      <StatItem icon={<Clock className="w-3 h-3 text-[var(--text-muted)]"/>} label="Last ingest" value={stats?.lastIngestTime}/>
      <div className="ml-auto flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>
        <span className="text-[var(--text-muted)]">Live</span>
      </div>
    </div>
  )
}
