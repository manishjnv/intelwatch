/**
 * Tests for enrichment UI components: EnrichmentPage + EnrichmentDetailPanel.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@/test/test-utils'
import { EnrichmentPage } from '@/pages/EnrichmentPage'
import { EnrichmentDetailPanel } from '@/components/viz/EnrichmentDetailPanel'

/** Real backend shape (EnrichmentResult) used in place of the removed demo fixture. */
const REAL_ENRICHMENT_RESULT = {
  enrichmentStatus: 'enriched' as const,
  enrichedAt: new Date(Date.now() - 86_400_000).toISOString(),
  externalRiskScore: 82,
  enrichmentQuality: 78,
  failureReason: null,
  geolocation: { countryCode: 'RU', isp: 'AS-CHOOPA', usageType: 'hosting', isTor: true },
  haikuResult: {
    riskScore: 85, confidence: 88, severity: 'HIGH',
    threatCategory: 'C2 Infrastructure',
    reasoning: 'This IP is associated with known C2 infrastructure used by APT28 for Cobalt Strike beacon communication.',
    scoreJustification: 'High VT detection rate, multiple AbuseIPDB reports, known APT28 association.',
    evidenceSources: [
      { provider: 'VirusTotal', dataPoint: '72/90 engines flagged as malicious', interpretation: 'Strong consensus on malicious nature' },
      { provider: 'AbuseIPDB', dataPoint: '147 reports from 89 distinct users', interpretation: 'Widespread abuse reporting confirms malicious activity' },
    ],
    uncertaintyFactors: ['Shared hosting infrastructure may include legitimate services'],
    mitreTechniques: [
      { techniqueId: 'T1071.001', name: 'Web Protocols', tactic: 'Command and Control' },
    ],
    isFalsePositive: false, falsePositiveReason: null,
    malwareFamilies: ['Cobalt Strike'], attributedActors: ['APT28'],
    recommendedActions: [
      { action: 'Block IP at perimeter firewall immediately', priority: 'immediate' as const },
    ],
    stixLabels: ['malicious-activity', 'c2'],
    tags: ['tor-exit', 'c2'],
    cacheReadTokens: 1200, cacheCreationTokens: 0,
    inputTokens: 1800, outputTokens: 600, costUsd: 0.004, durationMs: 1250,
  },
  vtResult: {
    malicious: 72, suspicious: 3, harmless: 10, undetected: 5,
    totalEngines: 90, detectionRate: 80, tags: ['c2', 'cobalt-strike'],
    lastAnalysisDate: new Date(Date.now() - 86_400_000).toISOString(),
  },
  abuseipdbResult: {
    abuseConfidenceScore: 95, totalReports: 147, numDistinctUsers: 89,
    lastReportedAt: new Date().toISOString(), isp: 'AS-CHOOPA', countryCode: 'RU',
    usageType: 'Data Center/Web Hosting/Transit', isWhitelisted: false, isTor: true,
  },
}

/* ================================================================ */
/* EnrichmentPage                                                     */
/* ================================================================ */
describe('EnrichmentPage', () => {
  it('renders without crashing', () => {
    render(<EnrichmentPage />)
    expect(screen.getByText('Total IOCs')).toBeTruthy()
    expect(screen.getByText('Enriched')).toBeTruthy()
    expect(screen.getByText('Pending')).toBeTruthy()
  })

  it('renders cost dashboard section', () => {
    render(<EnrichmentPage />)
    expect(screen.getByText('Cost Dashboard')).toBeTruthy()
  })

  it('renders pending queue section', () => {
    render(<EnrichmentPage />)
    expect(screen.getByText('Pending Queue')).toBeTruthy()
  })

  it('shows empty state when no pending IOCs', async () => {
    render(<EnrichmentPage />)
    // Wait for the query to settle — pending endpoint returns empty array
    await waitFor(() => {
      expect(screen.getByText(/No IOCs pending|All caught up/)).toBeTruthy()
    })
  })

  it('renders scheduler and cache labels', async () => {
    render(<EnrichmentPage />)
    // These are in the cost dashboard section which renders after demo fallback
    await waitFor(() => {
      expect(screen.getByText('Re-enrichment Scheduler')).toBeTruthy()
      expect(screen.getByText('Cache Hit Rate')).toBeTruthy()
    })
  })

  it('does not render budget gauge without API data (demo removed)', async () => {
    render(<EnrichmentPage />)
    await waitFor(() => {
      expect(screen.queryByText('Budget Usage')).toBeNull()
    })
  })

  it('does not render cost charts without API data (demo removed)', async () => {
    render(<EnrichmentPage />)
    await waitFor(() => {
      expect(screen.queryByText('Cost by Provider')).toBeNull()
      expect(screen.queryByText('Cost by IOC Type')).toBeNull()
    })
  })

  it('does not show demo banner (demo fallbacks removed)', async () => {
    render(<EnrichmentPage />)
    await waitFor(() => {
      expect(screen.queryByText('Demo')).toBeNull()
    })
  })

  it('renders stats bar with all stat labels', () => {
    render(<EnrichmentPage />)
    expect(screen.getByText('Failed')).toBeTruthy()
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('Avg Quality')).toBeTruthy()
    expect(screen.getByText('Cache Hit')).toBeTruthy()
  })
})

