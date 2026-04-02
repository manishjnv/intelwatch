/**
 * @module pages/DashboardPage
 * @description Dashboard overview — org-aware widgets, severity heatmap,
 * feature cards, and threat timeline.
 *
 * Locked components used:
 *   - IntelCard (Framer Motion 3D hover — UI_DESIGN_LOCK.md)
 *   - TooltipHelp (20-UI-UX mandate)
 */
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { MODULES } from '@/config/modules'
import { useDashboardStats } from '@/hooks/use-intel-data'
import { useDashboardMode } from '@/hooks/use-dashboard-mode'
import { ArrowRight, Search, Activity, Shield, Globe, Lock, Settings } from 'lucide-react'
import { useFeatureLimits, type FeatureKey } from '@/hooks/use-feature-limits'
import { useGlobalPipelineHealth } from '@/hooks/use-global-catalog'

// Viz components
import { SeverityHeatmap } from '@/components/viz/SeverityHeatmap'
import { ParallaxCard } from '@/components/viz/ParallaxCard'
import { ThreatTimeline } from '@/components/viz/ThreatTimeline'
import { AmbientBackground } from '@/components/viz/AmbientBackground'

// Dashboard widgets
import { ThreatLandscapeBanner } from '@/components/widgets/ThreatLandscapeBanner'
import { RecentIocWidget } from '@/components/widgets/RecentIocWidget'
import { IocTrendWidget } from '@/components/widgets/IocTrendWidget'
import { FeedHealthWidget } from '@/components/widgets/FeedHealthWidget'
import { TopActorsWidget } from '@/components/widgets/TopActorsWidget'
import { TopCvesWidget } from '@/components/widgets/TopCvesWidget'
import { RecentAlertsWidget } from '@/components/widgets/RecentAlertsWidget'
import { SeverityTrendWidget } from '@/components/widgets/SeverityTrendWidget'
import { ProfileMatchWidget } from '@/components/widgets/ProfileMatchWidget'

// Locked imports from shared-ui
import { IntelCard } from '@etip/shared-ui/components/IntelCard'
import { TooltipHelp } from '@etip/shared-ui/components/TooltipHelp'

