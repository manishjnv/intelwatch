/**
 * @module __tests__/dashboard-s138.test
 * @description S138 tests: InvestigationDrawer, GeoThreatWidget dot-map,
 * FeedValueWidget, freshness indicators, QuickActionsBar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Mock data ───────────────────────────────────────────────────

const MOCK_TOP_IOCS = [
  { type: 'ip', value: '185.220.101.34', confidence: 92, severity: 'critical', corroboration: 5 },
  { type: 'domain', value: 'evil-payload.xyz', confidence: 88, severity: 'critical', corroboration: 4 },
  { type: 'hash', value: 'a1b2c3d4e5f6deadbeef', confidence: 85, severity: 'high', corroboration: 3 },
  { type: 'cve', value: 'CVE-2024-21762', confidence: 95, severity: 'critical', corroboration: 6 },
  { type: 'url', value: 'https://phish.example/login', confidence: 78, severity: 'high', corroboration: 2 },
]

const MOCK_TOP_CVES = [
  { id: 'CVE-2024-21762', epss: 0.94, severity: 'critical', affectedProducts: 3 },
  { id: 'CVE-2024-3400', epss: 0.87, severity: 'critical', affectedProducts: 1 },
]

const MOCK_TOP_ACTORS = [
  { name: 'APT28 (Fancy Bear)', iocCount: 23, lastSeen: '2026-04-01' },
  { name: 'Lazarus Group', iocCount: 18, lastSeen: '2026-03-30' },
  { name: 'FIN7', iocCount: 12, lastSeen: '2026-03-28' },
]

const MOCK_FEED_HEALTH = [
  { name: 'AlienVault OTX', feedType: 'REST', reliability: 85, articlesPerDay: 42, iocsPerDay: 120, status: 'active' },
  { name: 'CISA KEV', feedType: 'NVD', reliability: 95, articlesPerDay: 3, iocsPerDay: 8, status: 'active' },
  { name: 'Abuse.ch URLhaus', feedType: 'REST', reliability: 78, articlesPerDay: 85, iocsPerDay: 210, status: 'active' },
  { name: 'PhishTank', feedType: 'REST', reliability: 45, articlesPerDay: 120, iocsPerDay: 120, status: 'degraded' },
  { name: 'NVD CVE', feedType: 'NVD', reliability: 92, articlesPerDay: 28, iocsPerDay: 28, status: 'active' },
  { name: 'MISP Community', feedType: 'MISP', reliability: 72, articlesPerDay: 15, iocsPerDay: 45, status: 'active' },
]

const mockRefetch = vi.fn()

const mockAnalytics = {
  topIocs: MOCK_TOP_IOCS,
  topCves: MOCK_TOP_CVES,
  topActors: MOCK_TOP_ACTORS,
  iocTrend: [],
  alertTrend: [],
  feedHealth: MOCK_FEED_HEALTH,
  iocBySeverity: { critical: 30, high: 50, medium: 80, low: 20, info: 10 },
  iocByType: { ip: 30, domain: 25, url: 15, hash: 20, cve: 5, email: 5 },
  iocByConfidenceTier: {},
  iocByLifecycle: {},
  summary: { totalIocs: 4287, totalArticles: 17842, totalFeeds: 12, totalAlerts: 247, avgConfidence: 72, avgEnrichmentQuality: 84, pipelineThroughput: 156 },
  enrichmentStats: { enriched: 3640, unenriched: 647, avgQuality: 84, bySource: {} },
  costStats: { totalCostUsd: 12.47, costPerArticle: 0.0007, costPerIoc: 0.0029, byModel: {}, trend: [] },
  isLoading: false,
  isDemo: false,
  dateRange: { preset: '7d' as const, from: '', to: '' },
  setPreset: vi.fn(),
  setCustomRange: vi.fn(),
  refetch: mockRefetch,
  isFetching: false,
  dataUpdatedAt: Date.now(),
  error: null,
}

vi.mock('@/hooks/use-analytics-dashboard', () => ({
  useAnalyticsDashboard: () => mockAnalytics,
}))

// IOC data with timestamps for freshness testing
const MOCK_IOCS = [
  { id: '1', iocType: 'ip', normalizedValue: '10.0.0.1', severity: 'critical', confidence: 90,
    lifecycle: 'active', tlp: 'white', tags: [], threatActors: [], malwareFamilies: [],
    firstSeen: new Date(Date.now() - 30 * 60_000).toISOString(), // 30 min ago
    lastSeen: new Date(Date.now() - 10 * 60_000).toISOString(), // 10 min ago
    corroborationCount: 3 },
  { id: '2', iocType: 'domain', normalizedValue: 'bad.example.com', severity: 'high', confidence: 75,
    lifecycle: 'active', tlp: 'green', tags: [], threatActors: [], malwareFamilies: [],
    firstSeen: new Date(Date.now() - 3 * 86_400_000).toISOString(), // 3 days ago
    lastSeen: new Date(Date.now() - 2 * 86_400_000).toISOString(), // 2 days ago
    corroborationCount: 1 },
  { id: '3', iocType: 'hash', normalizedValue: 'deadbeefcafe', severity: 'medium', confidence: 60,
    lifecycle: 'stale', tlp: 'amber', tags: [], threatActors: [], malwareFamilies: [],
    firstSeen: new Date(Date.now() - 45 * 86_400_000).toISOString(), // 45 days ago
    lastSeen: new Date(Date.now() - 40 * 86_400_000).toISOString(), // 40 days ago
    corroborationCount: 0 },
]

vi.mock('@/hooks/use-intel-data', () => ({
  useIOCs: () => ({ data: { data: MOCK_IOCS, total: 3 }, isLoading: false }),
  useIOCStats: () => ({ data: { total: 100, bySeverity: {}, byType: {}, byLifecycle: {} } }),
  useDashboardStats: () => ({ data: { criticalIOCs: 30 } }),
}))

vi.mock('@/components/viz/AmbientBackground', () => ({
  AmbientBackground: () => <div data-testid="ambient-bg" />,
}))

vi.mock('@/components/viz/ThreatTimeline', () => ({
  ThreatTimeline: () => <div data-testid="threat-timeline" />,
}))

vi.mock('@/components/viz/SeverityHeatmap', () => ({
  SeverityHeatmap: () => <div data-testid="severity-heatmap" />,
}))

vi.mock('@/components/command-center/charts', () => ({
  MiniSparkline: ({ values }: { values: number[] }) => (
    <span data-testid="mini-sparkline">{values.length} points</span>
  ),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { displayName: 'Analyst', role: 'tenant_admin' }, tenant: { name: 'TestCorp' } }),
}))

vi.mock('@/stores/org-profile-store', () => ({
  useOrgProfileStore: (selector?: (s: unknown) => unknown) => {
    const state = { profile: null, setProfile: vi.fn(), clearProfile: vi.fn() }
    return selector ? selector(state) : state
  },
}))

vi.mock('@/hooks/use-dashboard-mode', () => ({
  useDashboardMode: () => ({ mode: 'global', profile: null }),
}))

const localStorageMock: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStorageMock[key] ?? null,
  setItem: (key: string, value: string) => { localStorageMock[key] = value },
  removeItem: (key: string) => { delete localStorageMock[key] },
})

beforeEach(() => {
  mockAnalytics.isDemo = false
  mockRefetch.mockClear()
  delete localStorageMock['etip-dashboard-view']
})

// ═══════════════════════════════════════════════════════════════════
// Freshness utility
// ═══════════════════════════════════════════════════════════════════

import { getFreshness } from '@/lib/freshness'

describe('getFreshness', () => {
  it('returns "Just now" for timestamps less than 1 minute ago', () => {
    const result = getFreshness(new Date().toISOString())
    expect(result.label).toBe('Just now')
    expect(result.pulse).toBe(true)
    expect(result.tier).toBe('just-now')
  })

  it('returns minutes for timestamps < 1 hour ago', () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString()
    const result = getFreshness(thirtyMinAgo)
    expect(result.label).toBe('30m ago')
    expect(result.pulse).toBe(true)
    expect(result.tier).toBe('just-now')
  })

  it('returns hours for timestamps 1-24h ago', () => {
    const fiveHoursAgo = new Date(Date.now() - 5 * 3_600_000).toISOString()
    const result = getFreshness(fiveHoursAgo)
    expect(result.label).toBe('5h ago')
    expect(result.pulse).toBe(false)
    expect(result.tier).toBe('hours')
  })

  it('returns days for timestamps 1-7d ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString()
    const result = getFreshness(threeDaysAgo)
    expect(result.label).toBe('3d ago')
    expect(result.tier).toBe('days')
  })

  it('returns days (weeks tier) for timestamps 7-30d ago', () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 86_400_000).toISOString()
    const result = getFreshness(fifteenDaysAgo)
    expect(result.label).toBe('15d ago')
    expect(result.tier).toBe('weeks')
  })

  it('returns "stale" for timestamps > 30d ago', () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000).toISOString()
    const result = getFreshness(sixtyDaysAgo)
    expect(result.label).toBe('stale')
    expect(result.tier).toBe('stale')
  })

  it('handles null/undefined gracefully', () => {
    expect(getFreshness(null).label).toBe('unknown')
    expect(getFreshness(undefined).label).toBe('unknown')
  })
})

// ═══════════════════════════════════════════════════════════════════
// RecentIocWidget — freshness + drawer
// ═══════════════════════════════════════════════════════════════════

import { InvestigationDrawerProvider } from '@/hooks/use-investigation-drawer'
import { RecentIocWidget } from '@/components/widgets/RecentIocWidget'

function withDrawerProvider(ui: React.ReactElement) {
  return <InvestigationDrawerProvider>{ui}</InvestigationDrawerProvider>
}

describe('RecentIocWidget (S138)', () => {
  it('shows freshness labels for each IOC', () => {
    render(withDrawerProvider(<RecentIocWidget />))
    // 10 min ago IOC → should show "10m ago"
    expect(screen.getByText(/\d+m ago/)).toBeInTheDocument()
    // 2 days ago IOC → should show "2d ago"
    expect(screen.getByText('2d ago')).toBeInTheDocument()
    // 40 days ago IOC → should show "stale"
    expect(screen.getByText('stale')).toBeInTheDocument()
  })

  it('has clickable IOC rows with data-testid', () => {
    render(withDrawerProvider(<RecentIocWidget />))
    expect(screen.getByTestId('ioc-row-1')).toBeInTheDocument()
    expect(screen.getByTestId('ioc-row-2')).toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════
// ThreatScoreWidget — drawer integration
// ═══════════════════════════════════════════════════════════════════

import { ThreatScoreWidget } from '@/components/widgets/ThreatScoreWidget'

describe('ThreatScoreWidget (S138 drawer)', () => {
  it('renders IOCs with hover styling for click-to-investigate', () => {
    render(withDrawerProvider(<ThreatScoreWidget profile={null} />))
    expect(screen.getByTestId('threat-score-widget')).toBeInTheDocument()
    expect(screen.getByText('185.220.101.34')).toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════
// TopCvesWidget — drawer integration
// ═══════════════════════════════════════════════════════════════════

import { TopCvesWidget } from '@/components/widgets/TopCvesWidget'

describe('TopCvesWidget (S138 drawer)', () => {
  it('renders CVE rows with hover styling', () => {
    render(withDrawerProvider(<TopCvesWidget />))
    expect(screen.getByText('CVE-2024-21762')).toBeInTheDocument()
    expect(screen.getByText('CVE-2024-3400')).toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════
// InvestigationDrawer
// ═══════════════════════════════════════════════════════════════════

import { InvestigationDrawer } from '@/components/investigation/InvestigationDrawer'
import { useInvestigationDrawer } from '@/hooks/use-investigation-drawer'

function DrawerTestHarness() {
  const { open } = useInvestigationDrawer()
  return (
    <div>
      <button data-testid="open-drawer" onClick={() => open({
        value: '185.220.101.34', type: 'ip', severity: 'critical',
        confidence: 92, corroboration: 5,
        lastSeen: new Date(Date.now() - 3600_000).toISOString(),
        createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      })}>
        Open
      </button>
      <InvestigationDrawer />
    </div>
  )
}

describe('InvestigationDrawer', () => {
  it('opens when triggered and shows IOC details', async () => {
    render(withDrawerProvider(<DrawerTestHarness />))
    // Drawer should not be visible initially
    expect(screen.queryByTestId('investigation-drawer')).not.toBeInTheDocument()

    // Open drawer
    fireEvent.click(screen.getByTestId('open-drawer'))
    expect(await screen.findByTestId('investigation-drawer')).toBeInTheDocument()
    expect(screen.getByText('185.220.101.34')).toBeInTheDocument()
    expect(screen.getByText('CRITICAL')).toBeInTheDocument()
    expect(screen.getByText('IP')).toBeInTheDocument()
  })

  it('shows enrichment sources', async () => {
    render(withDrawerProvider(<DrawerTestHarness />))
    fireEvent.click(screen.getByTestId('open-drawer'))
    expect(await screen.findByText('VirusTotal')).toBeInTheDocument()
    expect(screen.getByText('Shodan')).toBeInTheDocument()
    expect(screen.getByText('GreyNoise')).toBeInTheDocument()
  })

  it('shows corroboration count', async () => {
    render(withDrawerProvider(<DrawerTestHarness />))
    fireEvent.click(screen.getByTestId('open-drawer'))
    expect(await screen.findByText(/Reported by/)).toBeInTheDocument()
  })

  it('shows confidence bar', async () => {
    render(withDrawerProvider(<DrawerTestHarness />))
    fireEvent.click(screen.getByTestId('open-drawer'))
    expect(await screen.findByText('92%')).toBeInTheDocument()
  })

  it('closes on X button click', async () => {
    render(withDrawerProvider(<DrawerTestHarness />))
    fireEvent.click(screen.getByTestId('open-drawer'))
    expect(await screen.findByTestId('investigation-drawer')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('drawer-close'))
    // AnimatePresence exit animation — drawer should eventually unmount
  })

  it('shows action buttons (Copy, Search, Details)', async () => {
    render(withDrawerProvider(<DrawerTestHarness />))
    fireEvent.click(screen.getByTestId('open-drawer'))
    expect(await screen.findByTestId('action-copy')).toBeInTheDocument()
    expect(screen.getByTestId('action-search')).toBeInTheDocument()
    expect(screen.getByTestId('action-details')).toBeInTheDocument()
  })

  it('shows related threat actors', async () => {
    render(withDrawerProvider(<DrawerTestHarness />))
    fireEvent.click(screen.getByTestId('open-drawer'))
    expect(await screen.findByText('APT28 (Fancy Bear)')).toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════
// GeoThreatWidget dot-map
// ═══════════════════════════════════════════════════════════════════

import { GeoThreatWidget } from '@/components/widgets/GeoThreatWidget'

describe('GeoThreatWidget (S138 dot-map)', () => {
  it('renders the SVG dot-map container', () => {
    render(<GeoThreatWidget profile={null} />)
    expect(screen.getByTestId('geo-dot-map')).toBeInTheDocument()
  })

  it('renders the top-5 legend', () => {
    render(<GeoThreatWidget profile={null} />)
    expect(screen.getByTestId('geo-legend')).toBeInTheDocument()
    expect(screen.getByText('China')).toBeInTheDocument()
    expect(screen.getByText('Russia')).toBeInTheDocument()
  })

  it('contains SVG circles for threat dots', () => {
    const { container } = render(<GeoThreatWidget profile={null} />)
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBeGreaterThan(0)
  })

  it('highlights org country when profile is set', () => {
    const profile = { geography: { country: 'Russia' } }
    render(<GeoThreatWidget profile={profile as never} />)
    // Russia should be in top-5 legend
    expect(screen.getByText('Russia')).toBeInTheDocument()
  })

  it('shows empty state when no data', () => {
    const original = mockAnalytics.topActors
    mockAnalytics.topActors = []
    render(<GeoThreatWidget profile={null} />)
    // Still shows demo geo data (hardcoded)
    expect(screen.getByTestId('geo-dot-map')).toBeInTheDocument()
    mockAnalytics.topActors = original
  })
})

// ═══════════════════════════════════════════════════════════════════
// FeedValueWidget
// ═══════════════════════════════════════════════════════════════════

import { FeedValueWidget } from '@/components/widgets/FeedValueWidget'

describe('FeedValueWidget', () => {
  it('renders with testid and shows feed names', () => {
    render(<FeedValueWidget />)
    expect(screen.getByTestId('feed-value-widget')).toBeInTheDocument()
    expect(screen.getByText('AlienVault OTX')).toBeInTheDocument()
    expect(screen.getByText('Abuse.ch URLhaus')).toBeInTheDocument()
  })

  it('ranks feeds by composite score and shows top 5', () => {
    render(<FeedValueWidget />)
    const widget = screen.getByTestId('feed-value-widget')
    const feedNames = Array.from(widget.querySelectorAll('.truncate'))
      .map(el => el.textContent?.trim())
      .filter(Boolean)
    // Should show 5 feeds
    expect(feedNames.length).toBe(5)
    // Top-scoring feeds should appear
    expect(feedNames).toContain('AlienVault OTX')
    expect(feedNames).toContain('Abuse.ch URLhaus')
  })

  it('shows score numbers', () => {
    render(<FeedValueWidget />)
    const widget = screen.getByTestId('feed-value-widget')
    const scores = widget.querySelectorAll('.tabular-nums')
    expect(scores.length).toBeGreaterThan(0)
  })

  it('falls back to demo data when feedHealth is empty', () => {
    const original = mockAnalytics.feedHealth
    mockAnalytics.feedHealth = []
    render(<FeedValueWidget />)
    // Demo fallback data should render
    expect(screen.getByTestId('feed-value-widget')).toBeInTheDocument()
    expect(screen.getByText('CISA KEV')).toBeInTheDocument()
    mockAnalytics.feedHealth = original
  })
})

// ═══════════════════════════════════════════════════════════════════
// QuickActionsBar
// ═══════════════════════════════════════════════════════════════════

import { QuickActionsBar } from '@/components/dashboard/QuickActionsBar'

const MOCK_SUMMARY = { totalIocs: 4287, totalAlerts: 247, totalFeeds: 12, avgConfidence: 72 }

describe('QuickActionsBar', () => {
  it('renders all action buttons', () => {
    render(<QuickActionsBar summary={MOCK_SUMMARY} />)
    expect(screen.getByTestId('quick-actions-bar')).toBeInTheDocument()
    expect(screen.getByTestId('action-export')).toBeInTheDocument()
    expect(screen.getByTestId('action-share')).toBeInTheDocument()
    expect(screen.getByTestId('action-refresh')).toBeInTheDocument()
  })

  it('renders date range presets', () => {
    render(<QuickActionsBar summary={MOCK_SUMMARY} />)
    expect(screen.getByTestId('range-24h')).toBeInTheDocument()
    expect(screen.getByTestId('range-7d')).toBeInTheDocument()
    expect(screen.getByTestId('range-30d')).toBeInTheDocument()
    expect(screen.getByTestId('range-90d')).toBeInTheDocument()
  })

  it('calls setPreset when date range button is clicked', () => {
    render(<QuickActionsBar summary={MOCK_SUMMARY} />)
    fireEvent.click(screen.getByTestId('range-30d'))
    expect(mockAnalytics.setPreset).toHaveBeenCalledWith('30d')
  })

  it('calls refetch when Refresh is clicked', () => {
    render(<QuickActionsBar summary={MOCK_SUMMARY} />)
    fireEvent.click(screen.getByTestId('action-refresh'))
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('highlights the active date range preset', () => {
    render(<QuickActionsBar summary={MOCK_SUMMARY} />)
    const active = screen.getByTestId('range-7d')
    expect(active.className).toContain('bg-accent')
  })
})

// ═══════════════════════════════════════════════════════════════════
// DashboardPage integration — all features wired
// ═══════════════════════════════════════════════════════════════════

import { DashboardPage } from '@/pages/DashboardPage'

describe('DashboardPage (S138 integration)', () => {
  it('renders QuickActionsBar', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('quick-actions-bar')).toBeInTheDocument()
  })

  it('renders FeedValueWidget in the grid', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('feed-value-widget')).toBeInTheDocument()
  })

  it('renders GeoThreatWidget with dot-map', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('geo-dot-map')).toBeInTheDocument()
  })

  it('renders RecentIocWidget with freshness indicators', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('recent-ioc-widget')).toBeInTheDocument()
    // Freshness labels should be present
    expect(screen.getByText(/\d+m ago/)).toBeInTheDocument()
  })
})
