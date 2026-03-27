/**
 * Tests for TrendCharts component — IOC trend, severity bars, alert chart,
 * feed contribution, AI cost chart, period selector, loading skeletons.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

vi.mock('@etip/shared-ui/components/TooltipHelp', () => ({
  TooltipHelp: () => <span data-testid="tooltip-help">?</span>,
}))

import { TrendCharts } from '@/components/analytics/TrendCharts'
import { DEMO_ANALYTICS } from '@/hooks/use-analytics-dashboard'

// ─── Tests ──────────────────────────────────────────────────────

describe('TrendCharts', () => {
  const mockPeriodChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all 5 chart cards', () => {
    render(<TrendCharts data={DEMO_ANALYTICS} period="7d" onPeriodChange={mockPeriodChange} />)
    expect(screen.getByTestId('chart-ioc-trend')).toBeInTheDocument()
    expect(screen.getByTestId('chart-severity')).toBeInTheDocument()
    expect(screen.getByTestId('chart-alerts')).toBeInTheDocument()
    expect(screen.getByTestId('chart-feeds')).toBeInTheDocument()
    expect(screen.getByTestId('chart-cost')).toBeInTheDocument()
  })

  it('IOC trend chart renders area chart with data points', () => {
    render(<TrendCharts data={DEMO_ANALYTICS} period="7d" onPeriodChange={mockPeriodChange} />)
    const chart = screen.getByTestId('chart-ioc-trend')
    expect(chart.querySelector('[data-testid="area-chart"]')).toBeInTheDocument()
  })

  it('severity chart renders all severity bars', () => {
    render(<TrendCharts data={DEMO_ANALYTICS} period="7d" onPeriodChange={mockPeriodChange} />)
    const bars = screen.getByTestId('severity-bars')
    expect(bars).toBeInTheDocument()
    // Demo data has 5 severities
    expect(screen.getByTestId('sev-bar-critical')).toBeInTheDocument()
    expect(screen.getByTestId('sev-bar-high')).toBeInTheDocument()
    expect(screen.getByTestId('sev-bar-medium')).toBeInTheDocument()
    expect(screen.getByTestId('sev-bar-low')).toBeInTheDocument()
    expect(screen.getByTestId('sev-bar-info')).toBeInTheDocument()
  })

  it('alert chart renders SVG', () => {
    render(<TrendCharts data={DEMO_ANALYTICS} period="7d" onPeriodChange={mockPeriodChange} />)
    const chart = screen.getByTestId('chart-alerts')
    expect(chart.querySelector('[data-testid="alert-chart"]')).toBeInTheDocument()
  })

  it('feed contribution shows feed names and bars', () => {
    render(<TrendCharts data={DEMO_ANALYTICS} period="7d" onPeriodChange={mockPeriodChange} />)
    expect(screen.getByTestId('feed-bars')).toBeInTheDocument()
    expect(screen.getByText('AlienVault OTX')).toBeInTheDocument()
    expect(screen.getByText('CISA KEV')).toBeInTheDocument()
  })

  it('AI cost chart shows budget line', () => {
    render(<TrendCharts data={DEMO_ANALYTICS} period="7d" onPeriodChange={mockPeriodChange} />)
    const costChart = screen.getByTestId('chart-cost')
    expect(costChart.querySelector('[data-testid="budget-line"]')).toBeInTheDocument()
  })

  it('period buttons call onPeriodChange', () => {
    render(<TrendCharts data={DEMO_ANALYTICS} period="7d" onPeriodChange={mockPeriodChange} />)
    fireEvent.click(screen.getByTestId('period-30d'))
    expect(mockPeriodChange).toHaveBeenCalledWith('30d')
  })

  it('demo fallback renders all charts with demo data', () => {
    render(<TrendCharts data={DEMO_ANALYTICS} period="7d" onPeriodChange={mockPeriodChange} />)
    expect(screen.getByTestId('trend-charts')).toBeInTheDocument()
    // All 5 chart cards render
    expect(screen.getAllByTestId(/^chart-/).length).toBe(5)
  })

  it('loading skeleton shown while fetching', () => {
    render(<TrendCharts data={DEMO_ANALYTICS} isLoading period="7d" onPeriodChange={mockPeriodChange} />)
    const skeletons = screen.getAllByTestId('chart-skeleton')
    expect(skeletons.length).toBeGreaterThanOrEqual(5)
  })

  it('mobile responsive: charts stack vertically', () => {
    render(<TrendCharts data={DEMO_ANALYTICS} period="7d" onPeriodChange={mockPeriodChange} />)
    const grid = screen.getByTestId('trend-charts').querySelector('.grid')
    expect(grid).toHaveClass('grid-cols-1')
  })
})