/* ================================================================ */
/* EnrichmentDetailPanel                                              */
/* ================================================================ */
describe('EnrichmentDetailPanel', () => {
  it('shows honest "not enriched" state with null enrichment (DECISION-048, no demo fallback)', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={null} />
    )
    expect(screen.getByText('Not enriched yet.')).toBeTruthy()
    expect(screen.getByText('Enrich now')).toBeTruthy()
    expect(screen.queryByText('AI Triage')).toBeNull()
  })

  it('shows enrichment status badge', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={REAL_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('enriched')).toBeTruthy()
  })

  it('renders quality score gauge', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={REAL_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('Quality Score')).toBeTruthy()
  })

  it('renders risk score', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={REAL_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('Risk Score')).toBeTruthy()
    expect(screen.getByText(String(REAL_ENRICHMENT_RESULT.externalRiskScore))).toBeTruthy()
  })

  it('renders evidence chain section with providers', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={REAL_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('Evidence Chain')).toBeTruthy()
    // Evidence table shows provider names in the data rows
    expect(screen.getAllByText('VirusTotal').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('AbuseIPDB').length).toBeGreaterThanOrEqual(1)
  })

  it('renders MITRE ATT&CK section with technique badges', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={REAL_ENRICHMENT_RESULT} />
    )
    // Section title — may appear multiple times due to evidence chain
    expect(screen.getAllByText(/MITRE ATT&CK/).length).toBeGreaterThanOrEqual(1)
    // Technique IDs
    expect(screen.getByText('T1071.001')).toBeTruthy()
    expect(screen.getByText('Web Protocols')).toBeTruthy()
  })

  it('renders recommended actions with priorities', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={REAL_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('Recommended Actions')).toBeTruthy()
    expect(screen.getByText(/Block IP at perimeter/)).toBeTruthy()
  })

  it('renders STIX labels section', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={REAL_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('STIX 2.1 Labels')).toBeTruthy()
  })

  it('renders geolocation for IP type', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={REAL_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('Geolocation')).toBeTruthy()
  })

  it('does NOT render geolocation for domain type', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="domain" enrichment={REAL_ENRICHMENT_RESULT} />
    )
    expect(screen.queryByText('Geolocation')).toBeNull()
  })

  it('renders provider results section', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={REAL_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('Provider Results')).toBeTruthy()
  })

  it('does not render cost breakdown without real cost data (demo fallback removed)', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={null} />
    )
    expect(screen.queryByText('Cost Breakdown')).toBeNull()
  })

  it('shows enrich button when not enriched', () => {
    const pending = { ...REAL_ENRICHMENT_RESULT, enrichmentStatus: 'pending' as const }
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={pending} />
    )
    expect(screen.getByText('Enrich now')).toBeTruthy()
  })

  it('does not show enrich button when already enriched', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={REAL_ENRICHMENT_RESULT} />
    )
    expect(screen.queryByText('Enrich')).toBeNull()
  })

  it('shows uncertainty factors', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={REAL_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('Uncertainty Factors')).toBeTruthy()
    expect(screen.getByText(/Shared hosting/)).toBeTruthy()
  })

  it('renders AI triage severity and threat category', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={REAL_ENRICHMENT_RESULT} />
    )
    // HIGH may appear in multiple places (badge + section badge)
    expect(screen.getAllByText('HIGH').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('C2 Infrastructure')).toBeTruthy()
  })

  it('renders threat category reasoning', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={REAL_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText(/known C2 infrastructure/)).toBeTruthy()
  })

  it('shows not-yet-enriched message for pending status', () => {
    const pending = {
      ...REAL_ENRICHMENT_RESULT,
      enrichmentStatus: 'pending' as const,
      haikuResult: null,
      vtResult: null,
      abuseipdbResult: null,
      geolocation: null,
    }
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={pending} />
    )
    expect(screen.getByText(/Not enriched yet/)).toBeTruthy()
  })
})
