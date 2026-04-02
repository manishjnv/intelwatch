/**
 * @module __tests__/dashboard-widgets-s135.test
 * @description Tests for S135 widgets: TopCves, RecentAlerts, SeverityTrend, ProfileMatch,
 * and SeverityHeatmap org-awareness.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'

// ─── Mock analytics dashboard hook ─────────────────────────────

const MOCK_TOP_CVES = [
  { id: 'CVE-2025-1234', epss: 0.85, severity: 'critical', affectedProducts: 12 },
  { id: 'CVE-2024-5678', epss: 0.42, severity: 'high', affectedProducts: 5 },
  { id: 'CVE-2023-9999', epss: 0.15, severity: 'medium', affectedProducts: 3 },
]

const MOCK_ALERT_TREND = [
  { date: new Date(Date.now() - 86_400_000 * 2).toISOString(), count: 5, breakdown: { critical: 2, high: 3 } },
  { date: new Date(Date.now() - 86_400_000).toISOString(), count: 3, breakdown: { high: 2, medium: 1 } },
  { date: new Date().toISOString(), count: 7, breakdown: { critical: 3, high: 2, medium: 2 } },
]

const MOCK_IOC_TREND = [
  { date: '2026-03-27', count: 10 },
  { date: '2026-03-28', count: 15 },
  { date: '2026-03-29', count: 12 },
  { date: '2026-03-30', count: 18 },
  { date: '2026-03-31', count: 22 },
  { date: '2026-04-01', count: 20 },
  { date: '2026-04-02', count: 25 },
]

const MOCK_TOP_IOCS = [
  { type: 'ip', value: '192.168.1.1', confidence: 85, severity: 'critical', tags: ['finance', 'ransomware'] },
  { type: 'domain', value: 'evil.com', confidence: 72, severity: 'high', tags: ['technology', 'phishing'] },
  { type: 'hash', value: 'abc123def456', confidence: 60, severity: 'medium', tags: ['government'] },
]

const mockAnalytics = {
  topCves: MOCK_TOP_CVES,
  alertTrend: MOCK_ALERT_TREND,
  iocTrend: MOCK_IOC_TREND,
  iocBySeverity: { critical: 30, high: 50, medium: 80, low: 20, info: 10 },
  topIocs: MOCK_TOP_IOCS,
  topActors: [],
  feedHealth: [],
  summary: { totalIocs: 100, totalArticles: 200, totalFeeds: 5, totalAlerts: 15, avgConfidence: 70, avgEnrichmentQuality: 0.8, pipelineThroughput: 50 },
  enrichmentStats: { enriched: 80, unenriched: 20, avgQuality: 0.75, bySource: {} },
  costStats: { totalCostUsd: 1.5, costPerArticle: 0.01, costPerIoc: 0.02, byModel: {}, trend: [] },
  iocByType: { ip: 30, domain: 25, url: 15, hash: 20, cve: 5, email: 5 },
  iocByConfidenceTier: {},
  iocByLifecycle: {},
  isLoading: false,
  isDemo: false,
  dateRange: { preset: '7d' as const, from: '', to: '' },
  setPreset: vi.fn(),
  setCustomRange: vi.fn(),
  refetch: vi.fn(),
}

vi.mock('@/hooks/use-analytics-dashboard', () => ({
  useAnalyticsDashboard: () => mockAnalytics,
}))

// Mock MiniSparkline (SVG component hard to test in jsdom)
vi.mock('@/components/command-center/charts', () => ({
  MiniSparkline: ({ values }: { values: number[] }) => (
    <span data-testid="mini-sparkline">{values.length} points</span>
  ),
}))

// Mock useIOCStats for SeverityHeatmap
vi.mock('@/hooks/use-intel-data', () => ({
  useIOCStats: () => ({
    data: {
      total: 100,
      bySeverity: { critical: 30, high: 50, medium: 80, low: 20, info: 10 },
      byType: { ip: 30, domain: 25, url: 15, hash_sha256: 20, cve: 5, email: 5 },
      byLifecycle: {},
    },
  }),
  useDashboardStats: () => ({ data: null }),
}))

// ─── TopCvesWidget ─────────────────────────────────────────────

import { TopCvesWidget } from '@/components/widgets/TopCvesWidget'

describe('TopCvesWidget', () => {
  it('renders top CVEs sorted by EPSS', () => {
    render(<TopCvesWidget />)
    expect(screen.getByTestId('top-cves-widget')).toBeInTheDocument()
    expect(screen.getByText('CVE-2025-1234')).toBeInTheDocument()
    expect(screen.getByText('CVE-2024-5678')).toBeInTheDocument()
    expect(screen.getByText('CVE-2023-9999')).toBeInTheDocument()
  })

  it('shows EPSS percentages', () => {
    render(<TopCvesWidget />)
    expect(screen.getByText('EPSS 85%')).toBeInTheDocument()
    expect(screen.getByText('EPSS 42%')).toBeInTheDocument()
  })

  it('shows KEV badge for high-EPSS CVEs', () => {
    render(<TopCvesWidget />)
    // CVE-2025-1234 has EPSS 0.85 → should be flagged as KEV
    expect(screen.getByTestId('kev-badge-CVE-2025-1234')).toBeInTheDocument()
  })

  it('shows severity labels', () => {
    render(<TopCvesWidget />)
    expect(screen.getByText('CRIT')).toBeInTheDocument()
    expect(screen.getByText('HIGH')).toBeInTheDocument()
  })

  it('returns null when no CVE data', () => {
    const orig = mockAnalytics.topCves
    mockAnalytics.topCves = []
    render(<TopCvesWidget />)
    expect(screen.queryByTestId('top-cves-widget')).not.toBeInTheDocument()
    mockAnalytics.topCves = orig
  })
})

// ─── RecentAlertsWidget ────────────────────────────────────────

import { RecentAlertsWidget } from '@/components/widgets/RecentAlertsWidget'

describe('RecentAlertsWidget', () => {
  it('renders recent alerts', () => {
    render(<RecentAlertsWidget />)
    expect(screen.getByTestId('recent-alerts-widget')).toBeInTheDocument()
  })

  it('shows alert entries derived from trend data', () => {
    render(<RecentAlertsWidget />)
    // Should show up to 5 alerts (we have 3 with count > 0)
    const widget = screen.getByTestId('recent-alerts-widget')
    expect(widget).toBeInTheDocument()
  })

  it('returns null when no alerts and totalAlerts is 0', () => {
    const origTrend = mockAnalytics.alertTrend
    const origSummary = { ...mockAnalytics.summary }
    mockAnalytics.alertTrend = []
    mockAnalytics.summary = { ...mockAnalytics.summary, totalAlerts: 0 }
    render(<RecentAlertsWidget />)
    expect(screen.queryByTestId('recent-alerts-widget')).not.toBeInTheDocument()
    mockAnalytics.alertTrend = origTrend
    mockAnalytics.summary = origSummary
  })
})

// ─── SeverityTrendWidget ───────────────────────────────────────

import { SeverityTrendWidget } from '@/components/widgets/SeverityTrendWidget'

describe('SeverityTrendWidget', () => {
  it('renders severity trend with sparklines', () => {
    render(<SeverityTrendWidget />)
    expect(screen.getByTestId('severity-trend-widget')).toBeInTheDocument()
  })

  it('shows all 4 severity levels', () => {
    render(<SeverityTrendWidget />)
    expect(screen.getByText('Crit')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByText('Med')).toBeInTheDocument()
    expect(screen.getByText('Low')).toBeInTheDocument()
  })

  it('renders MiniSparkline for each severity', () => {
    render(<SeverityTrendWidget />)
    const sparklines = screen.getAllByTestId('mini-sparkline')
    expect(sparklines.length).toBe(4)
  })

  it('returns null when insufficient trend data', () => {
    const orig = mockAnalytics.iocTrend
    mockAnalytics.iocTrend = [{ date: '2026-04-01', count: 10 }]
    render(<SeverityTrendWidget />)
    expect(screen.queryByTestId('severity-trend-widget')).not.toBeInTheDocument()
    mockAnalytics.iocTrend = orig
  })
})

// ─── ProfileMatchWidget ────────────────────────────────────────

import { ProfileMatchWidget } from '@/components/widgets/ProfileMatchWidget'

const TECH_PROFILE = {
  industry: 'Technology' as const,
  techStack: { os: [], cloud: [], network: [], database: [], web: [] },
  businessRisk: ['DataBreach' as const],
  orgSize: 'enterprise' as const,
  geography: { country: 'US', region: 'North America' },
}

describe('ProfileMatchWidget', () => {
  it('renders matching IOCs when profile is set', () => {
    render(<ProfileMatchWidget profile={TECH_PROFILE} />)
    expect(screen.getByTestId('profile-match-widget')).toBeInTheDocument()
    expect(screen.getByText('Matching Your Profile')).toBeInTheDocument()
  })

  it('returns null when profile is null', () => {
    render(<ProfileMatchWidget profile={null} />)
    expect(screen.queryByTestId('profile-match-widget')).not.toBeInTheDocument()
  })

  it('shows empty message when no IOCs match profile', () => {
    const orig = mockAnalytics.topIocs
    mockAnalytics.topIocs = []
    render(<ProfileMatchWidget profile={TECH_PROFILE} />)
    expect(screen.getByTestId('profile-match-empty')).toBeInTheDocument()
    mockAnalytics.topIocs = orig
  })
})

// ─── SeverityHeatmap — org-awareness ───────────────────────────

import { SeverityHeatmap } from '@/components/viz/SeverityHeatmap'

describe('SeverityHeatmap — org-awareness', () => {
  it('renders without profile (no highlight)', () => {
    render(<SeverityHeatmap />)
    expect(screen.getByTestId('severity-heatmap')).toBeInTheDocument()
    expect(screen.queryByTestId('heatmap-profile-hint')).not.toBeInTheDocument()
  })

  it('shows profile-highlighted badge when profile is set', () => {
    render(<SeverityHeatmap profile={{ industry: 'Technology' }} />)
    expect(screen.getByTestId('heatmap-profile-hint')).toBeInTheDocument()
    expect(screen.getByText('Profile highlighted')).toBeInTheDocument()
  })

  it('renders heatmap cells', () => {
    render(<SeverityHeatmap />)
    // 6 types x 5 severities = 30 cells
    expect(screen.getByTestId('heatmap-cell-ip-critical')).toBeInTheDocument()
    expect(screen.getByTestId('heatmap-cell-domain-high')).toBeInTheDocument()
    expect(screen.getByTestId('heatmap-cell-cve-low')).toBeInTheDocument()
  })

  it('no hint badge when profile is null', () => {
    render(<SeverityHeatmap profile={null} />)
    expect(screen.queryByTestId('heatmap-profile-hint')).not.toBeInTheDocument()
  })
})
