/**
 * Tests for IntelligenceBreakdown component — donut chart, confidence histogram,
 * lifecycle bar, top IOCs table, top CVEs table, enrichment matrix.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

vi.mock('@etip/shared-ui/components/TooltipHelp', () => ({
  TooltipHelp: () => <span data-testid="tooltip-help">?</span>,
}))

import { IntelligenceBreakdown } from '@/components/analytics/IntelligenceBreakdown'
import { DEMO_ANALYTICS } from '@/hooks/use-analytics-dashboard'

// ─── Tests ──────────────────────────────────────────────────────

describe('IntelligenceBreakdown', () => {
  const mockIocClick = vi.fn()
  const mockTypeFilter = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all 6 panels', () => {
    render(<IntelligenceBreakdown data={DEMO_ANALYTICS} />)
    expect(screen.getByTestId('panel-ioc-type')).toBeInTheDocument()
    expect(screen.getByTestId('panel-confidence')).toBeInTheDocument()
    expect(screen.getByTestId('panel-lifecycle')).toBeInTheDocument()
    expect(screen.getByTestId('panel-top-iocs')).toBeInTheDocument()
    expect(screen.getByTestId('panel-top-cves')).toBeInTheDocument()
    expect(screen.getByTestId('panel-enrichment')).toBeInTheDocument()
  })

  it('IOC type donut chart renders all segments', () => {
    render(<IntelligenceBreakdown data={DEMO_ANALYTICS} onTypeFilter={mockTypeFilter} />)
    const donut = screen.getByTestId('donut-chart')
    expect(donut).toBeInTheDocument()
    // Legend shows all types — use getAllByText since SVG titles also contain type names
    expect(screen.getAllByText('ip').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('domain').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('hash').length).toBeGreaterThanOrEqual(1)
  })

  it('confidence histogram renders STIX tier bars', () => {
    render(<IntelligenceBreakdown data={DEMO_ANALYTICS} />)
    expect(screen.getByTestId('confidence-histogram')).toBeInTheDocument()
    expect(screen.getByTestId('conf-bar-high')).toBeInTheDocument()
    expect(screen.getByTestId('conf-bar-medium')).toBeInTheDocument()
    expect(screen.getByTestId('conf-bar-low')).toBeInTheDocument()
  })

  it('lifecycle bar shows all states', () => {
    render(<IntelligenceBreakdown data={DEMO_ANALYTICS} />)
    expect(screen.getByTestId('lifecycle-bar')).toBeInTheDocument()
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(screen.getByText('stale')).toBeInTheDocument()
    expect(screen.getByText('expired')).toBeInTheDocument()
  })

  it('top corroborated table shows rows', () => {
    render(<IntelligenceBreakdown data={DEMO_ANALYTICS} onIocClick={mockIocClick} />)
    const table = screen.getByTestId('top-iocs-table')
    expect(table).toBeInTheDocument()
    expect(screen.getByText('185.220.101.34')).toBeInTheDocument()
    expect(screen.getByText('evil-payload.xyz')).toBeInTheDocument()
  })

  it('top CVEs table shows EPSS with correct color', () => {
    render(<IntelligenceBreakdown data={DEMO_ANALYTICS} />)
    const table = screen.getByTestId('top-cves-table')
    expect(table).toBeInTheDocument()
    // CVE-2024-21762 has EPSS 0.94 → 94.0% → should be red (text-sev-critical)
    const epssCell = screen.getByTestId('epss-CVE-2024-21762')
    expect(epssCell).toHaveTextContent('94.0%')
    expect(epssCell).toHaveClass('text-sev-critical')
    // CVE-2024-20353 has EPSS 0.08 → 8.0% → should be green (text-sev-low)
    const lowEpss = screen.getByTestId('epss-CVE-2024-20353')
    expect(lowEpss).toHaveTextContent('8.0%')
    expect(lowEpss).toHaveClass('text-sev-low')
  })

  it('enrichment matrix renders source rows', () => {
    render(<IntelligenceBreakdown data={DEMO_ANALYTICS} />)
    const matrix = screen.getByTestId('enrichment-matrix')
    expect(matrix).toBeInTheDocument()
    expect(screen.getByText('Shodan')).toBeInTheDocument()
    expect(screen.getByText('GreyNoise')).toBeInTheDocument()
    // Shodan: 1200/(1200+80) = 93% → green
    const shodanRate = screen.getByTestId('enrich-rate-Shodan')
    expect(shodanRate).toHaveTextContent('94%')
    expect(shodanRate).toHaveClass('text-sev-low')
  })

  it('clicking IOC row calls onIocClick', () => {
    render(<IntelligenceBreakdown data={DEMO_ANALYTICS} onIocClick={mockIocClick} />)
    fireEvent.click(screen.getByText('185.220.101.34'))
    expect(mockIocClick).toHaveBeenCalledWith(expect.objectContaining({ value: '185.220.101.34' }))
  })

  it('demo fallback renders all panels', () => {
    render(<IntelligenceBreakdown data={DEMO_ANALYTICS} />)
    expect(screen.getByTestId('intelligence-breakdown')).toBeInTheDocument()
    expect(screen.getAllByTestId(/^panel-/).length).toBe(6)
  })
})
