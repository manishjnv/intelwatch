/**
 * @module __tests__/honest-enrichment-widgets
 * @description DECISION-048 honest-empty sweep for the enrichment-source and
 * AI-cost widget hooks (S173 audit PR 2). No `isDemo`, no fabricated fallback —
 * loading/error render '—' and never fake numbers; empty/unavailable data shows
 * an honest empty state; real data renders.
 *
 * Also verifies the RCA #45-style real-backend-shape bug found in this sweep:
 * `/analytics/enrichment-quality` actually returns confidence-tier stats
 * (EnrichmentQuality), not the per-source breakdown `useEnrichmentSourceBreakdown`
 * wants — the hook must not crash and must render an honest empty state for it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, renderHook, waitFor } from '@/test/test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

const mockApi = vi.fn()
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class extends Error { status: number; constructor(s: number, m: string) { super(m); this.status = s } },
}))

import {
  useEnrichmentSourceBreakdown, useAiCostSummary, useEnrichmentQuality,
} from '@/hooks/use-enrichment-data'
import { EnrichmentSourceWidget } from '@/components/widgets/EnrichmentSourceWidget'
import { AiCostWidget } from '@/components/widgets/AiCostWidget'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

beforeEach(() => { mockApi.mockReset() })

// ─── Hooks: real backend shapes ──────────────────────────────────

describe('useEnrichmentSourceBreakdown — real backend shape', () => {
  it('the real /analytics/enrichment-quality response (confidence tiers, no bySource) never crashes and yields honest null', async () => {
    mockApi.mockResolvedValueOnce({
      total: 100, highConfidence: 60, mediumConfidence: 30, lowConfidence: 10,
      pendingEnrichment: 5, highPct: 60, mediumPct: 30, lowPct: 10,
    })
    const { result } = renderHook(() => useEnrichmentSourceBreakdown(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isError).toBe(false)
    expect(result.current.data).toBeNull()
    expect(result.current).not.toHaveProperty('isDemo')
  })

  it('a response that does carry bySource is trusted', async () => {
    mockApi.mockResolvedValueOnce({
      avgQuality: 72, enrichedCount: 840, unenrichedCount: 160, enrichedPercent: 84,
      bySource: { Shodan: { success: 620, total: 840, rate: 74 } },
    })
    const { result } = renderHook(() => useEnrichmentSourceBreakdown(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.avgQuality).toBe(72)
  })

  it('on failure, isError is true and data is null (no swallowed error)', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useEnrichmentSourceBreakdown(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isError).toBe(true)
    expect(result.current.data).toBeNull()
  })
})

describe('useAiCostSummary — real backend shape', () => {
  it('the real /analytics/cost-tracking response (CostTrackingData) maps cleanly', async () => {
    mockApi.mockResolvedValueOnce({
      totalCostUsd: 12.5, costPerArticle: 0.02, costPerIoc: 0.04,
      byModel: { Haiku: 3.2, Sonnet: 9.3 }, trend: [],
    })
    const { result } = renderHook(() => useAiCostSummary(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.totalCostUsd).toBe(12.5)
    expect(result.current.data).not.toHaveProperty('deltaPercent')
    expect(result.current).not.toHaveProperty('isDemo')
  })

  it('on failure, isError is true and data is null', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useAiCostSummary(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isError).toBe(true)
    expect(result.current.data).toBeNull()
  })
})

describe('useEnrichmentQuality — real backend shape', () => {
  it('matches EnrichmentQuality exactly (confidence tiers)', async () => {
    mockApi.mockResolvedValueOnce({
      total: 100, highConfidence: 60, mediumConfidence: 30, lowConfidence: 10,
      pendingEnrichment: 5, highPct: 60, mediumPct: 30, lowPct: 10,
    })
    const { result } = renderHook(() => useEnrichmentQuality(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.highPct).toBe(60)
    expect(result.current).not.toHaveProperty('isDemo')
  })
})

// ─── Widgets: honest rendering (hooks run for real, only @/lib/api is mocked) ──

describe('EnrichmentSourceWidget — honest states', () => {
  it('shows "—" and no source bars while loading', async () => {
    mockApi.mockImplementation(() => new Promise(() => {})) // never resolves
    render(createElement(EnrichmentSourceWidget))
    expect(await screen.findByTestId('enrichment-source-widget')).toBeInTheDocument()
    expect(screen.getByTestId('avg-quality')).toHaveTextContent('—')
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })

  it('shows "—" and no source bars on error, never fabricated data', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    render(createElement(EnrichmentSourceWidget))
    expect(await screen.findByText('Failed to load')).toBeInTheDocument()
    expect(screen.getByTestId('avg-quality')).toHaveTextContent('—')
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })

  it('honest empty state when the backend has no per-source data (real shape today)', async () => {
    mockApi.mockResolvedValueOnce({ total: 100, highPct: 60 })
    render(createElement(EnrichmentSourceWidget))
    await waitFor(() => expect(screen.getByText('No enrichment data yet')).toBeInTheDocument())
    expect(screen.getByTestId('avg-quality')).toHaveTextContent('—')
  })

  it('renders real data when the backend does provide it', async () => {
    mockApi.mockResolvedValueOnce({
      avgQuality: 72, enrichedCount: 840, unenrichedCount: 160, enrichedPercent: 84,
      bySource: { Shodan: { success: 620, total: 840, rate: 74 } },
    })
    render(createElement(EnrichmentSourceWidget))
    await waitFor(() => expect(screen.getByTestId('avg-quality')).toHaveTextContent('72'))
    expect(screen.getByTestId('source-bar-Shodan')).toBeInTheDocument()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })
})

describe('AiCostWidget — honest states', () => {
  it('shows "—" while loading, no model breakdown', async () => {
    mockApi.mockImplementation(() => new Promise(() => {}))
    render(createElement(AiCostWidget))
    expect(await screen.findByTestId('ai-cost-widget')).toBeInTheDocument()
    expect(screen.getByTestId('total-cost')).toHaveTextContent('—')
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })

  it('shows "—" and an error note on error', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'))
    render(createElement(AiCostWidget))
    expect(await screen.findByText('Failed to load')).toBeInTheDocument()
    expect(screen.getByTestId('total-cost')).toHaveTextContent('—')
  })

  it('renders real data when the backend provides it', async () => {
    mockApi.mockResolvedValueOnce({
      totalCostUsd: 12.5, costPerArticle: 0.02, costPerIoc: 0.04,
      byModel: { Haiku: 3.2, Sonnet: 9.3 },
    })
    render(createElement(AiCostWidget))
    await waitFor(() => expect(screen.getByTestId('total-cost')).toHaveTextContent('$12.50'))
    expect(screen.getByText(/Haiku/)).toBeInTheDocument()
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
  })
})
