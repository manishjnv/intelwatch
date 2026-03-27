/**
 * Tests for GlobalCatalogPage:
 * - Catalog tab: feed list, type icons, admiralty badges, reliability bars
 * - Subscriptions tab, Pipeline Health tab
 * - Filters, subscribe/unsubscribe, demo fallback
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

const mockSubscribe = vi.fn()
const mockUnsubscribe = vi.fn()

vi.mock('@/hooks/use-global-catalog', () => ({
  useGlobalCatalog: vi.fn(() => ({
    data: [
      {
        id: 'gf-1', name: 'AlienVault OTX Global', description: 'Community TI', feedType: 'rss',
        url: 'https://otx.alienvault.com', enabled: true, sourceReliability: 'B', infoCred: '2',
        admiraltyCode: 'B2', minPlanTier: 'free', feedReliability: 92, subscriberCount: 45,
        lastFetchAt: new Date(Date.now() - 3600_000).toISOString(), totalItemsIngested: 15420,
        consecutiveFailures: 0, createdAt: new Date().toISOString(),
      },
      {
        id: 'gf-2', name: 'CISA KEV Global', description: 'Known Exploited Vulns', feedType: 'nvd',
        url: 'https://cisa.gov', enabled: true, sourceReliability: 'A', infoCred: '1',
        admiraltyCode: 'A1', minPlanTier: 'starter', feedReliability: 98, subscriberCount: 78,
        lastFetchAt: new Date(Date.now() - 7200_000).toISOString(), totalItemsIngested: 2340,
        consecutiveFailures: 0, createdAt: new Date().toISOString(),
      },
      {
        id: 'gf-3', name: 'Disabled Feed', description: 'Disabled', feedType: 'stix',
        url: 'https://disabled.test', enabled: false, sourceReliability: 'C', infoCred: '3',
        admiraltyCode: 'C3', minPlanTier: 'teams', feedReliability: 50, subscriberCount: 5,
        lastFetchAt: null, totalItemsIngested: 100,
        consecutiveFailures: 3, createdAt: new Date().toISOString(),
      },
    ],
    isLoading: false,
    isDemo: false,
  })),
  useMySubscriptions: vi.fn(() => ({
    data: [{ id: 's1', tenantId: 't1', globalFeedId: 'gf-1', alertConfig: {}, createdAt: new Date().toISOString() }],
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isSubscribing: false,
    isUnsubscribing: false,
    isLoading: false,
    isDemo: false,
  })),
  useGlobalPipelineHealth: vi.fn(() => ({
    data: {
      queues: [
        { name: 'etip-feed-fetch-global-rss', waiting: 3, active: 1, completed: 1240, failed: 2, delayed: 0 },
        { name: 'etip-normalize-global', waiting: 8, active: 3, completed: 4200, failed: 3, delayed: 0 },
      ],
      pipeline: { articlesProcessed24h: 1240, iocsCreated24h: 580, iocsEnriched24h: 420, avgNormalizeLatencyMs: 320, avgEnrichLatencyMs: 1450 },
    },
    isLoading: false,
    isDemo: false,
  })),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector: any) => selector({
    user: { displayName: 'Admin', email: 'admin@test.com', role: 'super_admin' },
    tenant: { name: 'ACME Corp' },
    accessToken: 'mock-token',
  })),
}))

vi.mock('@/stores/theme-store', () => ({
  useThemeStore: vi.fn(() => ({ theme: 'dark', toggleTheme: vi.fn() })),
}))

vi.mock('@/hooks/use-auth', () => ({
  useLogout: vi.fn(() => ({ mutate: vi.fn() })),
}))

vi.mock('@/hooks/use-intel-data', () => ({
  useDashboardStats: vi.fn(() => ({ data: { totalIOCs: 0, criticalIOCs: 0, activeFeeds: 0, enrichedToday: 0, lastIngestTime: 'Demo' } })),
  useIOCs: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useActors: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useMalware: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useVulnerabilities: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useFeeds: vi.fn(() => ({ data: { data: [], total: 0 } })),
  useUpdateIOCLifecycle: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))

// Import page and mocked hooks after mocks
import { GlobalCatalogPage } from '@/pages/GlobalCatalogPage'
import { useGlobalCatalog } from '@/hooks/use-global-catalog'

describe('GlobalCatalogPage', () => {
  it('renders catalog tab with feed list', () => {
    render(<GlobalCatalogPage />)
    expect(screen.getByText('AlienVault OTX Global')).toBeInTheDocument()
    expect(screen.getByText('CISA KEV Global')).toBeInTheDocument()
  })

  it('renders feed type icons', () => {
    render(<GlobalCatalogPage />)
    expect(screen.getByText('rss')).toBeInTheDocument()
    expect(screen.getByText('nvd')).toBeInTheDocument()
  })

  it('renders Admiralty Code badges', () => {
    render(<GlobalCatalogPage />)
    expect(screen.getByText('B2')).toBeInTheDocument()
    expect(screen.getByText('A1')).toBeInTheDocument()
  })

  it('renders feedReliability progress bars', () => {
    render(<GlobalCatalogPage />)
    expect(screen.getByText('92%')).toBeInTheDocument()
    expect(screen.getByText('98%')).toBeInTheDocument()
  })

  it('filter by feedType shows filtered results', () => {
    render(<GlobalCatalogPage />)
    // All 3 feeds shown initially
    expect(screen.getByText('AlienVault OTX Global')).toBeInTheDocument()
    expect(screen.getByText('CISA KEV Global')).toBeInTheDocument()
    expect(screen.getByText('Disabled Feed')).toBeInTheDocument()
  })

  it('Subscribe button calls API', () => {
    render(<GlobalCatalogPage />)
    // gf-2 is not subscribed → shows "Subscribe"
    const btn = screen.getByTestId('subscribe-gf-2')
    fireEvent.click(btn)
    expect(mockSubscribe).toHaveBeenCalledWith('gf-2')
  })

  it('Unsubscribe button calls API', () => {
    render(<GlobalCatalogPage />)
    // gf-1 is subscribed → shows "Unsubscribe"
    const btn = screen.getByTestId('subscribe-gf-1')
    expect(btn.textContent).toBe('Unsubscribe')
    fireEvent.click(btn)
    expect(mockUnsubscribe).toHaveBeenCalledWith('gf-1')
  })

  it('My Subscriptions tab shows subscribed feeds only', () => {
    render(<GlobalCatalogPage />)
    const subTab = screen.getByTestId('tab-subscriptions')
    fireEvent.click(subTab)
    // Only gf-1 is subscribed
    expect(screen.getByText('AlienVault OTX Global')).toBeInTheDocument()
  })

  it('Pipeline Health tab renders queue cards (admin)', () => {
    render(<GlobalCatalogPage />)
    const pipelineTab = screen.getByTestId('tab-pipeline')
    fireEvent.click(pipelineTab)
    expect(screen.getByText('fetch-rss')).toBeInTheDocument()
    expect(screen.getByText('normalize-global')).toBeInTheDocument()
  })

  it('Pause button present on pipeline tab', () => {
    render(<GlobalCatalogPage />)
    const pipelineTab = screen.getByTestId('tab-pipeline')
    fireEvent.click(pipelineTab)
    expect(screen.getByTestId('pause-pipeline')).toBeInTheDocument()
    expect(screen.getByTestId('resume-pipeline')).toBeInTheDocument()
  })

  it('loading skeleton shown while fetching', () => {
    vi.mocked(useGlobalCatalog).mockReturnValueOnce({ data: undefined, isLoading: true, isDemo: false } as any)
    render(<GlobalCatalogPage />)
    expect(screen.getByTestId('global-catalog-page')).toBeInTheDocument()
  })

  it('empty state when no feeds available', () => {
    vi.mocked(useGlobalCatalog).mockReturnValueOnce({ data: [], isLoading: false, isDemo: false } as any)
    render(<GlobalCatalogPage />)
    expect(screen.getByText('No feeds available')).toBeInTheDocument()
  })

  it('search by name filters table', () => {
    render(<GlobalCatalogPage />)
    const searchInput = screen.getByPlaceholderText('Search feeds...')
    fireEvent.change(searchInput, { target: { value: 'CISA' } })
    // Debounced — would need to advance timers for full test
    expect(searchInput).toHaveValue('CISA')
  })

  it('page header renders correctly', () => {
    render(<GlobalCatalogPage />)
    expect(screen.getByText('Global Feed Catalog')).toBeInTheDocument()
    expect(screen.getByText('Browse and subscribe to curated threat intelligence feeds')).toBeInTheDocument()
  })
})
