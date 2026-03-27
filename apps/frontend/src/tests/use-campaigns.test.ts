import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Mock the api module
const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({ api: (...args: any[]) => mockApi(...args) }))
vi.mock('@/hooks/useApiError', () => ({ notifyApiError: (_e: any, _r: string, f: any) => f }))

import { useCampaigns, useCampaignsForIoc } from '@/hooks/use-campaigns'

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
}

describe('use-campaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('useCampaigns fetches campaign list', async () => {
    const data = { data: [{ id: 'c1', name: 'Test Campaign' }], total: 1 }
    mockApi.mockResolvedValueOnce(data)
    const { result } = renderHook(() => useCampaigns(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockApi).toHaveBeenCalledWith(expect.stringContaining('/ioc/campaigns'))
  })

  it('useCampaigns returns demo fallback on API failure', async () => {
    mockApi.mockRejectedValueOnce(new Error('Network error'))
    const { result } = renderHook(() => useCampaigns(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    // notifyApiError returns the demo fallback, so data is present
    expect(result.current.data?.data.length).toBeGreaterThan(0)
  })

  it('useCampaignsForIoc fetches campaigns for IOC via pivot', async () => {
    mockApi.mockResolvedValueOnce({ campaigns: [{ id: 'c1', name: 'Camp1' }] })
    const { result } = renderHook(() => useCampaignsForIoc('ioc-123'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockApi).toHaveBeenCalledWith(expect.stringContaining('/iocs/ioc-123/pivot'))
  })

  it('useCampaignsForIoc is disabled when iocId is null', () => {
    const { result } = renderHook(() => useCampaignsForIoc(null), { wrapper: createWrapper() })
    expect(result.current.data).toBeUndefined()
  })

  it('useCampaigns loading state during fetch', () => {
    mockApi.mockReturnValue(new Promise(() => {})) // never resolves
    const { result } = renderHook(() => useCampaigns(), { wrapper: createWrapper() })
    expect(result.current.isLoading).toBe(true)
  })
})
