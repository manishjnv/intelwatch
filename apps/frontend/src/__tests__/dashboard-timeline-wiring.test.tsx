/**
 * @module __tests__/dashboard-timeline-wiring
 * @description Verifies DashboardPage builds ThreatTimeline events from real
 * useIOCs data — never the removed generateStubEvents fake patterns.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { DashboardPage } from '@/pages/DashboardPage'

const MOCK_IOCS = [
  { id: '1', iocType: 'ip', normalizedValue: '10.0.0.1', severity: 'critical', firstSeen: '2026-03-01T00:00:00Z', lastSeen: '2026-03-02T00:00:00Z' },
  { id: '2', iocType: 'domain', normalizedValue: 'evil.com', severity: 'high', firstSeen: '2026-03-03T00:00:00Z', lastSeen: '2026-03-04T00:00:00Z' },
]

vi.mock('@/hooks/use-intel-data', () => ({
  useIOCs: () => ({ data: { data: MOCK_IOCS, total: 2 }, isLoading: false }),
  useDashboardStats: () => ({ data: { criticalIOCs: 1 } }),
}))

vi.mock('@/hooks/use-dashboard-mode', () => ({
  useDashboardMode: () => ({ mode: 'global', profile: null }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: object) => unknown) =>
    selector({ user: { displayName: 'Analyst' }, tenant: { name: 'ACME', plan: 'free' } }),
}))

vi.mock('@/components/viz/SeverityHeatmap', () => ({ SeverityHeatmap: () => null }))
vi.mock('@/components/viz/AmbientBackground', () => ({ AmbientBackground: () => null }))
vi.mock('@/components/widgets/ThreatLandscapeBanner', () => ({ ThreatLandscapeBanner: () => null }))
vi.mock('@/components/widgets/RecentIocWidget', () => ({ RecentIocWidget: () => null }))
vi.mock('@/components/widgets/IocTrendWidget', () => ({ IocTrendWidget: () => null }))
vi.mock('@/components/widgets/TopActorsWidget', () => ({ TopActorsWidget: () => null }))
vi.mock('@/components/widgets/TopCvesWidget', () => ({ TopCvesWidget: () => null }))
vi.mock('@/components/widgets/RecentAlertsWidget', () => ({ RecentAlertsWidget: () => null }))
vi.mock('@/components/widgets/SeverityTrendWidget', () => ({ SeverityTrendWidget: () => null }))
vi.mock('@/components/widgets/ProfileMatchWidget', () => ({ ProfileMatchWidget: () => null }))
vi.mock('@/components/widgets/GeoThreatWidget', () => ({ GeoThreatWidget: () => null }))
vi.mock('@/components/widgets/ThreatScoreWidget', () => ({ ThreatScoreWidget: () => null }))
vi.mock('@/components/widgets/ThreatBriefingWidget', () => ({ ThreatBriefingWidget: () => null }))
vi.mock('@/components/widgets/AttackTechniqueWidget', () => ({ AttackTechniqueWidget: () => null }))

describe('DashboardPage — ThreatTimeline wired to real IOC data', () => {
  it('shows IOC-derived labels, never stub patterns', () => {
    render(<DashboardPage />)
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument()
    expect(screen.getByText('evil.com')).toBeInTheDocument()
    expect(screen.queryByText(/^Hash-/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Actor-/)).not.toBeInTheDocument()
  })
})
