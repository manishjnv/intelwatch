/**
 * @module __tests__/dashboard-org-aware.test
 * @description Tests for org-aware dashboard sections — threat landscape, CTA.
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
  useDashboardStats: () => ({ data: { totalIOCs: 25, activeFeeds: 5, enrichedToday: 10, criticalIOCs: 3 }, isDemo: true }),
  useIOCs: () => ({
    data: {
      data: [
        { id: '1', normalizedValue: '1.2.3.4', iocType: 'ip', tags: ['technology', 'ransomware'], severity: 'critical', confidence: 90, threatActors: [], malwareFamilies: [], lifecycle: 'active', tlp: 'red', firstSeen: '', lastSeen: '' },
        { id: '2', normalizedValue: 'evil.com', iocType: 'domain', tags: ['phishing'], severity: 'high', confidence: 80, threatActors: [], malwareFamilies: [], lifecycle: 'active', tlp: 'amber', firstSeen: '', lastSeen: '' },
        { id: '3', normalizedValue: '5.6.7.8', iocType: 'ip', tags: ['scanner'], severity: 'low', confidence: 40, threatActors: [], malwareFamilies: [], lifecycle: 'aging', tlp: 'green', firstSeen: '', lastSeen: '' },
      ],
      total: 3, page: 1, limit: 50,
    },
    isDemo: true,
  }),
}))

vi.mock('@/hooks/use-enrichment-data', () => ({
  useCostStats: () => ({ data: { headline: '18 IOCs for $0.08' } }),
  useEnrichmentStats: () => ({ data: { avgQualityScore: 74, pending: 5 } }),
  useEnrichmentQuality: () => ({
    data: { total: 25, highConfidence: 10, mediumConfidence: 10, lowConfidence: 5, pendingEnrichment: 5, highPct: 40, mediumPct: 40, lowPct: 20 },
  }),
  useEnrichmentSourceBreakdown: () => ({ data: null, isDemo: true }),
  useEnrichmentCostBreakdown: () => ({ data: null, isDemo: true }),
}))

// Mock heavy child components to isolate test scope
vi.mock('@/components/widgets/EnrichmentSourceWidget', () => ({
  EnrichmentSourceWidget: () => <div data-testid="enrichment-source-widget-mock" />,
}))
vi.mock('@/components/widgets/AiCostWidget', () => ({
  AiCostWidget: () => <div data-testid="ai-cost-widget-mock" />,
}))
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

vi.mock('@/hooks/use-global-catalog', () => ({
  useGlobalPipelineHealth: () => ({
    data: { pipeline: { articlesProcessed24h: 100, iocsCreated24h: 50, iocsEnriched24h: 30, avgNormalizeLatencyMs: 120 } },
    isDemo: false,
  }),
}))

// Mock animation hook
vi.mock('@/hooks/use-count-up', () => ({
  useCountUp: (n: number) => n,
}))

describe('DashboardPage — org-aware sections', () => {
  it('renders threat landscape section when org profile exists', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('threat-landscape')).toBeInTheDocument()
    expect(screen.getByText('Your Threat Landscape')).toBeInTheDocument()
  })

  it('shows industry in banner', () => {
    render(<DashboardPage />)
    expect(screen.getByText('Technology')).toBeInTheDocument()
  })

  it('shows priority threats with relevance boost', () => {
    render(<DashboardPage />)
    // The first IOC matches technology + ransomware
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument()
  })

  it('shows recommended actions section', () => {
    render(<DashboardPage />)
    expect(screen.getByText('Recommended Actions')).toBeInTheDocument()
  })

  it('shows recommended actions based on risk profile', () => {
    render(<DashboardPage />)
    // DataBreach risk → data access audit logs
    expect(screen.getByText(/data access audit logs/i)).toBeInTheDocument()
  })
})
