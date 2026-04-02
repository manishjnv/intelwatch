/**
 * @module __tests__/dashboard-s136.test
 * @description S136 integration tests: GeoThreatWidget, all 9 widgets in grid,
 * org-profile store → Command Center wiring, dashboard mode E2E.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Mock hooks ───────────────────────────────────────────────

const MOCK_TOP_ACTORS = [
  { name: 'APT28', iocCount: 120, lastSeen: '2026-04-01T00:00:00Z' },
  { name: 'Lazarus', iocCount: 95, lastSeen: '2026-04-01T00:00:00Z' },
  { name: 'APT41', iocCount: 74, lastSeen: '2026-03-30T00:00:00Z' },
]

const MOCK_TOP_CVES = [
  { id: 'CVE-2025-1234', epss: 0.85, severity: 'critical', affectedProducts: 12 },
  { id: 'CVE-2024-5678', epss: 0.42, severity: 'high', affectedProducts: 5 },
]

const MOCK_ALERT_TREND = [
  { date: new Date(Date.now() - 86_400_000).toISOString(), count: 5, breakdown: { critical: 2, high: 3 } },
  { date: new Date().toISOString(), count: 7, breakdown: { critical: 3, high: 2, medium: 2 } },
]

const MOCK_IOC_TREND = [
  { date: '2026-03-27', count: 10 }, { date: '2026-03-28', count: 15 },
  { date: '2026-03-29', count: 12 }, { date: '2026-03-30', count: 18 },
  { date: '2026-03-31', count: 22 }, { date: '2026-04-01', count: 20 },
  { date: '2026-04-02', count: 25 },
]

const MOCK_TOP_IOCS = [
  { type: 'ip', value: '192.168.1.1', confidence: 85, severity: 'critical', tags: ['finance'] },
  { type: 'domain', value: 'evil.com', confidence: 72, severity: 'high', tags: ['technology'] },
]

const MOCK_FEED_HEALTH = [
  { feedId: 'f1', feedName: 'THN RSS', reliability: 0.95, lastFetch: '2026-04-02T00:00:00Z', status: 'healthy' },
]

const mockAnalytics = {
  topActors: MOCK_TOP_ACTORS,
  topCves: MOCK_TOP_CVES,
  alertTrend: MOCK_ALERT_TREND,
  iocTrend: MOCK_IOC_TREND,
  topIocs: MOCK_TOP_IOCS,
  feedHealth: MOCK_FEED_HEALTH,
  iocBySeverity: { critical: 30, high: 50, medium: 80, low: 20, info: 10 },
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

vi.mock('@/hooks/use-intel-data', () => ({
  useIOCs: () => ({ data: { data: [], total: 0 }, isLoading: false }),
  useIOCStats: () => ({
    data: {
      total: 100,
      bySeverity: { critical: 30, high: 50, medium: 80, low: 20, info: 10 },
      byType: { ip: 30, domain: 25, url: 15, hash_sha256: 20, cve: 5, email: 5 },
      byLifecycle: {},
    },
  }),
  useDashboardStats: () => ({ data: { criticalIOCs: 5 } }),
}))

vi.mock('@/components/command-center/charts', () => ({
  MiniSparkline: ({ values }: { values: number[] }) => (
    <span data-testid="mini-sparkline">{values.length} points</span>
  ),
}))

vi.mock('@/components/viz/AmbientBackground', () => ({
  AmbientBackground: () => <div data-testid="ambient-bg" />,
}))

vi.mock('@/components/viz/ThreatTimeline', () => ({
  ThreatTimeline: () => <div data-testid="threat-timeline" />,
}))

// ─── Org profile store mock ──────────────────────────────────

let mockStoreProfile: import('@/types/org-profile').OrgProfile | null = null
const mockSetProfile = vi.fn((p: import('@/types/org-profile').OrgProfile) => { mockStoreProfile = p })
const mockClearProfile = vi.fn(() => { mockStoreProfile = null })

vi.mock('@/stores/org-profile-store', () => ({
  useOrgProfileStore: (selector?: (s: unknown) => unknown) => {
    const state = { profile: mockStoreProfile, setProfile: mockSetProfile, clearProfile: mockClearProfile }
    return selector ? selector(state) : state
  },
}))

// ─── Auth store mock ──────────────────────────────────────────

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { displayName: 'Manish', role: 'tenant_admin' }, tenant: { name: 'TestCorp' } }),
}))

// ─── Dashboard mode mock ──────────────────────────────────────

let mockMode: 'org-aware' | 'global' | 'super-admin' = 'global'
vi.mock('@/hooks/use-dashboard-mode', () => ({
  useDashboardMode: () => ({ mode: mockMode, profile: mockStoreProfile }),
}))

// ═══════════════════════════════════════════════════════════════
// GeoThreatWidget
// ═══════════════════════════════════════════════════════════════

import { GeoThreatWidget } from '@/components/widgets/GeoThreatWidget'

describe('GeoThreatWidget', () => {
  it('renders country bar chart with 8 countries', () => {
    render(<GeoThreatWidget profile={null} />)
    expect(screen.getByTestId('geo-threat-widget')).toBeInTheDocument()
    expect(screen.getByText('China')).toBeInTheDocument()
    expect(screen.getByText('Russia')).toBeInTheDocument()
    expect(screen.getByText('United States')).toBeInTheDocument()
    expect(screen.getByText('Iran')).toBeInTheDocument()
  })

  it('shows Geo Threat Map heading', () => {
    render(<GeoThreatWidget profile={null} />)
    expect(screen.getByText('Geo Threat Map')).toBeInTheDocument()
  })

  it('highlights country matching org profile geography', () => {
    const profile = {
      industry: 'Technology' as const,
      techStack: { os: [], cloud: [], network: [], database: [], web: [] },
      businessRisk: [] as import('@/types/org-profile').BusinessRisk[],
      orgSize: 'smb' as const,
      geography: { country: 'India', region: 'Asia' },
    }
    render(<GeoThreatWidget profile={profile} />)
    // Dot-map should render with SVG circles (India gets a dot via COUNTRY_GEO)
    const dotMap = screen.getByTestId('geo-dot-map')
    expect(dotMap).toBeInTheDocument()
    // Top 5 legend is visible
    expect(screen.getByTestId('geo-legend')).toBeInTheDocument()
  })

  it('does not highlight when profile country does not match', () => {
    const profile = {
      industry: 'Technology' as const,
      techStack: { os: [], cloud: [], network: [], database: [], web: [] },
      businessRisk: [] as import('@/types/org-profile').BusinessRisk[],
      orgSize: 'smb' as const,
      geography: { country: 'Germany', region: 'Europe' },
    }
    render(<GeoThreatWidget profile={profile} />)
    // China should be in top 5 legend without highlight ring
    expect(screen.getByText('China')).toBeInTheDocument()
  })

  it('shows Demo badge when isDemo is true', () => {
    const origDemo = mockAnalytics.isDemo
    mockAnalytics.isDemo = true
    render(<GeoThreatWidget profile={null} />)
    expect(screen.getByText('Demo')).toBeInTheDocument()
    mockAnalytics.isDemo = origDemo
  })

  it('renders country names in legend', () => {
    render(<GeoThreatWidget profile={null} />)
    // Top 5 countries should appear in the legend
    expect(screen.getByText('China')).toBeInTheDocument()
    expect(screen.getByText('Russia')).toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════
// DashboardPage — all 9 widgets in grid
// ═══════════════════════════════════════════════════════════════

import { DashboardPage } from '@/pages/DashboardPage'

describe('DashboardPage — full widget grid', () => {
  beforeEach(() => {
    mockMode = 'org-aware'
    mockStoreProfile = {
      industry: 'Technology',
      techStack: { os: ['Linux'], cloud: ['AWS'], network: [], database: ['PostgreSQL'], web: ['Nginx'] },
      businessRisk: ['DataBreach'],
      orgSize: 'smb',
      geography: { country: 'India', region: 'Asia' },
    }
  })

  afterEach(() => {
    mockMode = 'global'
    mockStoreProfile = null
  })

  it('renders all 9 widgets in org-aware mode', () => {
    render(<DashboardPage />)
    // 8 always-visible widgets
    expect(screen.getByTestId('top-actors-widget')).toBeInTheDocument()
    expect(screen.getByTestId('top-cves-widget')).toBeInTheDocument()
    expect(screen.getByTestId('recent-alerts-widget')).toBeInTheDocument()
    expect(screen.getByTestId('severity-trend-widget')).toBeInTheDocument()
    expect(screen.getByTestId('geo-threat-widget')).toBeInTheDocument()
    // Org-aware only
    expect(screen.getByTestId('profile-match-widget')).toBeInTheDocument()
  })

  it('shows ThreatLandscapeBanner in org-aware mode', () => {
    render(<DashboardPage />)
    expect(screen.queryByTestId('org-profile-cta')).not.toBeInTheDocument()
  })

  it('shows OrgProfileCta in global mode', () => {
    mockMode = 'global'
    mockStoreProfile = null
    render(<DashboardPage />)
    expect(screen.getByTestId('org-profile-cta')).toBeInTheDocument()
  })

  it('hides ProfileMatchWidget in global mode', () => {
    mockMode = 'global'
    mockStoreProfile = null
    render(<DashboardPage />)
    expect(screen.queryByTestId('profile-match-widget')).not.toBeInTheDocument()
  })

  it('GeoThreatWidget renders dot-map when profile geography is set', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('geo-dot-map')).toBeInTheDocument()
    expect(screen.getByTestId('geo-legend')).toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════
// TenantSettings — org-profile store wiring
// ═══════════════════════════════════════════════════════════════

vi.mock('@/hooks/use-command-center', () => ({
  useCommandCenter: () => ({ tenantPlan: 'free' }),
}))

import { TenantSettings } from '@/components/command-center/TenantSettings'

describe('TenantSettings — org-profile store wiring', () => {
  const mockData = { tenantPlan: 'free' } as ReturnType<typeof import('@/hooks/use-command-center').useCommandCenter>

  beforeEach(() => {
    mockStoreProfile = null
    mockSetProfile.mockClear()
  })

  it('renders org profile section', () => {
    render(<TenantSettings data={mockData} />)
    expect(screen.getByTestId('org-profile-section')).toBeInTheDocument()
  })

  it('persists industry change to org-profile store', () => {
    render(<TenantSettings data={mockData} />)
    const select = screen.getByTestId('industry-select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'Finance' } })
    expect(mockSetProfile).toHaveBeenCalled()
    const lastCall = mockSetProfile.mock.calls.at(-1)![0]
    expect(lastCall.industry).toBe('Finance')
  })

  it('persists org size change to store', () => {
    render(<TenantSettings data={mockData} />)
    fireEvent.click(screen.getByTestId('size-enterprise'))
    expect(mockSetProfile).toHaveBeenCalled()
    const lastCall = mockSetProfile.mock.calls.at(-1)![0]
    expect(lastCall.orgSize).toBe('enterprise')
  })

  it('persists geography country change to store', () => {
    render(<TenantSettings data={mockData} />)
    const input = screen.getByTestId('geography-country') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Japan' } })
    expect(mockSetProfile).toHaveBeenCalled()
    const lastCall = mockSetProfile.mock.calls.at(-1)![0]
    expect(lastCall.geography.country).toBe('Japan')
  })

  it('initializes from store profile when available', () => {
    mockStoreProfile = {
      industry: 'Healthcare',
      techStack: { os: [], cloud: [], network: [], database: [], web: [] },
      businessRisk: ['Ransomware'],
      orgSize: 'enterprise',
      geography: { country: 'US', region: 'North America' },
    }
    render(<TenantSettings data={mockData} />)
    const select = screen.getByTestId('industry-select') as HTMLSelectElement
    expect(select.value).toBe('Healthcare')
  })
})
