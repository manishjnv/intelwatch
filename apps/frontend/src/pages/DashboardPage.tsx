/**
 * @module pages/DashboardPage
 * @description Dashboard overview — org-aware widgets, severity heatmap,
 * and threat timeline. Customer-facing only.
 */
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import { useDashboardStats } from '@/hooks/use-intel-data'
import { useDashboardMode } from '@/hooks/use-dashboard-mode'
import { useDashboardView } from '@/hooks/use-dashboard-view'
import { InvestigationDrawerProvider } from '@/hooks/use-investigation-drawer'
import { Settings, BarChart3, LineChart } from 'lucide-react'

// Viz components
import { SeverityHeatmap } from '@/components/viz/SeverityHeatmap'
import { ThreatTimeline } from '@/components/viz/ThreatTimeline'
import { AmbientBackground } from '@/components/viz/AmbientBackground'

// Dashboard widgets
import { ThreatLandscapeBanner } from '@/components/widgets/ThreatLandscapeBanner'
import { RecentIocWidget } from '@/components/widgets/RecentIocWidget'
import { IocTrendWidget } from '@/components/widgets/IocTrendWidget'
import { TopActorsWidget } from '@/components/widgets/TopActorsWidget'
import { TopCvesWidget } from '@/components/widgets/TopCvesWidget'
import { RecentAlertsWidget } from '@/components/widgets/RecentAlertsWidget'
import { SeverityTrendWidget } from '@/components/widgets/SeverityTrendWidget'
import { ProfileMatchWidget } from '@/components/widgets/ProfileMatchWidget'
import { GeoThreatWidget } from '@/components/widgets/GeoThreatWidget'
import { ThreatScoreWidget } from '@/components/widgets/ThreatScoreWidget'
import { ThreatBriefingWidget } from '@/components/widgets/ThreatBriefingWidget'
import { AttackTechniqueWidget } from '@/components/widgets/AttackTechniqueWidget'
import { ExecSummaryCards } from '@/components/widgets/ExecSummaryCards'
import { InvestigationDrawer } from '@/components/investigation/InvestigationDrawer'

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
  const { data: liveStats } = useDashboardStats()
  const { mode, profile } = useDashboardMode()
  const { view, toggleView } = useDashboardView()

  // Format plan tier for display
  const planLabel = tenant?.plan
    ? `${tenant.plan.charAt(0).toUpperCase()}${tenant.plan.slice(1)} Plan`
    : 'Free Plan'

  // Derive threat level from critical IOC count
  const threatLevel = (liveStats?.criticalIOCs ?? 0) > 20 ? 'critical' as const
    : (liveStats?.criticalIOCs ?? 0) > 10 ? 'high' as const
    : (liveStats?.criticalIOCs ?? 0) > 0 ? 'elevated' as const : 'normal' as const

  return (
    <InvestigationDrawerProvider>
    <div className="relative">
      <AmbientBackground threatLevel={threatLevel} />

      <div className="relative z-10 p-4 sm:p-6">
        {/* Welcome header + view toggle */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-text-primary">
              Welcome back, {user?.displayName ?? 'Analyst'}
            </h1>
            <p className="text-sm text-text-muted mt-0.5">
              {tenant?.name ?? 'Your organization'} &bull; {planLabel}
            </p>
          </div>

          <button
            data-testid="view-toggle"
            onClick={toggleView}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
              bg-[var(--bg-elevated)] border border-[var(--border)] text-text-secondary
              hover:text-text-primary hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]
              transition-all duration-150 cursor-pointer shrink-0"
          >
            {view === 'analyst' ? <LineChart className="w-3.5 h-3.5" /> : <BarChart3 className="w-3.5 h-3.5" />}
            {view === 'analyst' ? 'Executive' : 'Analyst'} View
          </button>
        </div>

        {/* Conditional: Threat Landscape banner or Org Profile CTA */}
        {mode === 'org-aware' && profile && <ThreatLandscapeBanner profile={profile} />}
        {mode === 'global' && <OrgProfileCta />}

        {/* Daily Briefing — shown in both views */}
        <ThreatBriefingWidget profile={profile} />

        {view === 'executive' ? (
          /* ── Executive View ─────────────────────────────────── */
          <ExecSummaryCards />
        ) : (
          /* ── Analyst View (default) ─────────────────────────── */
          <>
            {/* Severity Heatmap — profile-aware highlighting */}
            <SeverityHeatmap className="mb-6" profile={profile} />

            {/* Widget grid — responsive 1/2/3/4 cols */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
              <ThreatScoreWidget profile={profile} />
              <RecentIocWidget />
              <IocTrendWidget />
              <TopActorsWidget profile={profile} />
              <TopCvesWidget />
              <RecentAlertsWidget />
              <SeverityTrendWidget />
              <AttackTechniqueWidget />
              <GeoThreatWidget profile={profile} />
              {mode === 'org-aware' && <ProfileMatchWidget profile={profile} />}
            </div>

            {/* Threat Timeline */}
            <ThreatTimeline className="mt-6" />
          </>
        )}
      </div>

      {/* Investigation Drawer — slide-over for IOC details */}
      <InvestigationDrawer />
    </div>
    </InvestigationDrawerProvider>
  )
}
