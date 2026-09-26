/**
 * @module __tests__/use-sessions-no-demo.test
 * @description useSessions() must surface the error, never demo rows, on API failure.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@/test/test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
}))

import { useSessions } from '@/hooks/use-sessions'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useSessions (no demo fallback)', () => {
  it('surfaces the error instead of returning demo sessions', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useSessions(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
  })
})
