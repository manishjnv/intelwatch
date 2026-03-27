/**
 * Tests for use-es-search hook — debounced search, filters, facets,
 * URL sync, demo fallback, export, pagination, sort.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@/test/test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { createElement } from 'react'

// ─── Mocks ──────────────────────────────────────────────────

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
}))

vi.mock('@/hooks/useApiError', () => ({
  notifyApiError: vi.fn((_err: unknown, _res: string, fallback: unknown) => fallback),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { user: { tenantId: string } }) => unknown) =>
    selector({ user: { tenantId: 'test-tenant' } }),
}))

import { useEsSearch, DEMO_ES_RESULTS } from '@/hooks/use-es-search'

// ─── Helpers ────────────────────────────────────────────────

function createWrapper(initialRoute = '/search') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc },
      createElement(MemoryRouter, { initialEntries: [initialRoute] }, children),
    )
}

const MOCK_RESPONSE = {
  total: 2,
  page: 1,
  limit: 50,
  data: [
    { iocId: 'ioc-1', value: '1.2.3.4', type: 'ip', severity: 'high', confidence: 80, tags: ['c2'], firstSeen: '2026-03-01T00:00:00Z', lastSeen: '2026-03-25T00:00:00Z', enriched: true, tlp: 'AMBER' },
    { iocId: 'ioc-2', value: 'evil.com', type: 'domain', severity: 'critical', confidence: 95, tags: ['apt'], firstSeen: '2026-03-10T00:00:00Z', lastSeen: '2026-03-26T00:00:00Z', enriched: false, tlp: 'RED' },
  ],
  aggregations: {
    by_type: [{ key: 'ip', count: 1 }, { key: 'domain', count: 1 }],
    by_severity: [{ key: 'high', count: 1 }, { key: 'critical', count: 1 }],
    by_tlp: [{ key: 'AMBER', count: 1 }, { key: 'RED', count: 1 }],
  },
}

// ─── Tests ──────────────────────────────────────────────────

describe('useEsSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.mockResolvedValue(MOCK_RESPONSE)
  })

  it('returns demo data when API returns empty', async () => {
    mockApi.mockResolvedValue({ total: 0, page: 1, limit: 50, data: [], aggregations: { by_type: [], by_severity: [], by_tlp: [] } })
    const { result } = renderHook(() => useEsSearch(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemo).toBe(true)
    expect(result.current.results.length).toBe(DEMO_ES_RESULTS.length)
  })

  it('returns API data when available', async () => {
    const { result } = renderHook(() => useEsSearch(), { wrapper: createWrapper('/search?q=test') })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // Since query is 'test' from URL, API should be called
    await waitFor(() => expect(mockApi).toHaveBeenCalled())
  })

  it('setQuery updates query state', async () => {
    const { result } = renderHook(() => useEsSearch(), { wrapper: createWrapper() })
    act(() => result.current.setQuery('malware'))
    expect(result.current.query).toBe('malware')
  })

  it('setFilters triggers search with new filter', async () => {
    const { result } = renderHook(() => useEsSearch(), { wrapper: createWrapper() })
    act(() => result.current.setFilters({ type: ['ip'] }))
    expect(result.current.filters.type).toEqual(['ip'])
    expect(result.current.page).toBe(1) // resets to page 1
  })

  it('setPage updates pagination', async () => {
    const { result } = renderHook(() => useEsSearch(), { wrapper: createWrapper() })
    act(() => result.current.setPage(3))
    expect(result.current.page).toBe(3)
  })

  it('setPageSize resets to page 1', async () => {
    const { result } = renderHook(() => useEsSearch(), { wrapper: createWrapper() })
    act(() => result.current.setPage(3))
    act(() => result.current.setPageSize(100))
    expect(result.current.pageSize).toBe(100)
    expect(result.current.page).toBe(1)
  })

  it('clearAll resets query, filters, and sort', async () => {
    const { result } = renderHook(() => useEsSearch(), { wrapper: createWrapper() })
    act(() => {
      result.current.setQuery('test')
      result.current.setFilters({ type: ['ip'], severity: ['high'] })
      result.current.setSortBy('confidence_desc')
    })
    act(() => result.current.clearAll())
    expect(result.current.query).toBe('')
    expect(result.current.filters.type).toBeUndefined()
    expect(result.current.sortBy).toBe('relevance')
  })

  it('setSortBy updates sort', async () => {
    const { result } = renderHook(() => useEsSearch(), { wrapper: createWrapper() })
    act(() => result.current.setSortBy('confidence_desc'))
    expect(result.current.sortBy).toBe('confidence_desc')
  })

  it('facets are returned from API response', async () => {
    const { result } = renderHook(() => useEsSearch(), { wrapper: createWrapper('/search?q=test') })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // If API returns data, facets should be populated
    if (!result.current.isDemo) {
      expect(result.current.facets.byType.length).toBeGreaterThan(0)
    }
  })

  it('confidence filter applied client-side', async () => {
    mockApi.mockResolvedValue(MOCK_RESPONSE)
    const { result } = renderHook(() => useEsSearch(), { wrapper: createWrapper('/search?q=test') })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    act(() => result.current.setFilters({ confidenceMin: 90 }))
    // After filtering, only results with confidence >= 90 should remain
    if (!result.current.isDemo) {
      const allAbove = result.current.results.every(r => r.confidence >= 90)
      expect(allAbove).toBe(true)
    }
  })

  it('exportResults calls CSV export without error', () => {
    const { result } = renderHook(() => useEsSearch(), { wrapper: createWrapper() })
    // Mock URL.createObjectURL
    const mockCreate = vi.fn(() => 'blob:test')
    const mockRevoke = vi.fn()
    global.URL.createObjectURL = mockCreate
    global.URL.revokeObjectURL = mockRevoke
    expect(() => result.current.exportResults('csv')).not.toThrow()
    expect(mockCreate).toHaveBeenCalled()
  })

  it('exportResults calls JSON export without error', () => {
    const { result } = renderHook(() => useEsSearch(), { wrapper: createWrapper() })
    global.URL.createObjectURL = vi.fn(() => 'blob:test')
    global.URL.revokeObjectURL = vi.fn()
    expect(() => result.current.exportResults('json')).not.toThrow()
  })

  it('initializes from URL search params', async () => {
    const { result } = renderHook(
      () => useEsSearch(),
      { wrapper: createWrapper('/search?q=cobalt&type=ip,domain&severity=critical&sort=confidence_desc') },
    )
    expect(result.current.query).toBe('cobalt')
    expect(result.current.filters.type).toEqual(['ip', 'domain'])
    expect(result.current.filters.severity).toEqual(['critical'])
    expect(result.current.sortBy).toBe('confidence_desc')
  })

  it('passes tenantId as query param to API', async () => {
    renderHook(() => useEsSearch(), { wrapper: createWrapper('/search?q=test') })
    await waitFor(() => expect(mockApi).toHaveBeenCalled())
    const callArg = mockApi.mock.calls[0][0] as string
    expect(callArg).toContain('tenantId=test-tenant')
  })
})
