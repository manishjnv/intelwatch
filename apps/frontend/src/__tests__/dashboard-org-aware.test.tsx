/**
 * @module __tests__/dashboard-org-aware.test
 * @description Tests for org-aware dashboard modes: org-aware, global, super-admin.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { DashboardPage } from '@/pages/DashboardPage'

// ─── Mock stores ────────────────────────────────────────────────

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: any) => any) => selector({
    user: { id: 'u1', email: 'a@test.com', displayName: 'Test', role: 'tenant_admin', tenantId: 't1', avatarUrl: null },
    accessToken: 'tok', tenant: { id: 't1', name: 'Test Org', slug: 'test', plan: 'teams' },
  }),
}))

// ─── Mock data hooks ────────────────────────────────────────────

vi.mock('@/hooks/use-intel-data', () => ({
  useDashboardStats: () => ({ data: { totalIOCs: 25, activeFeeds: 5, enrichedToday: 10, criticalIOCs: 3 }, isDemo: false }),
}))

// ─── Mock viz/widget components ────────────────────────────────

vi.mock('@/components/viz/SeverityHeatmap', () => ({ SeverityHeatmap: () => <div data-testid="severity-heatmap-mock" /> }))
vi.mock('@/components/viz/ThreatTimeline', () => ({ ThreatTimeline: () => <div data-testid="threat-timeline-mock" /> }))
vi.mock('@/components/viz/AmbientBackground', () => ({ AmbientBackground: () => null }))

vi.mock('@/components/widgets/ThreatLandscapeBanner', () => ({
  ThreatLandscapeBanner: () => <div data-testid="threat-landscape-banner">Your Threat Landscape</div>,
}))
vi.mock('@/components/widgets/RecentIocWidget', () => ({ RecentIocWidget: () => <div data-testid="recent-ioc-widget-mock" /> }))
vi.mock('@/components/widgets/IocTrendWidget', () => ({ IocTrendWidget: () => <div data-testid="ioc-trend-widget-mock" /> }))
vi.mock('@/components/widgets/FeedHealthWidget', () => ({ FeedHealthWidget: () => <div data-testid="feed-health-widget-mock" /> }))
vi.mock('@/components/widgets/TopActorsWidget', () => ({ TopActorsWidget: () => <div data-testid="top-actors-widget-mock" /> }))
vi.mock('@/components/widgets/TopCvesWidget', () => ({ TopCvesWidget: () => <div data-testid="top-cves-widget-mock" /> }))
vi.mock('@/components/widgets/RecentAlertsWidget', () => ({ RecentAlertsWidget: () => <div data-testid="recent-alerts-widget-mock" /> }))
vi.mock('@/components/widgets/SeverityTrendWidget', () => ({ SeverityTrendWidget: () => <div data-testid="severity-trend-widget-mock" /> }))
vi.mock('@/components/widgets/ProfileMatchWidget', () => ({ ProfileMatchWidget: ({ profile }: any) => profile ? <div data-testid="profile-match-widget-mock" /> : null }))
vi.mock('@/components/widgets/GeoThreatWidget', () => ({ GeoThreatWidget: () => <div data-testid="geo-threat-widget-mock" /> }))

// ─── Dashboard mode mock (overridden per test) ─────────────────

const mockUseDashboardMode = vi.fn()
vi.mock('@/hooks/use-dashboard-mode', () => ({
  useDashboardMode: () => mockUseDashboardMode(),
}))

describe('DashboardPage — org-aware modes', () => {
  it('shows threat landscape banner when org profile is set', () => {
    mockUseDashboardMode.mockReturnValue({ mode: 'org-aware', profile: { industry: 'Technology' } })
    render(<DashboardPage />)
    expect(screen.getByTestId('threat-landscape-banner')).toBeInTheDocument()
    expect(screen.queryByTestId('org-profile-cta')).not.toBeInTheDocument()
  })

  it('shows org profile CTA when no profile set (global mode)', () => {
    mockUseDashboardMode.mockReturnValue({ mode: 'global', profile: null })
    render(<DashboardPage />)
    expect(screen.getByTestId('org-profile-cta')).toBeInTheDocument()
    expect(screen.queryByTestId('threat-landscape-banner')).not.toBeInTheDocument()
  })

  it('shows neither banner nor CTA for super-admin', () => {
    mockUseDashboardMode.mockReturnValue({ mode: 'super-admin', profile: null })
    render(<DashboardPage />)
    expect(screen.queryByTestId('threat-landscape-banner')).not.toBeInTheDocument()
    expect(screen.queryByTestId('org-profile-cta')).not.toBeInTheDocument()
  })

  it('renders widget grid in all modes', () => {
    mockUseDashboardMode.mockReturnValue({ mode: 'global', profile: null })
    render(<DashboardPage />)
    expect(screen.getByTestId('recent-ioc-widget-mock')).toBeInTheDocument()
    expect(screen.getByTestId('ioc-trend-widget-mock')).toBeInTheDocument()
    expect(screen.getByTestId('feed-health-widget-mock')).toBeInTheDocument()
    expect(screen.getByTestId('top-actors-widget-mock')).toBeInTheDocument()
    expect(screen.getByTestId('top-cves-widget-mock')).toBeInTheDocument()
    expect(screen.getByTestId('recent-alerts-widget-mock')).toBeInTheDocument()
    expect(screen.getByTestId('severity-trend-widget-mock')).toBeInTheDocument()
  })

  it('shows profile match widget only in org-aware mode', () => {
    mockUseDashboardMode.mockReturnValue({ mode: 'org-aware', profile: { industry: 'Technology' } })
    render(<DashboardPage />)
    expect(screen.getByTestId('profile-match-widget-mock')).toBeInTheDocument()
  })

  it('hides profile match widget in global mode', () => {
    mockUseDashboardMode.mockReturnValue({ mode: 'global', profile: null })
    render(<DashboardPage />)
    expect(screen.queryByTestId('profile-match-widget-mock')).not.toBeInTheDocument()
  })

  it('renders core elements (heatmap, timeline)', () => {
    mockUseDashboardMode.mockReturnValue({ mode: 'global', profile: null })
    render(<DashboardPage />)
    expect(screen.getByTestId('severity-heatmap-mock')).toBeInTheDocument()
    expect(screen.getByTestId('threat-timeline-mock')).toBeInTheDocument()
  })
})