/* ------------------------------------------------------------------ */
/* Quick action config                                                 */
/* ------------------------------------------------------------------ */
interface QuickAction {
  label: string
  icon: React.ReactNode
  route?: string
  action?: string
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'View IOCs', icon: <Shield className="w-3.5 h-3.5" />, route: '/iocs' },
  { label: 'Manage Feeds', icon: <Activity className="w-3.5 h-3.5" />, route: '/command-center' },
  { label: 'Search Intel', icon: <Search className="w-3.5 h-3.5" />, action: 'search' },
]

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
/* Global Pipeline Widget                                              */
/* ------------------------------------------------------------------ */
function GlobalPipelineWidget() {
  const navigate = useNavigate()
  const { data: health, isDemo } = useGlobalPipelineHealth()

  if (!health && !isDemo) return null

  const pipeline = health?.pipeline
  const statusColor = (pipeline?.articlesProcessed24h ?? 0) > 0 ? 'bg-sev-low' : 'bg-text-muted'

  return (
    <div
      data-testid="global-pipeline-widget"
      onClick={() => navigate('/global-monitoring')}
      className="p-3 bg-bg-secondary rounded-lg border border-border hover:border-border-strong cursor-pointer transition-colors mb-6"
    >
      <div className="flex items-center gap-2 mb-2">
        <Globe className="w-3.5 h-3.5 text-teal-400" />
        <span className="text-xs font-medium text-text-primary">Global Pipeline</span>
        <span className={cn('w-2 h-2 rounded-full', statusColor)} />
        {isDemo && <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">Demo</span>}
        <ArrowRight className="w-3 h-3 text-text-muted ml-auto" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <span className="text-[10px] text-text-muted block">Articles/24h</span>
          <span className="text-sm font-semibold text-text-primary tabular-nums">{(pipeline?.articlesProcessed24h ?? 0).toLocaleString()}</span>
        </div>
        <div>
          <span className="text-[10px] text-text-muted block">IOCs Created</span>
          <span className="text-sm font-semibold text-text-primary tabular-nums">{(pipeline?.iocsCreated24h ?? 0).toLocaleString()}</span>
        </div>
        <div>
          <span className="text-[10px] text-text-muted block">IOCs Enriched</span>
          <span className="text-sm font-semibold text-text-primary tabular-nums">{(pipeline?.iocsEnriched24h ?? 0).toLocaleString()}</span>
        </div>
        <div>
          <span className="text-[10px] text-text-muted block">Avg Latency</span>
          <span className="text-sm font-semibold text-text-primary tabular-nums">{pipeline?.avgNormalizeLatencyMs ?? 0}ms</span>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Org Profile CTA — shown when no profile set (not super admin)       */
/* ------------------------------------------------------------------ */
function OrgProfileCta() {
  const navigate = useNavigate()
  return (
    <div
      data-testid="org-profile-cta"
      className="p-4 bg-accent/5 border border-accent/20 rounded-lg mb-6 flex items-center gap-4"
    >
      <Settings className="w-8 h-8 text-accent shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">Personalize your dashboard</p>
        <p className="text-xs text-text-muted mt-0.5">
          Set your org profile to see threats relevant to your industry, tech stack, and risk areas.
        </p>
      </div>
      <button
        onClick={() => navigate('/command-center')}
        className="px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors shrink-0"
      >
        Set Up Profile
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Feature-gated dashboard module cards                                */
/* ------------------------------------------------------------------ */
const DASHBOARD_FEATURE_MAP: Record<string, FeatureKey> = {
  '/iocs': 'ioc_management',
  '/search': 'ioc_management',
  '/threat-actors': 'threat_actors',
  '/malware': 'malware_intel',
  '/vulnerabilities': 'vulnerability_intel',
  '/hunting': 'threat_hunting',
  '/graph': 'graph_exploration',
  '/drp': 'digital_risk_protection',
  '/correlation': 'correlation_engine',
}

function DashboardFeatureCards({ navigate }: { navigate: (path: string) => void }) {
  const { features } = useFeatureLimits()
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {MODULES.map((mod) => {
        const Icon = mod.icon
        const featureKey = DASHBOARD_FEATURE_MAP[mod.route]
        const isGated = featureKey ? !(features.find(f => f.featureKey === featureKey)?.enabled ?? true) : false

        return (
          <ParallaxCard key={mod.id}>
          <IntelCard
            onClick={() => navigate(mod.route)}
            className={cn('group relative', getPhaseOpacity(mod.phase))}
          >
            {isGated && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-bg-primary/80 rounded-xl" data-testid={`gated-card-${featureKey}`}>
                <Lock className="w-5 h-5 text-text-muted mb-1.5" />
                <span className="text-[10px] text-text-muted font-medium">Upgrade to access</span>
              </div>
            )}
            <div className="flex items-start gap-3">
              <div className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                'bg-[var(--bg-elevated)] group-hover:scale-110 transition-transform duration-200',
                isGated ? 'text-text-muted' : mod.color,
              )}>
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <h3 className="text-sm font-medium text-[var(--text-primary)] truncate">{mod.title}</h3>
                  <TooltipHelp message={mod.helpText} size={3} />
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{mod.description}</p>
              </div>
            </div>
          </IntelCard>
          </ParallaxCard>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const navigate = useNavigate()
  const { data: liveStats } = useDashboardStats()
  const { mode, profile } = useDashboardMode()

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
      <AmbientBackground threatLevel={threatLevel} />

      <div className="relative z-10 p-4 sm:p-6">
        {/* Welcome header + quick actions */}
        <div className="mb-6">
          <h1 className="text-lg sm:text-xl font-semibold text-text-primary">
            Welcome back, {user?.displayName ?? 'Analyst'}
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            {tenant?.name ?? 'Your organization'} &bull; Free tier
          </p>

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

        {/* Conditional: Threat Landscape banner or Org Profile CTA */}
        {mode === 'org-aware' && profile && <ThreatLandscapeBanner profile={profile} />}
        {mode === 'global' && <OrgProfileCta />}

        {/* Global Pipeline */}
        <GlobalPipelineWidget />

        {/* Severity Heatmap — profile-aware highlighting */}
        <SeverityHeatmap className="mb-6" profile={profile} />

        {/* Widget grid — responsive 1/2/3/4 cols */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
          <RecentIocWidget />
          <IocTrendWidget />
          <FeedHealthWidget />
          <TopActorsWidget profile={profile} />
          <TopCvesWidget />
          <RecentAlertsWidget />
          <SeverityTrendWidget />
          {mode === 'org-aware' && <ProfileMatchWidget profile={profile} />}
        </div>

        {/* Feature cards */}
        <DashboardFeatureCards navigate={navigate} />

        {/* Threat Timeline */}
        <ThreatTimeline className="mt-6" />
      </div>
    </div>
  )
}
