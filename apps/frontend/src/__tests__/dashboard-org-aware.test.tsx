/**
 * @module __tests__/dashboard-org-aware.test
 * @description Verifies org-aware sections (threat landscape) were removed from Dashboard.
 * Threat Landscape / org profile will be placed in Command Center > Settings tab.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { DashboardPage } from '@/pages/DashboardPage'

// ─── Mock auth store ────────────────────────────────────────────

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: any) => any) => selector({
    user: { id: 'u1', email: 'a@test.com', displayName: 'Test', role: 'tenant_admin', tenantId: 't1', avatarUrl: null },
    accessToken: 'tok', tenant: { id: 't1', name: 'Test Org', slug: 'test', plan: 'teams' },
  }),
}))

// ─── Mock all data hooks ─────────────────────────────────────────

vi.mock('@/hooks/use-intel-data', () => ({
  useDashboardStats: () => ({ data: { totalIOCs: 25, activeFeeds: 5, enrichedToday: 10, criticalIOCs: 3 }, isDemo: false }),
}))

vi.mock('@/hooks/use-global-catalog', () => ({
  useGlobalPipelineHealth: () => ({
    data: { pipeline: { articlesProcessed24h: 100, iocsCreated24h: 50, iocsEnriched24h: 30, avgNormalizeLatencyMs: 120 } },
    isDemo: false,
  }),
}))

// Mock heavy child components to isolate test scope
vi.mock('@/components/viz/SeverityHeatmap', () => ({
  SeverityHeatmap: () => <div data-testid="severity-heatmap-mock" />,
}))
vi.mock('@/components/viz/ParallaxCard', () => ({
  ParallaxCard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/viz/ThreatTimeline', () => ({
  ThreatTimeline: () => <div data-testid="threat-timeline-mock" />,
}))
vi.mock('@/components/viz/AmbientBackground', () => ({
  AmbientBackground: () => null,
}))
vi.mock('@/hooks/use-count-up', () => ({
  useCountUp: (n: number) => n,
}))

describe('DashboardPage — org-aware sections removed', () => {
  it('does not render threat landscape section (moved to Command Center)', () => {
    render(<DashboardPage />)
    expect(screen.queryByTestId('threat-landscape')).not.toBeInTheDocument()
    expect(screen.queryByText('Your Threat Landscape')).not.toBeInTheDocument()
  })

  it('does not render recommended actions (moved to Command Center)', () => {
    render(<DashboardPage />)
    expect(screen.queryByText('Recommended Actions')).not.toBeInTheDocument()
  })

  it('still renders core dashboard elements', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('severity-heatmap-mock')).toBeInTheDocument()
    expect(screen.getByTestId('threat-timeline-mock')).toBeInTheDocument()
  })
})
