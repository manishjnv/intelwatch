/**
 * Tests for FeedListPage action buttons:
 * toggle, delete (with modal), force-fetch (with cooldown), retry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Mutable mock fns ────────────────────────────────────────────
const mockToggle  = vi.fn()
const mockDelete  = vi.fn()
const mockFetch   = vi.fn()
const mockRetry   = vi.fn()

// ─── Hook mocks ──────────────────────────────────────────────────
vi.mock('@/hooks/use-intel-data', () => ({
  useFeeds: vi.fn(() => ({
    data: {
      data: [
        {
          id: 'f1', name: 'Feed Active', description: 'Active desc',
          feedType: 'rss', url: 'https://example.com/rss', schedule: '0 */4 * * *',
          status: 'active', enabled: true,
          lastFetchAt: new Date(Date.now() - 3600_000).toISOString(),
          lastErrorAt: null, lastErrorMessage: null,
          consecutiveFailures: 0, totalItemsIngested: 5000, feedReliability: 95,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
        {
          id: 'f2', name: 'Feed Error', description: 'Error desc',
          feedType: 'rest_api', url: 'https://example.com/api', schedule: '0 0 * * *',
          status: 'error', enabled: true,
          lastFetchAt: new Date(Date.now() - 86400_000).toISOString(),
          lastErrorAt: new Date(Date.now() - 3600_000).toISOString(),
          lastErrorMessage: 'Connection timeout', consecutiveFailures: 3,
          totalItemsIngested: 890, feedReliability: 60,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
        {
          id: 'f3', name: 'Feed Disabled', description: 'Disabled desc',
          feedType: 'stix', url: 'https://example.com/stix', schedule: '0 */6 * * *',
          status: 'disabled', enabled: false,
          lastFetchAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
          lastErrorAt: null, lastErrorMessage: null,
          consecutiveFailures: 0, totalItemsIngested: 200, feedReliability: 80,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        },
      ],
      total: 3, page: 1, limit: 50,
    },
    isLoading: false,
  })),
  useRetryFeed:   vi.fn(() => ({ mutate: mockRetry,  isPending: false })),
  useToggleFeed:  vi.fn(() => ({ mutate: mockToggle, isPending: false })),
  useDeleteFeed:  vi.fn(() => ({ mutate: mockDelete, isPending: false })),
  useForceFetch:  vi.fn(() => ({ mutate: mockFetch,  isPending: false })),
  useFeedQuota:   vi.fn(() => ({ data: { planId: 'free', displayName: 'Free', maxFeeds: 3, minFetchInterval: '0 */4 * * *', retentionDays: 7 } })),
  useUpdateIOCLifecycle: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))

vi.mock('@/hooks/useDebouncedValue', () => ({
  useDebouncedValue: (v: unknown) => v,
}))

vi.mock('@/components/feed/FeedCard', () => ({
  FeedCard:          ({ feed }: any) => <div data-testid={`feed-card-${feed.id}`}>{feed.name}</div>,
  FeedTypeIcon:      () => <span />,
  StatusDot:         ({ status }: any) => <span>{status}</span>,
  ReliabilityBar:    () => <span data-testid="reliability-gauge" />,
  FeedFavicon:       () => <span />,
  formatTime:        () => '1h ago',
  getNextFireLabel:  () => 'in 2h',
  computeFeedHealth: () => 90,
  HealthDot:         () => <span data-testid="health-dot" />,
  FailureSparkline:  () => <span data-testid="failure-sparkline" />,
}))

vi.mock('@/components/feed/FeedScheduleTimeline', () => ({
  FeedScheduleTimeline: () => <div data-testid="schedule-timeline" />,
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: any) => <div>{children}</div>,
  CompactStat:  ({ label, value }: any) => <span data-testid={`stat-${label}`}>{value}</span>,
}))

vi.mock('@/components/data/DataTable', () => ({
  DataTable: ({ columns, data }: any) => (
    <div data-testid="data-table">
      {data.map((row: any) => {
        const actionsCol = columns.find((c: any) => c.key === 'actions')
        const errorsCol  = columns.find((c: any) => c.key === 'consecutiveFailures')
        return (
          <div key={row.id} data-testid={`row-${row.id}`}>
            <span>{row.name}</span>
            {errorsCol?.render(row)}
            {actionsCol?.render(row)}
          </div>
        )
      })}
    </div>
  ),
}))

vi.mock('@/components/data/FilterBar',    () => ({ FilterBar:    ({ children }: any) => <div>{children}</div> }))
vi.mock('@/components/data/Pagination',   () => ({ Pagination:   () => <div /> }))
vi.mock('@/components/data/TableSkeleton',() => ({ TableSkeleton:() => <div data-testid="table-skeleton" /> }))

vi.mock('@/components/ui/Toast', () => ({
  toast: vi.fn(),
  ToastContainer: () => <div data-testid="toast-container" />,
}))

