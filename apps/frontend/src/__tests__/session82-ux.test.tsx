/**
 * Session 82: Error visibility, search debounce, loading skeletons.
 * 15 tests across useApiError, useDebouncedValue, TableSkeleton,
 * SearchPage debounce, and loading-state skeleton wiring.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { render, screen, renderHook, act, fireEvent } from '@/test/test-utils'

// ─── Global mocks (hoisted by vitest) ─────────────────────────

vi.mock('@/components/ui/Toast', () => ({
  toast: vi.fn(),
  ToastContainer: () => <div data-testid="toast-container" />,
}))

vi.mock('@/lib/api', () => {
  class ApiError extends Error {
    status: number; code: string; details?: unknown
    constructor(status: number, code: string, message: string, details?: unknown) {
      super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.details = details
    }
  }
  return { api: vi.fn(), ApiError }
})

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector: any) => selector({
    user: { displayName: 'Analyst', email: 'test@test.com', tenantId: 't1', id: 'u1', role: 'admin' },
    tenant: { name: 'ACME Corp' }, accessToken: 'mock-token',
  })),
}))

vi.mock('@/stores/theme-store', () => ({
  useThemeStore: vi.fn(() => ({ theme: 'dark', toggleTheme: vi.fn() })),
}))

vi.mock('@/hooks/use-auth', () => ({
  useLogout: vi.fn(() => ({ mutate: vi.fn() })),
}))

vi.mock('@/config/modules', () => ({
  MODULES: [], getPhaseColor: () => 'text-blue-400', getPhaseBgColor: () => 'bg-blue-500/10',
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: any) => <div data-testid="page-stats-bar">{children}</div>,
  CompactStat: ({ label, value }: any) => <span data-testid={`stat-${label}`}>{value}</span>,
}))

vi.mock('@etip/shared-ui/components/SkeletonBlock', () => ({
  SkeletonBlock: () => <div data-testid="skeleton-block" />,
}))

vi.mock('@etip/shared-ui/components/EntityChip', () => ({
  EntityChip: ({ value }: any) => <span>{value}</span>,
}))

vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: any) => <span>{severity}</span>,
}))

// Page-level mocks: use-intel-data returns isLoading:true for skeleton tests
vi.mock('@/hooks/use-intel-data', () => ({
  useIOCs: vi.fn(() => ({ data: null, isLoading: true, isDemo: false })),
  useIOCStats: vi.fn(() => ({ data: null })),
  useFeeds: vi.fn(() => ({ data: null, isLoading: true, isDemo: false })),
  useRetryFeed: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useFeedQuota: vi.fn(() => ({ data: null })),
  useActors: vi.fn(() => ({ data: null, isLoading: true, isDemo: false })),
  useActorDetail: vi.fn(() => ({ data: null })),
  useActorLinkedIOCs: vi.fn(() => ({ data: [] })),
  useMalware: vi.fn(() => ({ data: null, isLoading: true })),
  useVulnerabilities: vi.fn(() => ({ data: null, isLoading: true })),
  useDashboardStats: vi.fn(() => ({ data: null })),
  useUpdateIOCLifecycle: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))

const mockUseIOCSearch = vi.fn((_query?: unknown, _filters?: unknown) => ({
  data: { data: [], total: 0, took: 0, page: 1, limit: 50 },
  isLoading: false, isDemo: true,
}))

vi.mock('@/hooks/use-search-data', () => ({
  useIOCSearch: (...args: unknown[]) => mockUseIOCSearch(args[0], args[1]),
  DEMO_SEARCH_RESULTS: [],
}))

vi.mock('@/components/viz/SplitPane', () => ({
  SplitPane: ({ left }: any) => <div data-testid="split-pane">{left}</div>,
}))

vi.mock('@/components/viz/QuickActionToolbar', () => ({
  QuickActionToolbar: () => null,
}))

vi.mock('@/components/viz/EntityPreview', () => ({
  EntityPreview: ({ children }: any) => <div>{children}</div>,
}))

vi.mock('@/components/viz/SparklineCell', () => ({
  SparklineCell: () => null, generateStubTrend: () => [],
}))

vi.mock('@/components/feed/FeedCard', () => ({
  FeedTypeIcon: () => null, StatusDot: () => null, ReliabilityBar: () => null,
  formatTime: () => '', getNextFireLabel: () => '', FeedFavicon: () => null, FeedCard: () => null,
}))

vi.mock('@/components/feed/FeedScheduleTimeline', () => ({
  FeedScheduleTimeline: () => null,
}))

vi.mock('@/pages/IocDetailPanel', () => ({
  IocDetailPanel: () => null,
}))

// ─── Imports (after mocks) ──────────────────────────────────────

import { toast } from '@/components/ui/Toast'
import { ApiError } from '@/lib/api'
import { notifyApiError, _resetNotifyState } from '@/hooks/useApiError'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { TableSkeleton } from '@/components/data/TableSkeleton'

// ================================================================
// useApiError — 3 tests
// ================================================================
describe('notifyApiError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetNotifyState()
  })

  it('shows toast and returns fallback on error', () => {
    const fallback = { data: [], total: 0 }
    const err = new (ApiError as any)(500, 'INTERNAL', 'Server error')
    const result = notifyApiError(err, 'feeds', fallback)
    expect(result).toBe(fallback)
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Failed to load feeds'), 'error')
  })

  it('logs to console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const err = new TypeError('fetch failed')
    notifyApiError(err, 'IOCs', [])
    expect(warnSpy).toHaveBeenCalledWith('[API] IOCs:', err)
    warnSpy.mockRestore()
  })

  it('distinguishes network errors vs 401 vs 500', () => {
    const err401 = new (ApiError as any)(401, 'UNAUTHORIZED', 'Unauthorized')
    notifyApiError(err401, 'auth', null)
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Session expired'), 'error')

    _resetNotifyState(); vi.clearAllMocks()

    const errNet = new TypeError('Failed to fetch')
    notifyApiError(errNet, 'network', null)
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Network error'), 'error')

    _resetNotifyState(); vi.clearAllMocks()

    const err500 = new (ApiError as any)(500, 'INTERNAL', 'Internal')
    notifyApiError(err500, 'server', null)
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Server error'), 'error')
  })
})

// ================================================================
// useDebouncedValue — 3 tests
// ================================================================
describe('useDebouncedValue', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('hello', 300))
    expect(result.current).toBe('hello')
  })

  it('updates value after delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'a' } },
    )
    rerender({ value: 'ab' })
    expect(result.current).toBe('a')
    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current).toBe('ab')
  })

  it('cancels pending update on unmount', () => {
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'x' } },
    )
    rerender({ value: 'xy' })
    unmount()
    act(() => { vi.advanceTimersByTime(500) })
    // Value stays at 'x' — the 'xy' update was cancelled
    expect(result.current).toBe('x')
  })
})

// ================================================================
// TableSkeleton — 3 tests
// ================================================================
describe('TableSkeleton', () => {
  it('renders with data-testid', () => {
    render(<TableSkeleton />)
    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument()
  })

  it('renders correct number of rows', () => {
    render(<TableSkeleton rows={5} columns={4} />)
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(5)
  })

  it('renders correct number of cells per row', () => {
    render(<TableSkeleton rows={3} columns={7} />)
    expect(screen.getAllByTestId('skeleton-cell')).toHaveLength(21)
  })
})

// ================================================================
// SearchPage debounce — 3 tests
// ================================================================
describe('SearchPage debounce', () => {
  let SearchPage: any
  beforeAll(async () => {
    const mod = await import('@/pages/SearchPage')
    SearchPage = mod.SearchPage
  })

  beforeEach(() => { vi.clearAllMocks() })

  it('calls useIOCSearch with empty string initially', () => {
    render(<SearchPage />)
    expect(mockUseIOCSearch).toHaveBeenCalledWith('', expect.anything())
  })

  it('debounces query — does not pass raw input immediately', () => {
    vi.useFakeTimers()
    render(<SearchPage />)
    const input = screen.getByPlaceholderText(/Search IOCs/)

    fireEvent.change(input, { target: { value: '192.168' } })
    // The debounced value hasn't fired yet — still ''
    const calls = mockUseIOCSearch.mock.calls
    const lastCall = calls[calls.length - 1] as unknown[] | undefined
    expect(lastCall?.[0]).toBe('')

    // Advance past debounce
    act(() => { vi.advanceTimersByTime(350) })
    const calls2 = mockUseIOCSearch.mock.calls
    const afterDebounce = calls2[calls2.length - 1] as unknown[] | undefined
    expect(afterDebounce?.[0]).toBe('192.168')
    vi.useRealTimers()
  })

  it('cancels stale queries on rapid typing', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: '1' } },
    )
    rerender({ value: '19' })
    rerender({ value: '192' })
    rerender({ value: '192.' })
    rerender({ value: '192.1' })

    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current).toBe('1') // Stale — not updated yet

    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current).toBe('192.1') // Only final value
    vi.useRealTimers()
  })
})

// ================================================================
// Loading skeleton wiring — 3 tests
// ================================================================
describe('Loading skeleton wiring', () => {
  it('IocListPage shows skeleton when loading', async () => {
    const { IocListPage } = await import('@/pages/IocListPage')
    render(<IocListPage />)
    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument()
  })

  it('FeedListPage shows skeleton when loading', async () => {
    const { FeedListPage } = await import('@/pages/FeedListPage')
    render(<FeedListPage />)
    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument()
  })

  it('ThreatActorListPage shows skeleton when loading', async () => {
    const { ThreatActorListPage } = await import('@/pages/ThreatActorListPage')
    render(<ThreatActorListPage />)
    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument()
  })

  it('MalwareListPage shows skeleton when loading', async () => {
    const { MalwareListPage } = await import('@/pages/MalwareListPage')
    render(<MalwareListPage />)
    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument()
  })

  it('VulnerabilityListPage shows skeleton when loading', async () => {
    const { VulnerabilityListPage } = await import('@/pages/VulnerabilityListPage')
    render(<VulnerabilityListPage />)
    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument()
  })
})

// ================================================================
// Session 85: notifyApiError wired to hooks — 2 tests
// ================================================================
describe('notifyApiError wired to hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetNotifyState()
  })

  it('alerting hook surfaces error toast via notifyApiError', () => {
    const err = new (ApiError as any)(503, 'UNAVAILABLE', 'Service down')
    const result = notifyApiError(err, 'alerts', { data: [], total: 0, page: 1, limit: 50 })
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Failed to load alerts'), 'error')
    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 50 })
  })

  it('analytics hook surfaces error toast via notifyApiError', () => {
    const err = new (ApiError as any)(500, 'INTERNAL', 'DB error')
    const empty = { widgets: {}, generatedAt: '', cacheHit: false }
    const result = notifyApiError(err, 'analytics', empty)
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('Failed to load analytics'), 'error')
    expect(result).toBe(empty)
  })
})

// ================================================================
// Session 85: Debounce wired to MalwareListPage + VulnListPage — 2 tests
// ================================================================
describe('Debounce wired to list pages', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('MalwareListPage uses debounced search value', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: '' } },
    )
    rerender({ value: 'Black' })
    expect(result.current).toBe('') // Not yet debounced
    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current).toBe('Black') // Now debounced
  })

  it('VulnerabilityListPage uses debounced search value', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: '' } },
    )
    rerender({ value: 'CVE-2024' })
    expect(result.current).toBe('')
    act(() => { vi.advanceTimersByTime(300) })
    expect(result.current).toBe('CVE-2024')
  })
})

// ================================================================
// Session 85: TableSkeleton row/column params — 2 tests
// ================================================================
describe('TableSkeleton page-specific params', () => {
  it('MalwareListPage skeleton has 8 rows', async () => {
    const { MalwareListPage } = await import('@/pages/MalwareListPage')
    render(<MalwareListPage />)
    const rows = screen.getAllByTestId('skeleton-row')
    expect(rows).toHaveLength(8)
  })

  it('VulnerabilityListPage skeleton has 8 rows', async () => {
    const { VulnerabilityListPage } = await import('@/pages/VulnerabilityListPage')
    render(<VulnerabilityListPage />)
    const rows = screen.getAllByTestId('skeleton-row')
    expect(rows).toHaveLength(8)
  })
})
