/**
 * Tests for use-global-search-results — the ⌘K GlobalSearch data fetch.
 * Verifies it calls the real /search/iocs endpoint via api() (not raw fetch),
 * maps the ES envelope to shared-ui's SearchResult, gates on query length,
 * and reports errors via notifyApiError instead of swallowing them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@/test/test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
}))

const mockNotifyApiError = vi.fn((_err: unknown, _res: string, fallback: unknown) => fallback)
vi.mock('@/hooks/useApiError', () => ({
  notifyApiError: (err: unknown, resource: string, fallback: unknown) => mockNotifyApiError(err, resource, fallback),
}))

import { useGlobalSearchResults } from '@/hooks/use-global-search-results'

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

const MOCK_RESPONSE = {
  total: 2,
  page: 1,
  limit: 20,
  data: [
    { iocId: 'ioc-1', value: '1.2.3.4', type: 'ip', severity: 'high' },
    { iocId: 'ioc-2', value: 'evil.com', type: 'domain', severity: 'critical' },
  ],
}

describe('useGlobalSearchResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls api() with /search/iocs?q=...&limit=20, not raw fetch', async () => {
    mockApi.mockResolvedValue(MOCK_RESPONSE)
    renderHook(() => useGlobalSearchResults('1.2.3.4'), { wrapper: createWrapper() })
    await waitFor(() => expect(mockApi).toHaveBeenCalled())
    expect(mockApi).toHaveBeenCalledWith('/search/iocs?q=1.2.3.4&limit=20')
  })

  it('maps a 2-doc response to 2 SearchResult objects with category iocs and id = iocId', async () => {
    mockApi.mockResolvedValue(MOCK_RESPONSE)
    const { result } = renderHook(() => useGlobalSearchResults('evil'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.data).toHaveLength(2))
    expect(result.current.data).toEqual([
      { id: 'ioc-1', type: 'ip', value: '1.2.3.4', severity: 'high', category: 'iocs' },
      { id: 'ioc-2', type: 'domain', value: 'evil.com', severity: 'critical', category: 'iocs' },
    ])
  })

  it('does not call api() when query is shorter than 2 chars', async () => {
    renderHook(() => useGlobalSearchResults('a'), { wrapper: createWrapper() })
    await new Promise(r => setTimeout(r, 10))
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('calls notifyApiError and returns [] when api() rejects', async () => {
    mockApi.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useGlobalSearchResults('failquery'), { wrapper: createWrapper() })
    await waitFor(() => expect(mockNotifyApiError).toHaveBeenCalled())
    await waitFor(() => expect(result.current.data).toEqual([]))
  })
})
