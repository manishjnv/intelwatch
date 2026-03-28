/**
 * @module __tests__/feeds-tab.test
 * @description Tests for FeedsTab — My Feeds, Catalog, Pipeline Health sub-tabs.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { FeedsTab } from '@/components/command-center/FeedsTab'

// ─── Mock hooks ──────────────────────────────────────────────

vi.mock('@/hooks/use-intel-data', () => ({
  useFeeds: () => ({
    data: {
      data: [
        { id: 'f1', name: 'CISA RSS', feedType: 'rss', status: 'active', enabled: true, consecutiveFailures: 0, feedReliability: 95, schedule: '*/15 * * * *', lastFetchAt: new Date().toISOString(), totalItemsIngested: 500, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), description: null, url: null, lastErrorAt: null, lastErrorMessage: null },
        { id: 'f2', name: 'NVD Feed', feedType: 'nvd', status: 'active', enabled: true, consecutiveFailures: 2, feedReliability: 70, schedule: '0 */2 * * *', lastFetchAt: new Date().toISOString(), totalItemsIngested: 200, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), description: null, url: null, lastErrorAt: null, lastErrorMessage: null },
        { id: 'f3', name: 'Disabled Feed', feedType: 'stix', status: 'disabled', enabled: false, consecutiveFailures: 0, feedReliability: 80, schedule: null, lastFetchAt: null, totalItemsIngested: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), description: null, url: null, lastErrorAt: null, lastErrorMessage: null },
      ],
      total: 3, page: 1, limit: 50,
    },
    isLoading: false, isDemo: false,
  }),
  useToggleFeed: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteFeed: () => ({ mutate: vi.fn(), isPending: false }),
  useForceFetch: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/use-global-catalog', () => ({
  useGlobalCatalog: () => ({
    data: [
      { id: 'gf-1', name: 'AlienVault OTX', feedType: 'rss', admiraltyCode: 'B2', minPlanTier: 'free', feedReliability: 92, subscriberCount: 45, totalItemsIngested: 15420, description: 'Community TI', enabled: true, sourceReliability: 'B', infoCred: '2', url: '', lastFetchAt: null, consecutiveFailures: 0, createdAt: '' },
      { id: 'gf-2', name: 'CISA KEV', feedType: 'rest', admiraltyCode: 'A1', minPlanTier: 'free', feedReliability: 98, subscriberCount: 78, totalItemsIngested: 2340, description: 'Known Exploited Vulnerabilities', enabled: true, sourceReliability: 'A', infoCred: '1', url: '', lastFetchAt: null, consecutiveFailures: 0, createdAt: '' },
    ],
    isLoading: false, isDemo: false,
  }),
  useMySubscriptions: () => ({
    data: { data: [{ globalFeedId: 'gf-1', id: 's1', tenantId: 't1', alertConfig: {}, createdAt: '' }], total: 1, page: 1, limit: 50 },
    isLoading: false, isDemo: false,
    subscribe: vi.fn(), unsubscribe: vi.fn(), isSubscribing: false, isUnsubscribing: false,
  }),
  useGlobalPipelineHealth: () => ({
    data: {
      queues: [
        { name: 'etip-feed-fetch-global-rss', waiting: 3, active: 1, completed: 1240, failed: 2, delayed: 0 },
      ],
      pipeline: { articlesProcessed24h: 1240, iocsCreated24h: 580, iocsEnriched24h: 420, avgNormalizeLatencyMs: 320, avgEnrichLatencyMs: 1450 },
    },
    isLoading: false, isDemo: false,
  }),
}))

vi.mock('@/hooks/useDebouncedValue', () => ({
  useDebouncedValue: (v: any) => v,
}))

vi.mock('@/components/feed/FeedCard', () => ({
  FeedTypeIcon: ({ type }: any) => <span data-testid="feed-type-icon">{type}</span>,
  StatusDot: ({ status }: any) => <span data-testid="status-dot">{status}</span>,
  ReliabilityBar: ({ value }: any) => <span data-testid="reliability-bar">{value}</span>,
  HealthDot: ({ score }: any) => <span data-testid="health-dot">{score}</span>,
  FailureSparkline: () => <span />,
  formatTime: (_d: string) => 'just now',
  computeFeedHealth: () => 85,
}))

// ─── Mock data ──────────────────────────────────────────────

