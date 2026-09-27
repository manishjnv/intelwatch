/**
 * @module __tests__/rca45-phase5-customization
 * @description RCA #45 double-unwrap fixes in use-phase5-data.ts customization hooks
 * (module toggles, AI plan tiers, subtask mappings, recommended models, cost estimate,
 * BYOK Anthropic key). Each was typed api<{data:...}> when api() already unwraps that
 * envelope, so `.data` reads were always undefined and these always showed demo data.
 * useAIConfigs/useRiskWeights/useNotificationChannels are intentionally NOT covered here —
 * they are BLOCKED (wrong/mismatched backend paths, not a simple unwrap fix; see hook
 * comments in use-phase5-data.ts).
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

import {
  useModuleToggles, usePlanTiers, useSubtaskMappings, useRecommendedModels,
  useCostEstimate, useAnthropicKeyStatus,
} from '@/hooks/use-phase5-data'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => { mockApi.mockReset() })

describe('useModuleToggles — real backend shape (single-wrapped {data,total})', () => {
  it('real module list comes through, not demo', async () => {
    mockApi.mockResolvedValueOnce({
      data: [{ id: 'mod-x', name: 'Real Module', description: 'd', enabled: true, icon: 'Zap', dependencies: [], category: 'Pipeline' }],
      total: 1,
    })
    const { result } = renderHook(() => useModuleToggles(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemo).toBe(false)
    expect(result.current.data?.data[0]?.name).toBe('Real Module')
  })
})

describe('usePlanTiers / useSubtaskMappings / useRecommendedModels — apiList normalisation', () => {
  it('usePlanTiers: real plans come through', async () => {
    mockApi.mockResolvedValueOnce({ data: [{ plan: 'starter', displayName: 'Starter', costPer1KArticlesUsd: '1', accuracyPct: '80%', isRecommended: false }], total: 1 })
    const { result } = renderHook(() => usePlanTiers(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemo).toBe(false)
    expect(result.current.data?.data[0]?.plan).toBe('starter')
  })

  it('useSubtaskMappings: real mappings come through', async () => {
    mockApi.mockResolvedValueOnce({ data: [{ id: 's1', tenantId: 't1', subtask: 'ioc_triage', stage: 1, model: 'claude-haiku-4-5', fallbackModel: 'claude-haiku-4-5', isRecommended: true, updatedAt: '2026-01-01' }], total: 1 })
    const { result } = renderHook(() => useSubtaskMappings(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemo).toBe(false)
    expect(result.current.data?.data[0]?.subtask).toBe('ioc_triage')
  })

  it('useRecommendedModels: real recommendations come through', async () => {
    mockApi.mockResolvedValueOnce({ data: [{ subtask: 'ioc_triage', stage: 1, recommendedModel: 'claude-haiku-4-5', fallbackModel: 'claude-haiku-4-5', description: 'd' }], total: 1 })
    const { result } = renderHook(() => useRecommendedModels(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemo).toBe(false)
    expect(result.current.data?.data[0]?.subtask).toBe('ioc_triage')
  })
})

describe('useCostEstimate — real backend shape (single-wrapped {data: estimate}, fields top-level)', () => {
  it('totalMonthlyUsd comes through directly, not nested under .data', async () => {
    mockApi.mockResolvedValueOnce({ totalMonthlyUsd: 123.45, breakdown: {} })
    const { result } = renderHook(() => useCostEstimate('professional', 1000), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemo).toBe(false)
    expect(result.current.data?.totalMonthlyUsd).toBe(123.45)
  })
})

describe('useAnthropicKeyStatus — real backend shape (single-wrapped {data: status})', () => {
  it('hasKey/maskedKey come through directly, not nested under .data', async () => {
    mockApi.mockResolvedValueOnce({ tenantId: 'tenant-1', hasKey: true, maskedKey: 'sk-ant-***abcd' })
    const { result } = renderHook(() => useAnthropicKeyStatus(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isDemo).toBe(false)
    expect(result.current.data?.hasKey).toBe(true)
    expect(result.current.data?.maskedKey).toBe('sk-ant-***abcd')
  })
})
