/**
 * Tests for enrichment UI components: EnrichmentPage + EnrichmentDetailPanel.
 * Renders with demo data fallbacks (no API mocking needed).
 */
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@/test/test-utils'
import { EnrichmentPage } from '@/pages/EnrichmentPage'
import { EnrichmentDetailPanel } from '@/components/viz/EnrichmentDetailPanel'
import { DEMO_ENRICHMENT_RESULT } from '@/hooks/demo-data'

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
  it('renders without crashing with null enrichment (shows demo)', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={null} />
    )
    expect(screen.getByText('AI Triage')).toBeTruthy()
  })

  it('shows enrichment status badge', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={DEMO_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('enriched')).toBeTruthy()
  })

  it('renders quality score gauge', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={DEMO_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('Quality Score')).toBeTruthy()
  })

  it('renders risk score', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={DEMO_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('Risk Score')).toBeTruthy()
    expect(screen.getByText(String(DEMO_ENRICHMENT_RESULT.externalRiskScore))).toBeTruthy()
  })

  it('renders evidence chain section with providers', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={DEMO_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('Evidence Chain')).toBeTruthy()
    // Evidence table shows provider names in the data rows
    expect(screen.getAllByText('VirusTotal').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('AbuseIPDB').length).toBeGreaterThanOrEqual(1)
  })

  it('renders MITRE ATT&CK section with technique badges', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={DEMO_ENRICHMENT_RESULT} />
    )
    // Section title — may appear multiple times due to evidence chain
    expect(screen.getAllByText(/MITRE ATT&CK/).length).toBeGreaterThanOrEqual(1)
    // Technique IDs
    expect(screen.getByText('T1071.001')).toBeTruthy()
    expect(screen.getByText('Web Protocols')).toBeTruthy()
  })

  it('renders recommended actions with priorities', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={DEMO_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('Recommended Actions')).toBeTruthy()
    expect(screen.getByText(/Block IP at perimeter/)).toBeTruthy()
  })

  it('renders STIX labels section', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={DEMO_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('STIX 2.1 Labels')).toBeTruthy()
  })

  it('renders geolocation for IP type', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={DEMO_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('Geolocation')).toBeTruthy()
  })

  it('does NOT render geolocation for domain type', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="domain" enrichment={DEMO_ENRICHMENT_RESULT} />
    )
    expect(screen.queryByText('Geolocation')).toBeNull()
  })

  it('renders provider results section', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={DEMO_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('Provider Results')).toBeTruthy()
  })

  it('renders cost breakdown section', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={null} />
    )
    expect(screen.getByText('Cost Breakdown')).toBeTruthy()
  })

  it('shows enrich button when not enriched', () => {
    const pending = { ...DEMO_ENRICHMENT_RESULT, enrichmentStatus: 'pending' as const }
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={pending} />
    )
    expect(screen.getByText('Enrich')).toBeTruthy()
  })

  it('does not show enrich button when already enriched', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={DEMO_ENRICHMENT_RESULT} />
    )
    expect(screen.queryByText('Enrich')).toBeNull()
  })

  it('shows uncertainty factors', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={DEMO_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText('Uncertainty Factors')).toBeTruthy()
    expect(screen.getByText(/Shared hosting/)).toBeTruthy()
  })

  it('renders AI triage severity and threat category', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={DEMO_ENRICHMENT_RESULT} />
    )
    // HIGH may appear in multiple places (badge + section badge)
    expect(screen.getAllByText('HIGH').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('C2 Infrastructure')).toBeTruthy()
  })

  it('renders threat category reasoning', () => {
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={DEMO_ENRICHMENT_RESULT} />
    )
    expect(screen.getByText(/known C2 infrastructure/)).toBeTruthy()
  })

  it('shows not-yet-enriched message for pending status', () => {
    const pending = {
      ...DEMO_ENRICHMENT_RESULT,
      enrichmentStatus: 'pending' as const,
      haikuResult: null,
      vtResult: null,
      abuseipdbResult: null,
      geolocation: null,
    }
    render(
      <EnrichmentDetailPanel iocId="test-1" iocType="ip" enrichment={pending} />
    )
    expect(screen.getByText(/Not yet enriched/)).toBeTruthy()
  })
})
