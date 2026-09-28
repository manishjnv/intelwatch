/**
 * IOC trend pill must not claim "Stable" when there isn't enough data to know that.
 * Fewer than 2 iocTrend points → show "—", not a fabricated delta.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'

const baseMock = {
  topCves: [],
  alertTrend: [],
  iocTrend: [] as { date: string; count: number }[],
  iocBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  topIocs: [],
  topActors: [],
  feedHealth: [],
  summary: { totalIocs: 0, totalArticles: 0, totalFeeds: 0, totalAlerts: 0, avgConfidence: 0, avgEnrichmentQuality: 0, pipelineThroughput: 0 },
  enrichmentStats: { enriched: 0, unenriched: 0, avgQuality: 0, bySource: {} },
  costStats: { totalCostUsd: 0, costPerArticle: 0, costPerIoc: 0, byModel: {}, trend: [] },
  iocByType: {},
  iocByConfidenceTier: {},
  iocByLifecycle: {},
  isLoading: false,
  isDemo: false,
  dateRange: { preset: '7d' as const, from: '', to: '' },
  setPreset: vi.fn(),
  setCustomRange: vi.fn(),
  refetch: vi.fn(),
}

let mockAnalytics = { ...baseMock }

vi.mock('@/hooks/use-analytics-dashboard', () => ({
  useAnalyticsDashboard: () => mockAnalytics,
}))

import { ThreatBriefingWidget } from '@/components/widgets/ThreatBriefingWidget'

describe('ThreatBriefingWidget — IOC Trend with missing data', () => {
  it('shows "—" with no trend claim when iocTrend is empty', () => {
    mockAnalytics = { ...baseMock, iocTrend: [] }
    render(<ThreatBriefingWidget profile={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('Stable')).not.toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('shows "—" with a single point', () => {
    mockAnalytics = { ...baseMock, iocTrend: [{ date: '2026-04-01', count: 10 }] }
    render(<ThreatBriefingWidget profile={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('Stable')).not.toBeInTheDocument()
  })

  it('shows a real percentage delta with 2+ points', () => {
    mockAnalytics = {
      ...baseMock,
      iocTrend: [{ date: '2026-04-01', count: 100 }, { date: '2026-04-02', count: 80 }],
    }
    render(<ThreatBriefingWidget profile={null} />)
    expect(screen.getByText('↓20%')).toBeInTheDocument()
  })
})
