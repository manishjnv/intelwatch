/**
 * @module pages/DashboardPage
 * @description Dashboard overview — org-aware widgets, severity heatmap,
 * and threat timeline. Customer-facing only.
 */
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useDashboardStats } from '@/hooks/use-intel-data'
import { useDashboardMode } from '@/hooks/use-dashboard-mode'
import { ArrowRight, Search, Shield, Settings } from 'lucide-react'

// Viz components
import { SeverityHeatmap } from '@/components/viz/SeverityHeatmap'
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
import { GeoThreatWidget } from '@/components/widgets/GeoThreatWidget'

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
  { label: 'Search Intel', icon: <Search className="w-3.5 h-3.5" />, action: 'search' },
]

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
        onClick={() => navigate('/command-center#settings')}
        className="px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors shrink-0"
      >
        Set Up Profile
      </button>
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
          <GeoThreatWidget profile={profile} />
          {mode === 'org-aware' && <ProfileMatchWidget profile={profile} />}
        </div>

        {/* Threat Timeline */}
        <ThreatTimeline className="mt-6" />
      </div>
    </div>
  )
}
