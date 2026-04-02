/**
 * Verifies EnrichmentQualityWidget was removed from DashboardPage.
 * The widget showed internal enrichment metrics — not customer-facing.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { DashboardPage } from '@/pages/DashboardPage'

vi.mock('@/hooks/use-intel-data', () => ({
  useDashboardStats: () => ({ data: null, isDemo: false }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector: (s: object) => unknown) =>
    selector({ user: { displayName: 'Analyst', email: 'a@b.com' }, tenant: { name: 'ACME' }, accessToken: 'tok' }),
  ),
}))

vi.mock('@/hooks/use-dashboard-mode', () => ({
  useDashboardMode: () => ({ mode: 'global', profile: null }),
}))

vi.mock('@/components/viz/SeverityHeatmap',    () => ({ SeverityHeatmap:    () => null }))
vi.mock('@/components/viz/ThreatTimeline',     () => ({ ThreatTimeline:     () => null }))
vi.mock('@/components/viz/AmbientBackground',  () => ({ AmbientBackground:  () => null }))
vi.mock('@/components/widgets/ThreatLandscapeBanner', () => ({ ThreatLandscapeBanner: () => null }))
vi.mock('@/components/widgets/RecentIocWidget', () => ({ RecentIocWidget: () => null }))
vi.mock('@/components/widgets/IocTrendWidget', () => ({ IocTrendWidget: () => null }))
vi.mock('@/components/widgets/FeedHealthWidget', () => ({ FeedHealthWidget: () => null }))
vi.mock('@/components/widgets/TopActorsWidget', () => ({ TopActorsWidget: () => null }))
vi.mock('@/components/widgets/TopCvesWidget', () => ({ TopCvesWidget: () => null }))
vi.mock('@/components/widgets/RecentAlertsWidget', () => ({ RecentAlertsWidget: () => null }))
vi.mock('@/components/widgets/SeverityTrendWidget', () => ({ SeverityTrendWidget: () => null }))
vi.mock('@/components/widgets/ProfileMatchWidget', () => ({ ProfileMatchWidget: () => null }))
vi.mock('@/components/widgets/GeoThreatWidget', () => ({ GeoThreatWidget: () => null }))

import React from 'react'

describe('EnrichmentQualityWidget removed from Dashboard', () => {
  it('does not render enrichment quality widget (internal admin scope)', () => {
    render(<DashboardPage />)
    expect(screen.queryByTestId('enrichment-quality-widget')).not.toBeInTheDocument()
  })
})