const baseMockCC: any = {
  isSuperAdmin: true, userRole: 'super_admin', tenantPlan: 'teams',
  globalStats: { totalCostUsd: 0, totalItems: 0, itemsBySubtask: {}, costByProvider: {}, costByModel: {}, costBySubtask: {}, costTrend: [] },
  tenantStats: { tenantId: 't1', itemsConsumed: 0, attributedCostUsd: 0, costByProvider: {}, costByItemType: {}, consumptionTrend: [], budgetUsedPercent: 0, budgetLimitUsd: 0 },
  tenantList: [], queueStats: { pendingItems: 0, processingRate: 0 }, providerKeys: [],
  isLoading: false, isDemo: false, period: 'month' as const,
  setPeriod: vi.fn(), refetchAll: vi.fn(), isFetching: false,
  setProviderKey: vi.fn(), isSettingKey: false, testProviderKey: vi.fn(), isTestingKey: false, removeProviderKey: vi.fn(), isRemovingKey: false,
}

describe('FeedsTab', () => {
  it('renders My Feeds sub-tab by default', () => {
    render(<FeedsTab data={baseMockCC} />)
    expect(screen.getByTestId('feeds-tab')).toBeInTheDocument()
    expect(screen.getByTestId('my-feeds-panel')).toBeInTheDocument()
  })

  it('renders feed table with all feeds', () => {
    render(<FeedsTab data={baseMockCC} />)
    expect(screen.getByTestId('feed-table')).toBeInTheDocument()
    expect(screen.getByText('CISA RSS')).toBeInTheDocument()
    expect(screen.getByText('NVD Feed')).toBeInTheDocument()
    expect(screen.getByText('Disabled Feed')).toBeInTheDocument()
  })

  it('shows super-admin action buttons', () => {
    render(<FeedsTab data={baseMockCC} />)
    expect(screen.getByTestId('toggle-feed-f1')).toBeInTheDocument()
    expect(screen.getByTestId('force-fetch-f1')).toBeInTheDocument()
    expect(screen.getByTestId('delete-feed-f1')).toBeInTheDocument()
  })

  it('filters feeds by search', () => {
    render(<FeedsTab data={baseMockCC} />)
    const searchInput = screen.getByTestId('feed-search')
    fireEvent.change(searchInput, { target: { value: 'NVD' } })
    expect(screen.getByText('NVD Feed')).toBeInTheDocument()
    expect(screen.queryByText('CISA RSS')).not.toBeInTheDocument()
  })

  it('switches to Feed Catalog sub-tab', () => {
    render(<FeedsTab data={baseMockCC} />)
    fireEvent.click(screen.getByTestId('pill-catalog'))
    expect(screen.getByTestId('catalog-panel')).toBeInTheDocument()
    expect(screen.getByText('AlienVault OTX')).toBeInTheDocument()
    expect(screen.getByText('CISA KEV')).toBeInTheDocument()
  })

  it('shows subscribe/unsubscribe buttons in catalog', () => {
    render(<FeedsTab data={baseMockCC} />)
    fireEvent.click(screen.getByTestId('pill-catalog'))
    // gf-1 is subscribed
    expect(screen.getByTestId('subscribe-gf-1')).toHaveTextContent('Unsubscribe')
    // gf-2 is not subscribed
    expect(screen.getByTestId('subscribe-gf-2')).toHaveTextContent('Subscribe')
  })

  it('switches to Pipeline Health sub-tab (super-admin)', () => {
    render(<FeedsTab data={baseMockCC} />)
    fireEvent.click(screen.getByTestId('pill-pipeline'))
    expect(screen.getByTestId('pipeline-health-panel')).toBeInTheDocument()
    expect(screen.getByText('1,240')).toBeInTheDocument() // articles
  })

  it('hides Pipeline Health for tenant admin', () => {
    const tenantCC = { ...baseMockCC, isSuperAdmin: false, userRole: 'tenant_admin' }
    render(<FeedsTab data={tenantCC} />)
    expect(screen.queryByTestId('pill-pipeline')).not.toBeInTheDocument()
  })

  it('shows delete confirmation modal', () => {
    render(<FeedsTab data={baseMockCC} />)
    fireEvent.click(screen.getByTestId('delete-feed-f1'))
    expect(screen.getByTestId('delete-modal')).toBeInTheDocument()
    expect(screen.getByText('Delete Feed')).toBeInTheDocument()
  })

  it('filters by type', () => {
    render(<FeedsTab data={baseMockCC} />)
    fireEvent.change(screen.getByTestId('feed-type-filter'), { target: { value: 'nvd' } })
    expect(screen.getByText('NVD Feed')).toBeInTheDocument()
    expect(screen.queryByText('CISA RSS')).not.toBeInTheDocument()
  })

  it('shows queue health cards in pipeline', () => {
    render(<FeedsTab data={baseMockCC} />)
    fireEvent.click(screen.getByTestId('pill-pipeline'))
    expect(screen.getByTestId('queue-etip-feed-fetch-global-rss')).toBeInTheDocument()
  })
})
