import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { EnrichmentDetailPanel } from '@/components/viz/EnrichmentDetailPanel'
import type { EnrichmentResult } from '@/hooks/use-enrichment-data'

const mockTrigger = vi.fn()

vi.mock('@/hooks/use-enrichment-data', () => ({
  useIOCCost: () => ({ data: undefined }),
  useTriggerEnrichment: () => ({ mutate: mockTrigger, isPending: false }),
}))

// Real GET /api/v1/enrichment/ioc/:iocId shape for an un-enriched high-severity IOC
// (S164 route A: 'pending' when severity is in TI_ENRICHMENT_AUTO_SEVERITIES)
const PENDING_RESULT: EnrichmentResult = {
  enrichmentStatus: 'pending',
  enrichedAt: null,
  externalRiskScore: null,
  enrichmentQuality: null,
  failureReason: null,
  geolocation: null,
  haikuResult: null,
  vtResult: null,
  abuseipdbResult: null,
}

// Real shape for a low-severity IOC that never qualified for auto-enrichment
const NOT_SELECTED_RESULT: EnrichmentResult = {
  ...PENDING_RESULT,
  enrichmentStatus: 'not_selected',
}

// Real shape for a fully enriched IOC
const ENRICHED_RESULT: EnrichmentResult = {
  enrichmentStatus: 'enriched',
  enrichedAt: '2026-09-27T00:00:00Z',
  externalRiskScore: 82,
  enrichmentQuality: 90,
  failureReason: null,
  geolocation: { countryCode: 'RU', isp: 'Evil Hosting', usageType: 'Data Center', isTor: false },
  haikuResult: {
    riskScore: 82, confidence: 80, severity: 'HIGH', threatCategory: 'c2_server',
    reasoning: 'Known C2 infra.', scoreJustification: '', evidenceSources: [],
    uncertaintyFactors: [], mitreTechniques: [], isFalsePositive: false,
    falsePositiveReason: null, malwareFamilies: [], attributedActors: [],
    recommendedActions: [], stixLabels: [], tags: [],
    cacheReadTokens: 0, cacheCreationTokens: 0, inputTokens: 100, outputTokens: 50,
    costUsd: 0.0002, durationMs: 400,
  },
  vtResult: {
    malicious: 10, suspicious: 1, harmless: 40, undetected: 2, totalEngines: 53,
    detectionRate: 19, tags: [], lastAnalysisDate: '2026-09-20',
  },
  abuseipdbResult: {
    abuseConfidenceScore: 90, totalReports: 20, numDistinctUsers: 5,
    lastReportedAt: '2026-09-20', isp: 'Evil Hosting', countryCode: 'RU',
    usageType: 'Data Center', isWhitelisted: false, isTor: false,
  },
}

describe('EnrichmentDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "Not enriched yet" + Enrich now button for pending status', () => {
    render(<EnrichmentDetailPanel iocId="ioc-1" iocType="ip" enrichment={PENDING_RESULT} />)
    expect(screen.getByText('Not enriched yet.')).toBeInTheDocument()
    expect(screen.getByText('Enrich now')).toBeInTheDocument()
  })

  it('shows a distinct message for not_selected status', () => {
    render(<EnrichmentDetailPanel iocId="ioc-1" iocType="ip" enrichment={NOT_SELECTED_RESULT} />)
    expect(screen.getByText('Not enriched yet.')).toBeInTheDocument()
    expect(screen.getByText(/doesn't qualify for auto-enrichment/)).toBeInTheDocument()
  })

  it('triggers manual enrichment when Enrich now is clicked', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(<EnrichmentDetailPanel iocId="ioc-1" iocType="ip" enrichment={PENDING_RESULT} />)
    await userEvent.click(screen.getByText('Enrich now'))
    expect(mockTrigger).toHaveBeenCalledWith('ioc-1')
  })

  it('renders real risk score and quality for an enriched IOC', () => {
    render(<EnrichmentDetailPanel iocId="ioc-1" iocType="ip" enrichment={ENRICHED_RESULT} />)
    expect(screen.getByText('82')).toBeInTheDocument()
    expect(screen.queryByText('Not enriched yet.')).not.toBeInTheDocument()
  })

  it('does not crash when enrichment is null (falls back to demo data)', () => {
    render(<EnrichmentDetailPanel iocId="ioc-1" iocType="ip" enrichment={null} />)
    expect(screen.getByText(/enriched|partial|pending|failed|skipped|not_selected/)).toBeInTheDocument()
  })
})
