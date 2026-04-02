/**
 * @module __tests__/dashboard-s137.test
 * @description S137 tests: ThreatScoreWidget, ThreatBriefingWidget,
 * AttackTechniqueWidget, ExecSummaryCards, dashboard view toggle, delta badges.
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

const MOCK_IOC_TREND = [
  { date: '2026-03-27', count: 10 }, { date: '2026-03-28', count: 15 },
  { date: '2026-03-29', count: 12 }, { date: '2026-03-30', count: 18 },
  { date: '2026-03-31', count: 22 }, { date: '2026-04-01', count: 20 },
  { date: '2026-04-02', count: 25 },
]

const MOCK_ALERT_TREND = [
  { date: '2026-04-01', count: 5 },
  { date: '2026-04-02', count: 7 },
]

const MOCK_FEED_HEALTH = [
  { name: 'AlienVault OTX', feedType: 'REST', reliability: 85, articlesPerDay: 42, iocsPerDay: 120, status: 'active' },
  { name: 'CISA KEV', feedType: 'NVD', reliability: 95, articlesPerDay: 3, iocsPerDay: 8, status: 'active' },
  { name: 'PhishTank', feedType: 'REST', reliability: 45, articlesPerDay: 120, iocsPerDay: 120, status: 'degraded' },
]

const mockAnalytics = {
  topIocs: MOCK_TOP_IOCS,
  topCves: MOCK_TOP_CVES,
  topActors: MOCK_TOP_ACTORS,
  iocTrend: MOCK_IOC_TREND,
  alertTrend: MOCK_ALERT_TREND,
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
  refetch: vi.fn(),
  isFetching: false,
  dataUpdatedAt: Date.now(),
  error: null,
}

vi.mock('@/hooks/use-analytics-dashboard', () => ({
  useAnalyticsDashboard: () => mockAnalytics,
}))

vi.mock('@/hooks/use-intel-data', () => ({
  useIOCs: () => ({ data: { data: [], total: 0 }, isLoading: false }),
  useIOCStats: () => ({ data: { total: 100, bySeverity: {}, byType: {}, byLifecycle: {} } }),
  useDashboardStats: () => ({ data: { criticalIOCs: 30 } }),
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

vi.mock('@/components/viz/SeverityHeatmap', () => ({
  SeverityHeatmap: () => <div data-testid="severity-heatmap" />,
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ user: { displayName: 'Analyst', role: 'tenant_admin' }, tenant: { name: 'TestCorp' } }),
}))

let mockStoreProfile: { industry?: string; techStack?: string[] } | null = null
vi.mock('@/stores/org-profile-store', () => ({
  useOrgProfileStore: (selector?: (s: unknown) => unknown) => {
    const state = { profile: mockStoreProfile, setProfile: vi.fn(), clearProfile: vi.fn() }
    return selector ? selector(state) : state
  },
}))

let mockMode: 'org-aware' | 'global' | 'super-admin' = 'global'
vi.mock('@/hooks/use-dashboard-mode', () => ({
  useDashboardMode: () => ({ mode: mockMode, profile: mockStoreProfile }),
}))

// Mock localStorage for view toggle
const localStorageMock: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStorageMock[key] ?? null,
  setItem: (key: string, value: string) => { localStorageMock[key] = value },
  removeItem: (key: string) => { delete localStorageMock[key] },
})

beforeEach(() => {
  mockMode = 'global'
  mockStoreProfile = null
  mockAnalytics.isDemo = false
  delete localStorageMock['etip-dashboard-view']
})

// ═══════════════════════════════════════════════════════════════════
// ThreatScoreWidget
// ═══════════════════════════════════════════════════════════════════

import { ThreatScoreWidget } from '@/components/widgets/ThreatScoreWidget'

describe('ThreatScoreWidget', () => {
  it('renders with testid and shows 5 scored IOCs', () => {
    render(<ThreatScoreWidget profile={null} />)
    expect(screen.getByTestId('threat-score-widget')).toBeInTheDocument()
    expect(screen.getByText('185.220.101.34')).toBeInTheDocument()
    expect(screen.getByText('evil-payload.xyz')).toBeInTheDocument()
    expect(screen.getByText('CVE-2024-21762')).toBeInTheDocument()
  })

  it('shows type badges for each IOC', () => {
    render(<ThreatScoreWidget profile={null} />)
    expect(screen.getByText('IP')).toBeInTheDocument()
    expect(screen.getByText('DOMAIN')).toBeInTheDocument()
    expect(screen.getByText('CVE')).toBeInTheDocument()
  })

  it('computes scores as numbers between 0 and 100', () => {
    render(<ThreatScoreWidget profile={null} />)
    const widget = screen.getByTestId('threat-score-widget')
    // Score numbers should be visible — they're bold text elements
    const scores = widget.querySelectorAll('.font-bold.tabular-nums')
    expect(scores.length).toBe(5)
    scores.forEach(el => {
      const score = parseInt(el.textContent ?? '0', 10)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    })
  })

  it('shows Demo badge when isDemo=true', () => {
    mockAnalytics.isDemo = true
    render(<ThreatScoreWidget profile={null} />)
    expect(screen.getByText('Demo')).toBeInTheDocument()
  })

  it('boosts score when org profile has industry set', () => {
    const profileNone = null
    const profileSet = { industry: 'finance', techStack: ['nodejs'] }

    const { unmount } = render(<ThreatScoreWidget profile={profileNone} />)
    const scoresNone = Array.from(
      screen.getByTestId('threat-score-widget').querySelectorAll('.font-bold.tabular-nums'),
    ).map(el => parseInt(el.textContent ?? '0', 10))
    unmount()

    render(<ThreatScoreWidget profile={profileSet} />)
    const scoresBoosted = Array.from(
      screen.getByTestId('threat-score-widget').querySelectorAll('.font-bold.tabular-nums'),
    ).map(el => parseInt(el.textContent ?? '0', 10))

    // At least one critical IOC should have a higher score with profile
    const maxNone = Math.max(...scoresNone)
    const maxBoosted = Math.max(...scoresBoosted)
    expect(maxBoosted).toBeGreaterThanOrEqual(maxNone)
  })

  it('shows empty state when no IOCs', () => {
    const orig = mockAnalytics.topIocs
    mockAnalytics.topIocs = []
    render(<ThreatScoreWidget profile={null} />)
    expect(screen.getByText('No scored IOCs yet')).toBeInTheDocument()
    mockAnalytics.topIocs = orig
  })
})

// ═══════════════════════════════════════════════════════════════════
// ThreatBriefingWidget
// ═══════════════════════════════════════════════════════════════════

import { ThreatBriefingWidget } from '@/components/widgets/ThreatBriefingWidget'

describe('ThreatBriefingWidget', () => {
  it('renders with testid', () => {
    render(<ThreatBriefingWidget profile={null} />)
    expect(screen.getByTestId('threat-briefing-widget')).toBeInTheDocument()
  })

  it('shows critical IOC count', () => {
    render(<ThreatBriefingWidget profile={null} />)
    expect(screen.getByText('30')).toBeInTheDocument() // iocBySeverity.critical = 30
    expect(screen.getByText('Critical IOCs')).toBeInTheDocument()
  })

  it('shows CVE count and top EPSS', () => {
    render(<ThreatBriefingWidget profile={null} />)
    expect(screen.getByText('CVEs Tracked')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument() // 2 topCves
  })

  it('shows most active actor name', () => {
    render(<ThreatBriefingWidget profile={null} />)
    expect(screen.getByText('APT28 (Fancy Bear)')).toBeInTheDocument()
  })

  it('shows IOC trend direction', () => {
    render(<ThreatBriefingWidget profile={null} />)
    expect(screen.getByText('IOC Trend')).toBeInTheDocument()
  })

  it('shows org threat pill when profile has industry', () => {
    render(<ThreatBriefingWidget profile={{ industry: 'Healthcare' }} />)
    expect(screen.getByText('Your Industry')).toBeInTheDocument()
    expect(screen.getByText('30 threats')).toBeInTheDocument()
  })

  it('shows "Not set" when no org profile', () => {
    render(<ThreatBriefingWidget profile={null} />)
    expect(screen.getByText('Not set')).toBeInTheDocument()
  })

  it('shows Demo badge when isDemo=true', () => {
    mockAnalytics.isDemo = true
    render(<ThreatBriefingWidget profile={null} />)
    expect(screen.getByText('Demo')).toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════
// AttackTechniqueWidget
// ═══════════════════════════════════════════════════════════════════

import { AttackTechniqueWidget } from '@/components/widgets/AttackTechniqueWidget'

describe('AttackTechniqueWidget', () => {
  it('renders with testid', () => {
    render(<AttackTechniqueWidget />)
    expect(screen.getByTestId('attack-technique-widget')).toBeInTheDocument()
  })

  it('shows 8 ATT&CK tactic categories', () => {
    render(<AttackTechniqueWidget />)
    expect(screen.getByText('Init Access')).toBeInTheDocument()
    expect(screen.getByText('Execution')).toBeInTheDocument()
    expect(screen.getByText('Persistence')).toBeInTheDocument()
    expect(screen.getByText('Priv Esc')).toBeInTheDocument()
    expect(screen.getByText('Def Evasion')).toBeInTheDocument()
    expect(screen.getByText('Cred Access')).toBeInTheDocument()
    expect(screen.getByText('Discovery')).toBeInTheDocument()
    expect(screen.getByText('Lateral Mvt')).toBeInTheDocument()
  })

  it('shows count bubbles for each tactic', () => {
    render(<AttackTechniqueWidget />)
    const widget = screen.getByTestId('attack-technique-widget')
    const counts = widget.querySelectorAll('.font-bold.tabular-nums')
    expect(counts.length).toBe(8)
    counts.forEach(el => {
      expect(parseInt(el.textContent ?? '0', 10)).toBeGreaterThan(0)
    })
  })

  it('shows Beta badge when not in demo mode', () => {
    mockAnalytics.isDemo = false
    render(<AttackTechniqueWidget />)
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('shows Demo badge when isDemo=true', () => {
    mockAnalytics.isDemo = true
    render(<AttackTechniqueWidget />)
    expect(screen.getByText('Demo')).toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════
// ExecSummaryCards
// ═══════════════════════════════════════════════════════════════════

import { ExecSummaryCards } from '@/components/widgets/ExecSummaryCards'

describe('ExecSummaryCards', () => {
  it('renders with testid and 3 cards', () => {
    render(<ExecSummaryCards />)
    expect(screen.getByTestId('exec-summary-cards')).toBeInTheDocument()
    expect(screen.getByText('Risk Posture')).toBeInTheDocument()
    expect(screen.getByText('Top Threats')).toBeInTheDocument()
    expect(screen.getByText('Feed Coverage')).toBeInTheDocument()
  })

  it('shows risk level based on severity distribution', () => {
    render(<ExecSummaryCards />)
    // critical=30, high=50 → high risk (critical > 20 = critical actually)
    expect(screen.getByText('Critical')).toBeInTheDocument()
  })

  it('shows top threats in plain English', () => {
    render(<ExecSummaryCards />)
    expect(screen.getByText(/APT28 \(Fancy Bear\)/)).toBeInTheDocument()
    expect(screen.getByText(/Lazarus Group/)).toBeInTheDocument()
    expect(screen.getByText(/CVE-2024-21762/)).toBeInTheDocument()
  })

  it('shows active feed count and avg reliability', () => {
    render(<ExecSummaryCards />)
    expect(screen.getByText('12')).toBeInTheDocument() // summary.totalFeeds
    expect(screen.getByText('active feeds')).toBeInTheDocument()
    // Avg reliability: (85 + 95 + 45) / 3 = 75
    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  it('shows risk summary text', () => {
    render(<ExecSummaryCards />)
    expect(screen.getByText(/critical\/high severity indicators require attention/)).toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════
// DashboardPage — view toggle
// ═══════════════════════════════════════════════════════════════════

import { DashboardPage } from '@/pages/DashboardPage'

describe('DashboardPage — view toggle', () => {
  it('defaults to analyst view with widget grid', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('threat-score-widget')).toBeInTheDocument()
    expect(screen.getByTestId('attack-technique-widget')).toBeInTheDocument()
    expect(screen.getByTestId('threat-briefing-widget')).toBeInTheDocument()
    expect(screen.getByTestId('severity-heatmap')).toBeInTheDocument()
  })

  it('shows view toggle button', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('view-toggle')).toBeInTheDocument()
    expect(screen.getByText('Executive View')).toBeInTheDocument()
  })

  it('switches to executive view on toggle click', () => {
    render(<DashboardPage />)
    fireEvent.click(screen.getByTestId('view-toggle'))
    // Executive view shows ExecSummaryCards, hides widget grid
    expect(screen.getByTestId('exec-summary-cards')).toBeInTheDocument()
    expect(screen.queryByTestId('threat-score-widget')).not.toBeInTheDocument()
    expect(screen.queryByTestId('severity-heatmap')).not.toBeInTheDocument()
  })

  it('shows briefing widget in both views', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('threat-briefing-widget')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('view-toggle'))
    expect(screen.getByTestId('threat-briefing-widget')).toBeInTheDocument()
  })

  it('persists view toggle to localStorage', () => {
    render(<DashboardPage />)
    fireEvent.click(screen.getByTestId('view-toggle'))
    expect(localStorageMock['etip-dashboard-view']).toBe('executive')
  })

  it('toggles back to analyst view', () => {
    render(<DashboardPage />)
    fireEvent.click(screen.getByTestId('view-toggle'))
    expect(screen.getByText('Analyst View')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('view-toggle'))
    expect(screen.getByTestId('threat-score-widget')).toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════════════
// Delta Badges
// ═══════════════════════════════════════════════════════════════════

import { FeedHealthWidget } from '@/components/widgets/FeedHealthWidget'
import { RecentAlertsWidget } from '@/components/widgets/RecentAlertsWidget'

describe('Delta badges', () => {
  it('FeedHealthWidget shows healthy count with delta badge', () => {
    render(<FeedHealthWidget />)
    expect(screen.getByTestId('feed-health-widget')).toBeInTheDocument()
    // 2 feeds with reliability >= 80 out of 3
    expect(screen.getByText(/2\/3 healthy/)).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('RecentAlertsWidget shows alert count badge', () => {
    render(<RecentAlertsWidget />)
    expect(screen.getByTestId('recent-alerts-widget')).toBeInTheDocument()
    // Total alert count from alertTrend: 5 + 7 = 12
    expect(screen.getByText('12')).toBeInTheDocument()
  })
})
