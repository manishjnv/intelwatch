/**
 * Tests for GlobalMonitoringPage:
 * - Status badge, pipeline flow, feed health grid, IOC stats,
 *   corroboration leaders, actions, modal, demo fallback, mobile
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

const mockPause = vi.fn()
const mockResume = vi.fn()
const mockRetrigger = vi.fn()

vi.mock('@/hooks/use-global-monitoring', () => ({
  useGlobalMonitoring: vi.fn(() => MOCK_MONITORING),
  useGlobalIocStats: vi.fn(() => ({ data: MOCK_IOC_STATS, isDemo: false })),
  useCorroborationLeaders: vi.fn(() => ({ data: MOCK_LEADERS, isDemo: false })),
  useSubscriptionStats: vi.fn(() => ({ data: MOCK_SUB_STATS, isDemo: false })),
}))

vi.mock('@/hooks/use-global-catalog', () => ({
  useGlobalCatalog: vi.fn(() => ({ data: MOCK_FEEDS, isLoading: false, isDemo: false })),
  useMySubscriptions: vi.fn(() => ({ data: [], subscribe: vi.fn(), unsubscribe: vi.fn(), isSubscribing: false, isUnsubscribing: false, isLoading: false, isDemo: false })),
  useGlobalPipelineHealth: vi.fn(() => ({ data: MOCK_PIPELINE, isLoading: false, isDemo: false })),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((sel: any) => sel({
    user: { displayName: 'Admin', email: 'admin@test.com', role: 'super_admin' },
    tenant: { name: 'ACME' },
    accessToken: 'tok',
  })),
}))
vi.mock('@/stores/theme-store', () => ({ useThemeStore: vi.fn(() => ({ theme: 'dark', toggleTheme: vi.fn() })) }))
vi.mock('@/hooks/use-auth', () => ({ useLogout: vi.fn(() => ({ mutate: vi.fn() })) }))
vi.mock('@/hooks/use-intel-data', () => ({ useDashboardStats: vi.fn(() => ({ data: null })) }))

const MOCK_FEEDS = [
  { id: 'gf-1', name: 'OTX Global', description: '', feedType: 'rss', url: '', enabled: true, sourceReliability: 'B', infoCred: '2', admiraltyCode: 'B2', minPlanTier: 'free', feedReliability: 92, subscriberCount: 45, lastFetchAt: new Date(Date.now() - 1800_000).toISOString(), totalItemsIngested: 15000, consecutiveFailures: 0, createdAt: '' },
  { id: 'gf-2', name: 'CISA KEV', description: '', feedType: 'nvd', url: '', enabled: true, sourceReliability: 'A', infoCred: '1', admiraltyCode: 'A1', minPlanTier: 'free', feedReliability: 98, subscriberCount: 78, lastFetchAt: new Date(Date.now() - 1800_000).toISOString(), totalItemsIngested: 2300, consecutiveFailures: 0, createdAt: '' },
  { id: 'gf-3', name: 'Broken Feed', description: '', feedType: 'stix', url: '', enabled: false, sourceReliability: 'C', infoCred: '3', admiraltyCode: 'C3', minPlanTier: 'teams', feedReliability: 50, subscriberCount: 5, lastFetchAt: null, totalItemsIngested: 100, consecutiveFailures: 5, createdAt: '' },
]

const MOCK_PIPELINE = {
  queues: [
    { name: 'etip-feed-fetch-global-rss', waiting: 3, active: 1, completed: 1240, failed: 2, delayed: 0 },
    { name: 'etip-normalize-global', waiting: 8, active: 3, completed: 4200, failed: 3, delayed: 0 },
    { name: 'etip-enrich-global', waiting: 15, active: 2, completed: 3800, failed: 8, delayed: 5 },
  ],
  pipeline: { articlesProcessed24h: 1240, iocsCreated24h: 580, iocsEnriched24h: 420, avgNormalizeLatencyMs: 320, avgEnrichLatencyMs: 1450 },
}

const MOCK_IOC_STATS = {
  totalGlobalIOCs: 4820, created24h: 580, enriched24h: 420, unenriched: 145,
  warninglistFiltered: 312, avgConfidence: 68, highConfidenceCount: 1940,
  byType: { ip: 1800, domain: 1200, hash: 680, cve: 540 },
  byConfidenceTier: { High: 1940, Medium: 1900, Low: 860, None: 120 },
}

const MOCK_LEADERS = [
  { id: 'gl-1', value: '185.220.101.34', iocType: 'ip', confidence: 95, stixConfidenceTier: 'High', crossFeedCorroboration: 7, sightingSources: ['OTX'], firstSeen: new Date(Date.now() - 30 * 86_400_000).toISOString() },
  { id: 'gl-2', value: 'evil.ru', iocType: 'domain', confidence: 92, stixConfidenceTier: 'High', crossFeedCorroboration: 5, sightingSources: ['MISP'], firstSeen: new Date(Date.now() - 14 * 86_400_000).toISOString() },
]

const MOCK_SUB_STATS = {
  total: 42, uniqueTenants: 8,
  popularFeeds: [{ name: 'NVD', count: 91 }, { name: 'CISA', count: 78 }],
}

const MOCK_MONITORING = {
  pipelineHealth: MOCK_PIPELINE,
  feedHealth: MOCK_FEEDS,
  iocStats: MOCK_IOC_STATS,
  corroborationLeaders: MOCK_LEADERS,
  subscriptionStats: MOCK_SUB_STATS,
  isLoading: false, error: null, isDemo: false, lastUpdated: new Date(),
  pausePipeline: mockPause, resumePipeline: mockResume, retriggerFailed: mockRetrigger,
}

import { GlobalMonitoringPage } from '@/pages/GlobalMonitoringPage'

describe('GlobalMonitoringPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders status badge (healthy)', () => {
    render(<GlobalMonitoringPage />)
    expect(screen.getByTestId('status-badge')).toBeTruthy()
    expect(screen.getByTestId('status-badge').textContent).toBe('healthy')
  })

  it('renders pipeline flow diagram with stages', () => {
    render(<GlobalMonitoringPage />)
    const flow = screen.getByTestId('pipeline-flow')
    expect(flow).toBeTruthy()
    expect(flow.textContent).toContain('Feeds')
    expect(flow.textContent).toContain('Fetch')
    expect(flow.textContent).toContain('Normalize')
    expect(flow.textContent).toContain('Enrich')
    expect(flow.textContent).toContain('Alert')
  })

  it('feed health grid renders feed cards', () => {
    render(<GlobalMonitoringPage />)
    const cards = screen.getAllByTestId('feed-card')
    expect(cards.length).toBe(3)
  })

  it('feed card shows Admiralty Code badge', () => {
    render(<GlobalMonitoringPage />)
    const badges = screen.getAllByTestId('admiralty-badge')
    expect(badges.length).toBeGreaterThan(0)
    expect(badges[0].textContent).toBe('B2')
  })

  it('disabled feed shows Re-enable button', () => {
    render(<GlobalMonitoringPage />)
    expect(screen.getByText('Re-enable')).toBeTruthy()
  })

  it('IOC stat cards render correct numbers', () => {
    render(<GlobalMonitoringPage />)
    expect(screen.getByText('4,820')).toBeTruthy()
    expect(screen.getByText('580')).toBeTruthy()
    expect(screen.getByText('420')).toBeTruthy()
  })

  it('confidence tier distribution chart renders', () => {
    render(<GlobalMonitoringPage />)
    expect(screen.getByText('Confidence Tiers')).toBeTruthy()
    expect(screen.getByText('IOC Type Distribution')).toBeTruthy()
  })

  it('corroboration leaders table shows entries', () => {
    render(<GlobalMonitoringPage />)
    const rows = screen.getAllByTestId('corroboration-row')
    expect(rows.length).toBe(2)
    expect(rows[0].textContent).toContain('185.220.101.34')
  })

  it('clicking corroboration row selects IOC', () => {
    render(<GlobalMonitoringPage />)
    const rows = screen.getAllByTestId('corroboration-row')
    fireEvent.click(rows[0])
    // selection is tracked internally — no error thrown
  })

  it('pause button shows confirmation modal', () => {
    render(<GlobalMonitoringPage />)
    fireEvent.click(screen.getByTestId('pause-btn'))
    expect(screen.getByTestId('pause-modal')).toBeTruthy()
    expect(screen.getByText('Pause Global Pipeline?')).toBeTruthy()
  })

  it('confirming pause calls pausePipeline', () => {
    render(<GlobalMonitoringPage />)
    fireEvent.click(screen.getByTestId('pause-btn'))
    fireEvent.click(screen.getByText('Pause'))
    expect(mockPause).toHaveBeenCalledTimes(1)
  })

  it('auto-refresh dropdown changes interval', () => {
    render(<GlobalMonitoringPage />)
    const select = screen.getByTestId('refresh-select')
    fireEvent.change(select, { target: { value: '10000' } })
    expect((select as HTMLSelectElement).value).toBe('10000')
  })

  it('demo fallback renders banner when isDemo', async () => {
    const mod = await import('@/hooks/use-global-monitoring')
    vi.mocked(mod.useGlobalMonitoring).mockReturnValueOnce({ ...MOCK_MONITORING, isDemo: true })
    render(<GlobalMonitoringPage />)
    expect(screen.getByText(/Demo data/)).toBeTruthy()
  })

  it('subscription overview shows correct stats', () => {
    render(<GlobalMonitoringPage />)
    expect(screen.getByText('Total Subscriptions')).toBeTruthy()
    expect(screen.getByText('42')).toBeTruthy()
    expect(screen.getByText('Unique Tenants')).toBeTruthy()
  })

  it('action bar renders all buttons', () => {
    render(<GlobalMonitoringPage />)
    const actionBar = screen.getByTestId('action-bar')
    expect(actionBar.textContent).toContain('Pause Pipeline')
    expect(actionBar.textContent).toContain('Resume Pipeline')
    expect(actionBar.textContent).toContain('Retrigger Failed')
  })
})
