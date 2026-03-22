/**
 * @module pages/DashboardPage
 * @description Dashboard overview — uses design-locked IntelCard (3D hover)
 * and PageStatsBar + CompactStat from shared-ui.
 *
 * Locked components used:
 *   - IntelCard (Framer Motion 3D hover — UI_DESIGN_LOCK.md)
 *   - PageStatsBar + CompactStat (py-2, bg-bg-elevated/50 — UI_DESIGN_LOCK.md)
 *   - TooltipHelp (20-UI-UX mandate)
 *   - InlineHelp (20-UI-UX mandate)
 */
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { useCountUp } from '@/hooks/use-count-up'
import { MODULES, getPhaseColor, getPhaseBgColor } from '@/config/modules'
import { useDashboardStats } from '@/hooks/use-intel-data'
import { useCostStats, useEnrichmentStats } from '@/hooks/use-enrichment-data'
import { Zap, ArrowRight, Search, Activity, Shield, DollarSign, Brain } from 'lucide-react'

// UI improvements (#2, #13, #14, #15)
import { SeverityHeatmap } from '@/components/viz/SeverityHeatmap'
import { ParallaxCard } from '@/components/viz/ParallaxCard'
import { ThreatTimeline } from '@/components/viz/ThreatTimeline'
import { AmbientBackground } from '@/components/viz/AmbientBackground'

// ⛔ LOCKED imports from shared-ui
import { IntelCard } from '@etip/shared-ui/components/IntelCard'
import { PageStatsBar, CompactStat } from '@etip/shared-ui/components/PageStatsBar'
import { TooltipHelp } from '@etip/shared-ui/components/TooltipHelp'
import { InlineHelp } from '@etip/shared-ui/components/InlineHelp'

/* ------------------------------------------------------------------ */
/* Quick action config                                                 */
/* ------------------------------------------------------------------ */
interface QuickAction {
  label: string
  icon: React.ReactNode
  route?: string
  action?: string // 'search' triggers Cmd+K
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'View IOCs', icon: <Shield className="w-3.5 h-3.5" />, route: '/iocs' },
  { label: 'Manage Feeds', icon: <Activity className="w-3.5 h-3.5" />, route: '/feeds' },
  { label: 'Search Intel', icon: <Search className="w-3.5 h-3.5" />, action: 'search' },
]

/* ------------------------------------------------------------------ */
/* Animated stat display                                               */
/* ------------------------------------------------------------------ */
function AnimatedStat({ label, value, route, color }: {
  label: string; value: number | string; route?: string; color?: string
}) {
  const numeric = typeof value === 'number' ? value : 0
  const animated = useCountUp(numeric)
  const display = typeof value === 'number' ? String(animated) : value
  const navigate = useNavigate()

  const inner = <CompactStat label={label} value={display} color={color} />

  if (route) {
    return (
      <button onClick={() => navigate(route)} className="hover:opacity-80 transition-opacity cursor-pointer">
        {inner}
      </button>
    )
  }
  return inner
}