import { FeedListPage } from '@/pages/FeedListPage'

// ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Toggle ───────────────────────────────────────────────────────

describe('FeedListPage — toggle button', () => {
  it('renders a toggle button for each feed row', () => {
    render(<FeedListPage />)
    expect(screen.getByTestId('toggle-feed-f1')).toBeTruthy()
    expect(screen.getByTestId('toggle-feed-f2')).toBeTruthy()
    expect(screen.getByTestId('toggle-feed-f3')).toBeTruthy()
  })

  it('calls toggleFeed.mutate with correct args when clicked', () => {
    render(<FeedListPage />)
    fireEvent.click(screen.getByTestId('toggle-feed-f1'))
    expect(mockToggle).toHaveBeenCalledWith(
      { feedId: 'f1', enabled: false },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    )
  })

  it('toggles disabled feed to enabled (enabled: !false = true)', () => {
    render(<FeedListPage />)
    fireEvent.click(screen.getByTestId('toggle-feed-f3'))
    expect(mockToggle).toHaveBeenCalledWith(
      { feedId: 'f3', enabled: true },
      expect.any(Object),
    )
  })
})

// ─── Delete ──────────────────────────────────────────────────────

describe('FeedListPage — delete button', () => {
  it('renders a delete button for each feed row', () => {
    render(<FeedListPage />)
    expect(screen.getByTestId('delete-feed-f1')).toBeTruthy()
    expect(screen.getByTestId('delete-feed-f2')).toBeTruthy()
    expect(screen.getByTestId('delete-feed-f3')).toBeTruthy()
  })

  it('opens confirmation modal when delete is clicked', () => {
    render(<FeedListPage />)
    expect(screen.queryByTestId('delete-feed-modal')).toBeNull()
    fireEvent.click(screen.getByTestId('delete-feed-f1'))
    expect(screen.getByTestId('delete-feed-modal')).toBeTruthy()
  })

  it('does NOT call deleteFeed.mutate when cancel is clicked', () => {
    render(<FeedListPage />)
    fireEvent.click(screen.getByTestId('delete-feed-f1'))
    fireEvent.click(screen.getByTestId('delete-cancel'))
    expect(mockDelete).not.toHaveBeenCalled()
    expect(screen.queryByTestId('delete-feed-modal')).toBeNull()
  })

  it('calls deleteFeed.mutate with feedId when confirmed', () => {
    render(<FeedListPage />)
    fireEvent.click(screen.getByTestId('delete-feed-f2'))
    fireEvent.click(screen.getByTestId('delete-confirm'))
    expect(mockDelete).toHaveBeenCalledWith('f2', expect.any(Object))
  })
})

// ─── Force fetch ─────────────────────────────────────────────────

describe('FeedListPage — force fetch button', () => {
  it('renders a force-fetch button for each feed row', () => {
    render(<FeedListPage />)
    expect(screen.getByTestId('force-fetch-f1')).toBeTruthy()
    expect(screen.getByTestId('force-fetch-f2')).toBeTruthy()
    expect(screen.getByTestId('force-fetch-f3')).toBeTruthy()
  })

  it('calls forceFetch.mutate with feedId when clicked', () => {
    render(<FeedListPage />)
    fireEvent.click(screen.getByTestId('force-fetch-f1'))
    expect(mockFetch).toHaveBeenCalledWith('f1', expect.any(Object))
  })

  it('disables force-fetch button after click (cooldown)', () => {
    render(<FeedListPage />)
    const btn = screen.getByTestId('force-fetch-f1') as HTMLButtonElement
    fireEvent.click(btn)
    expect(btn.disabled).toBe(true)
  })
})

// ─── Retry ───────────────────────────────────────────────────────

describe('FeedListPage — retry button', () => {
  it('shows retry button only for feeds with consecutiveFailures > 0', () => {
    render(<FeedListPage />)
    expect(screen.getByTestId('retry-feed-f2')).toBeTruthy()
    expect(screen.queryByTestId('retry-feed-f1')).toBeNull()
    expect(screen.queryByTestId('retry-feed-f3')).toBeNull()
  })

  it('calls retryFeed.mutate with feedId when clicked', () => {
    render(<FeedListPage />)
    fireEvent.click(screen.getByTestId('retry-feed-f2'))
    expect(mockRetry).toHaveBeenCalledWith('f2', expect.any(Object))
  })
})

// ─── Disabled feed icon ──────────────────────────────────────────

describe('FeedListPage — disabled feed toggle icon', () => {
  it('disabled feed toggle button is present with correct testid', () => {
    render(<FeedListPage />)
    // f3 is enabled:false — its toggle button must still be present
    const btn = screen.getByTestId('toggle-feed-f3')
    expect(btn).toBeTruthy()
    // title should indicate enabling (because it is currently disabled)
    expect(btn.getAttribute('title')).toBe('Enable feed')
  })
})
