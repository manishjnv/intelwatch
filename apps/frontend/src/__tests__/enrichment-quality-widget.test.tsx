/**
 * Tests for EnrichmentQualityWidget + useEnrichmentQuality hook integration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { DashboardPage } from '@/pages/DashboardPage'

// ─── Mock hooks ─────────────────────────────────────────────────

const mockUseEnrichmentQuality = vi.fn()

vi.mock('@/hooks/use-enrichment-data', () => ({
  useCostStats:                 () => ({ data: null }),
  useEnrichmentStats:           () => ({ data: null }),
  useEnrichmentQuality:         () => mockUseEnrichmentQuality(),
  useEnrichmentSourceBreakdown: () => ({ data: null, isDemo: false }),
  useAiCostSummary:             () => ({ data: null, isDemo: false }),
}))

vi.mock('@/hooks/use-intel-data', () => ({
  useDashboardStats: () => ({ data: null, isDemo: true }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector: (s: object) => unknown) =>
    selector({ user: { displayName: 'Analyst', email: 'a@b.com' }, tenant: { name: 'ACME' }, accessToken: 'tok' }),
  ),
}))
vi.mock('@/stores/theme-store', () => ({ useThemeStore: vi.fn(() => ({ theme: 'dark' })) }))
vi.mock('@/stores/sidebar-store', () => ({ useSidebarStore: vi.fn(() => ({ isOpen: true, toggle: vi.fn() })) }))

// Stub heavy viz components
vi.mock('@/components/viz/SeverityHeatmap',    () => ({ SeverityHeatmap:    () => null }))
vi.mock('@/components/viz/ParallaxCard',       () => ({ ParallaxCard:       ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/viz/ThreatTimeline',     () => ({ ThreatTimeline:     () => null, generateStubEvents: () => [] }))
vi.mock('@/components/viz/AmbientBackground',  () => ({ AmbientBackground:  () => null }))

import React from 'react'

// ─── Tests ──────────────────────────────────────────────────────

describe('EnrichmentQualityWidget', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders high/medium/low confidence values from mock data', () => {
    mockUseEnrichmentQuality.mockReturnValue({
      data: {
        total: 1000, highConfidence: 360, mediumConfidence: 180, lowConfidence: 60,
        pendingEnrichment: 400, highPct: 36, mediumPct: 18, lowPct: 6,
      },
      isDemo: false,
    })
    render(<DashboardPage />)
    const widget = screen.getByTestId('enrichment-quality-widget')
    expect(widget).toBeInTheDocument()
    expect(widget.textContent).toContain('360')
    expect(widget.textContent).toContain('180')
    expect(widget.textContent).toContain('60')
  })

  it('shows pending enrichment count', () => {
    mockUseEnrichmentQuality.mockReturnValue({
      data: {
        total: 500, highConfidence: 180, mediumConfidence: 90, lowConfidence: 30,
        pendingEnrichment: 200, highPct: 36, mediumPct: 18, lowPct: 6,
      },
      isDemo: false,
    })
    render(<DashboardPage />)
    expect(screen.getByTestId('enrichment-quality-widget').textContent).toContain('200')
    expect(screen.getByTestId('enrichment-quality-widget').textContent).toContain('pending')
  })

  it('renders nothing when data is null (zero/empty state)', () => {
    mockUseEnrichmentQuality.mockReturnValue({ data: null, isDemo: true })
    render(<DashboardPage />)
    expect(screen.queryByTestId('enrichment-quality-widget')).toBeNull()
  })
})
