/**
 * Tests for ExecutiveSummary component — 8 KPI cards with deltas,
 * sparklines, feed health, STIX confidence, AI cost, demo fallback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

vi.mock('@etip/shared-ui/components/TooltipHelp', () => ({
  TooltipHelp: () => <span data-testid="tooltip-help">?</span>,
}))

import { ExecutiveSummary } from '@/components/analytics/ExecutiveSummary'
import { DEMO_ANALYTICS } from '@/hooks/use-analytics-dashboard'

// ─── Tests ──────────────────────────────────────────────────────

describe('ExecutiveSummary', () => {
  const mockNavigate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all 8 stat cards', () => {
    render(<ExecutiveSummary data={DEMO_ANALYTICS} onNavigate={mockNavigate} />)
    expect(screen.getByTestId('kpi-total-iocs')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-active-threats')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-feed-health')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-throughput')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-confidence')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-enrichment')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-ai-cost')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-alerts')).toBeInTheDocument()
  })

  it('shows total IOC count with delta', () => {
    render(<ExecutiveSummary data={DEMO_ANALYTICS} />)
    expect(screen.getByTestId('kpi-total-iocs')).toHaveTextContent('4,287')
  })

  it('feed health shows correct active/total', () => {
    render(<ExecutiveSummary data={DEMO_ANALYTICS} />)
    // 5 active out of 6 total in demo data (PhishTank is degraded)
    expect(screen.getByTestId('kpi-feed-health')).toHaveTextContent('5/6')
  })

  it('STIX confidence badge renders correct tier', () => {
    render(<ExecutiveSummary data={DEMO_ANALYTICS} />)
    // avgConfidence = 72 → Medium tier
    expect(screen.getByTestId('kpi-confidence')).toHaveTextContent('72%')
    expect(screen.getByTestId('kpi-confidence')).toHaveTextContent('Medium')
  })

  it('AI cost shows dollar amount', () => {
    render(<ExecutiveSummary data={DEMO_ANALYTICS} />)
    expect(screen.getByTestId('kpi-ai-cost')).toHaveTextContent('$12.47')
  })

  it('demo fallback renders static data', () => {
    render(<ExecutiveSummary data={DEMO_ANALYTICS} isDemo />)
    expect(screen.getByText('Demo data — connect services for live metrics')).toBeInTheDocument()
    expect(screen.getByTestId('executive-summary')).toBeInTheDocument()
  })

  it('clicking a card triggers onNavigate', () => {
    render(<ExecutiveSummary data={DEMO_ANALYTICS} onNavigate={mockNavigate} />)
    fireEvent.click(screen.getByTestId('kpi-total-iocs'))
    expect(mockNavigate).toHaveBeenCalledWith('ioc-distribution')
  })

  it('mobile responsive: renders in 2-column grid on small screens', () => {
    render(<ExecutiveSummary data={DEMO_ANALYTICS} />)
    const grid = screen.getByTestId('executive-summary').querySelector('.grid')
    expect(grid).toHaveClass('grid-cols-2')
  })
})
