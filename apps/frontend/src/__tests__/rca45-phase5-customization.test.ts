/**
 * @module __tests__/rca45-phase5-customization
 * @description RCA #45 double-unwrap fixes in use-phase5-data.ts customization hooks
 * (module toggles, AI plan tiers, subtask mappings, recommended models, cost estimate,
 * BYOK Anthropic key). Each was typed api<{data:...}> when api() already unwraps that
 * envelope, so `.data` reads were always undefined and these always showed demo data.
 *
 * Also covers the S173 PR2 rewiring of the Risk Weights / Notifications hooks off their
 * BLOCKED placeholder paths onto the real customization-service routes: GET/PUT
 * /customization/risk/profiles/:type, POST /customization/risk/presets/apply, GET
 * /customization/notifications (single NotificationPreferences object synthesized into the
 * 3 fixed channels), PUT /customization/notifications/channels/:channel.
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
  useCostEstimate, useAnthropicKeyStatus, useToggleModule,
  useRiskWeights, useUpdateRiskWeight, useResetRiskWeights,
  useNotificationChannels, useUpdateNotificationChannel,
} from '@/hooks/use-phase5-data'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => { mockApi.mockReset() })

describe('useModuleToggles — real backend shape (single-wrapped {data,total})', () => {
  it('real module list comes through, adapted from the ModuleToggleStore shape', async () => {
    mockApi.mockResolvedValueOnce({
      data: [{ id: 'mod-x', tenantId: 't1', module: 'hunting', enabled: true, featureFlags: {}, updatedAt: '2026-01-01', updatedBy: 'u1' }],
      total: 1,
    })
    const { result } = renderHook(() => useModuleToggles(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isError).toBe(false)
    expect(result.current.data?.data[0]?.name).toBe('hunting')
    expect(result.current.data?.data[0]?.enabled).toBe(true)
  })

  // Backend: PUT /customization/modules/:module (module NAME, z.enum) — not PATCH by toggle UUID.
  it('toggling round-trips: the id handed to the page toggles via PUT /customization/modules/<module name>', async () => {
    mockApi.mockResolvedValueOnce({
      data: [{ id: 'uuid-1', tenantId: 't1', module: 'hunting', enabled: true, featureFlags: {}, updatedAt: '2026-01-01', updatedBy: 'u1' }],
      total: 1,
    })
    const { result } = renderHook(() => ({ list: useModuleToggles(), toggle: useToggleModule() }), { wrapper })
    await waitFor(() => expect(result.current.list.isLoading).toBe(false))
    const mod = result.current.list.data!.data[0]!

    mockApi.mockResolvedValueOnce({ id: 'uuid-1', module: 'hunting', enabled: false })
    result.current.toggle.mutate({ id: mod.id, enabled: false })

    await waitFor(() => expect(mockApi).toHaveBeenCalledWith(
      '/customization/modules/hunting', expect.objectContaining({ method: 'PUT', body: { enabled: false } }),
    ))
  })
})

describe('usePlanTiers / useSubtaskMappings / useRecommendedModels — apiList normalisation', () => {
  it('usePlanTiers: real plans come through', async () => {
    mockApi.mockResolvedValueOnce({ data: [{ plan: 'starter', displayName: 'Starter', costPer1KArticlesUsd: '1', accuracyPct: '80%', isRecommended: false }], total: 1 })
    const { result } = renderHook(() => usePlanTiers(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.data[0]?.plan).toBe('starter')
  })

  it('useSubtaskMappings: real mappings come through', async () => {
    mockApi.mockResolvedValueOnce({ data: [{ id: 's1', tenantId: 't1', subtask: 'ioc_triage', stage: 1, model: 'claude-haiku-4-5', fallbackModel: 'claude-haiku-4-5', isRecommended: true, updatedAt: '2026-01-01' }], total: 1 })
    const { result } = renderHook(() => useSubtaskMappings(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.data[0]?.subtask).toBe('ioc_triage')
  })

  it('useRecommendedModels: real recommendations come through', async () => {
    mockApi.mockResolvedValueOnce({ data: [{ subtask: 'ioc_triage', stage: 1, recommendedModel: 'claude-haiku-4-5', fallbackModel: 'claude-haiku-4-5', description: 'd' }], total: 1 })
    const { result } = renderHook(() => useRecommendedModels(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.data[0]?.subtask).toBe('ioc_triage')
  })
})

describe('useCostEstimate — real backend shape (single-wrapped {data: estimate}, fields top-level)', () => {
  it('totalMonthlyUsd comes through directly, not nested under .data', async () => {
    mockApi.mockResolvedValueOnce({ totalMonthlyUsd: 123.45, breakdown: {} })
    const { result } = renderHook(() => useCostEstimate('professional', 1000), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.totalMonthlyUsd).toBe(123.45)
  })
})

describe('useAnthropicKeyStatus — real backend shape (single-wrapped {data: status})', () => {
  it('hasKey/maskedKey come through directly, not nested under .data', async () => {
    mockApi.mockResolvedValueOnce({ tenantId: 'tenant-1', hasKey: true, maskedKey: 'sk-ant-***abcd' })
    const { result } = renderHook(() => useAnthropicKeyStatus(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.hasKey).toBe(true)
    expect(result.current.data?.maskedKey).toBe('sk-ant-***abcd')
  })
})

describe('useRiskWeights — GET /customization/risk/profiles/:type', () => {
  it('fetches the weight profile for the given IOC type', async () => {
    mockApi.mockResolvedValueOnce({
      id: 'rp-1', tenantId: 'default', iocType: 'domain',
      weights: { source_reliability: 0.25, freshness: 0.2, corroboration: 0.2, specificity: 0.2, context: 0.15 },
      decayRate: 0.05, updatedAt: '2026-01-01', updatedBy: 'system',
    })
    const { result } = renderHook(() => useRiskWeights('domain'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockApi).toHaveBeenCalledWith('/customization/risk/profiles/domain')
    expect(result.current.data?.iocType).toBe('domain')
    expect(result.current.data?.weights.source_reliability).toBe(0.25)
  })
})

describe('useUpdateRiskWeight — PUT /customization/risk/profiles/:type with the full weights map', () => {
  it('sends the full weights map (not a single-factor patch)', async () => {
    const weights = { source_reliability: 0.3, freshness: 0.2, corroboration: 0.2, specificity: 0.2, context: 0.1 }
    mockApi.mockResolvedValueOnce({ id: 'rp-1', tenantId: 'default', iocType: 'ip', weights, decayRate: 0.05, updatedAt: '2026-01-01', updatedBy: 'u1' })
    const { result } = renderHook(() => useUpdateRiskWeight(), { wrapper })
    result.current.mutate({ iocType: 'ip', weights })
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith(
      '/customization/risk/profiles/ip',
      expect.objectContaining({ method: 'PUT', body: { weights, decayRate: undefined } }),
    ))
  })
})

describe('useResetRiskWeights — POST /customization/risk/presets/apply', () => {
  it('applies the balanced preset by default', async () => {
    mockApi.mockResolvedValueOnce([])
    const { result } = renderHook(() => useResetRiskWeights(), { wrapper })
    result.current.mutate(undefined)
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith(
      '/customization/risk/presets/apply',
      expect.objectContaining({ method: 'POST', body: { preset: 'balanced' } }),
    ))
  })
})

describe('useNotificationChannels — synthesizes the 3 fixed channels from the single NotificationPreferences object', () => {
  it('GET /customization/notifications returns exactly email/webhook/in_app', async () => {
    mockApi.mockResolvedValueOnce({
      userId: 'u1', tenantId: 'default',
      channels: {
        email: { enabled: false, threshold: 'medium', config: {} },
        webhook: { enabled: false, threshold: 'medium', config: {} },
        in_app: { enabled: true, threshold: 'medium', config: {} },
      },
      quietHours: { enabled: false, start: '22:00', end: '07:00', timezone: 'UTC', daysOfWeek: ['mon'] },
      digest: { frequency: 'daily', modules: [] },
      moduleToggles: {}, updatedAt: '2026-01-01',
    })
    const { result } = renderHook(() => useNotificationChannels(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockApi).toHaveBeenCalledWith('/customization/notifications')
    expect(result.current.data?.channels.map(c => c.id)).toEqual(['email', 'webhook', 'in_app'])
    expect(result.current.data?.channels.find(c => c.id === 'in_app')?.enabled).toBe(true)
    expect(result.current.data?.quietHours.timezone).toBe('UTC')
  })
})

describe('useUpdateNotificationChannel — PUT /customization/notifications/channels/:channel', () => {
  it('sends enabled + threshold + config to the real channel route', async () => {
    mockApi.mockResolvedValueOnce({ enabled: true, threshold: 'high', config: {} })
    const { result } = renderHook(() => useUpdateNotificationChannel(), { wrapper })
    result.current.mutate({ channel: 'email', enabled: true, threshold: 'high', config: {} })
    await waitFor(() => expect(mockApi).toHaveBeenCalledWith(
      '/customization/notifications/channels/email',
      expect.objectContaining({ method: 'PUT', body: { enabled: true, threshold: 'high', config: {} } }),
    ))
  })
})