/* ------------------------------------------------------------------ */
/* Phase opacity for visual hierarchy                                  */
/* ------------------------------------------------------------------ */
function getPhaseOpacity(phase: number): string {
  switch (phase) {
    case 2: return 'opacity-100'
    case 3: return 'opacity-100'
    case 4: return 'opacity-75'
    case 5: return 'opacity-60'
    default: return 'opacity-100'
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const navigate = useNavigate()
  const { data: liveStats, isDemo } = useDashboardStats()
  const { data: costStats } = useCostStats()
  const { data: enrichStats } = useEnrichmentStats()

  // Trigger Cmd+K search
  const triggerSearch = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
  }

  // Derive threat level from critical IOC count
  const threatLevel = (liveStats?.criticalIOCs ?? 0) > 20 ? 'critical' as const
    : (liveStats?.criticalIOCs ?? 0) > 10 ? 'high' as const
    : (liveStats?.criticalIOCs ?? 0) > 0 ? 'elevated' as const : 'normal' as const

  return (
    <div className="relative">
      {/* Demo data banner */}
      {isDemo && (
        <div className="bg-[var(--bg-elevated)] border-b border-[var(--border)] px-4 py-1.5 flex items-center gap-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">Demo</span>
          <span className="text-xs text-[var(--text-muted)]">Demo data — connect backend for live intel</span>
        </div>
      )}

      {/* #15: Ambient background — dynamic pulse based on threat level */}
      <AmbientBackground threatLevel={threatLevel} />

      {/* ⛔ LOCKED: PageStatsBar — py-2, bg-bg-elevated/50, text-xs (UI_DESIGN_LOCK.md) */}
      <PageStatsBar>
        <AnimatedStat label="Total IOCs" value={liveStats?.totalIOCs ?? '—'} route="/iocs" />
        <AnimatedStat label="Active Feeds" value={liveStats?.activeFeeds ?? '—'} route="/feeds" />
        <AnimatedStat label="Enriched Today" value={liveStats?.enrichedToday ?? '—'} route="/iocs" />
        <AnimatedStat label="Critical IOCs" value={liveStats?.criticalIOCs ?? '—'} route="/iocs" color="text-sev-critical" />
      </PageStatsBar>

      <div className="relative z-10 p-4 sm:p-6">
        {/* Welcome header + quick actions */}
        <div className="mb-6">
          <h1 className="text-lg sm:text-xl font-semibold text-text-primary">
            Welcome back, {user?.displayName ?? 'Analyst'}
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            {tenant?.name ?? 'Your organization'} &bull; Free tier
          </p>

          {/* Quick action pills */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {QUICK_ACTIONS.map((qa) => (
              <button
                key={qa.label}
                onClick={() => qa.action === 'search' ? triggerSearch() : navigate(qa.route!)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                  bg-[var(--bg-elevated)] border border-[var(--border)] text-text-secondary
                  hover:text-text-primary hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]
                  transition-all duration-150 cursor-pointer"
              >
                {qa.icon}
                {qa.label}
                <ArrowRight className="w-3 h-3 opacity-50" />
              </button>
            ))}
          </div>
        </div>

        {/* Phase indicator */}
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
              <Zap className="w-4 h-4 text-accent" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-medium text-text-primary">Phase 1 Complete — Foundation Ready</h3>
                <TooltipHelp message="Phase 1 includes authentication, API gateway, database schema, and CI/CD pipeline. All passing 400+ tests." />
              </div>
              <p className="text-xs text-text-secondary mt-0.5">
                Authentication, API gateway, and infrastructure are live. The data pipeline (feed ingestion,
                normalization, AI enrichment) is coming in Phase 2. Click any card below to explore.
              </p>
              <InlineHelp message="Press Cmd+K (Mac) or Ctrl+K (Win) at any time to search across all intelligence." />
            </div>
          </div>
        </div>

        {/* Enrichment cost summary */}
        {costStats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div
              onClick={() => navigate('/enrichment')}
              className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <Brain className="w-3.5 h-3.5 text-accent" />
                <span className="text-xs text-text-muted">AI Enrichment</span>
              </div>
              <p className="text-sm font-semibold text-text-primary">{costStats.headline}</p>
            </div>
            <div
              onClick={() => navigate('/enrichment')}
              className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-3.5 h-3.5 text-sev-low" />
                <span className="text-xs text-text-muted">Quality Score</span>
              </div>
              <p className="text-sm font-semibold text-text-primary tabular-nums">
                {enrichStats?.avgQualityScore != null ? `${enrichStats.avgQualityScore}% avg` : '—'}
              </p>
            </div>
            <div
              onClick={() => navigate('/enrichment')}
              className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-3.5 h-3.5 text-sev-medium" />
                <span className="text-xs text-text-muted">Pending</span>
              </div>
              <p className="text-sm font-semibold text-text-primary tabular-nums">
                {enrichStats?.pending?.toLocaleString() ?? '—'} IOCs
              </p>
            </div>
          </div>
        )}

        {/* #2: Severity Heatmap Grid */}
        <SeverityHeatmap className="mb-6" />

        {/* Feature cards grid — ⛔ LOCKED: IntelCard with Framer Motion 3D hover, WRAPPED with #13 ParallaxCard */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {MODULES.map((mod) => {
            const Icon = mod.icon
            const phaseColor = getPhaseColor(mod.phase)
            const phaseBg = getPhaseBgColor(mod.phase)

            return (
              <ParallaxCard key={mod.id}>
              <IntelCard
                onClick={() => navigate(mod.route)}
                className={cn('group', getPhaseOpacity(mod.phase))}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                    'bg-[var(--bg-elevated)] group-hover:scale-110 transition-transform duration-200',
                    mod.color,
                  )}>
                    <Icon size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <h3 className="text-sm font-medium text-[var(--text-primary)] truncate">{mod.title}</h3>
                        <TooltipHelp message={mod.helpText} size={3} />
                      </div>
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium',
                        phaseBg, phaseColor,
                      )}>
                        Phase {mod.phase}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{mod.description}</p>
                  </div>
                </div>
              </IntelCard>
              </ParallaxCard>
            )
          })}
        </div>

        {/* #14: Threat Timeline */}
        <ThreatTimeline className="mt-6" />
      </div>
    </div>
  )
}
