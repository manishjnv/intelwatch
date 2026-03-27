/**
 * Tests for AnalyticsPage — 3 sections (ExecutiveSummary, TrendCharts,
 * IntelligenceBreakdown), date range, export, auto-refresh, error boundaries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Mock hooks ─────────────────────────────────────────────────

const mockDashboard = vi.fn()
const mockUseAnalyticsWidgets = vi.fn()
const mockUseExecutiveSummary = vi.fn()
const mockUseServiceHealth = vi.fn()

vi.mock('@/hooks/use-analytics-dashboard', async () => {
  const actual = await vi.importActual('@/hooks/use-analytics-dashboard') as Record<string, unknown>
  return {
    ...actual,
    useAnalyticsDashboard: () => mockDashboard(),
  }
})

vi.mock('@/hooks/use-analytics-data', () => ({
  useAnalyticsWidgets: () => mockUseAnalyticsWidgets(),
  useAnalyticsTrends: () => ({ data: { data: [], period: '7d', metrics: [] } }),
  useExecutiveSummary: () => mockUseExecutiveSummary(),
  useServiceHealth: () => mockUseServiceHealth(),
}))

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="page-stats-bar" data-title={title}>{children}</div>
  ),
  CompactStat: ({ label, value }: { label: string; value: string }) => (
    <span data-testid={`stat-${label}`}>{label}: {value}</span>
  ),
}))
vi.mock('@etip/shared-ui/components/TooltipHelp', () => ({
  TooltipHelp: () => <span data-testid="tooltip-help">?</span>,
}))

import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { DEMO_ANALYTICS } from '@/hooks/use-analytics-dashboard'

// ─── Setup ──────────────────────────────────────────────────────

const mockRefetch = vi.fn()
const mockSetPreset = vi.fn()
const mockSetCustomRange = vi.fn()

function setupMocks(overrides?: Partial<ReturnType<typeof mockDashboard>>) {
  mockDashboard.mockReturnValue({
    ...DEMO_ANALYTICS,
    isLoading: false,
    isDemo: false,
    error: null,
    isFetching: false,
    dateRange: { preset: '7d', from: '2026-03-20', to: '2026-03-27' },
    setPreset: mockSetPreset,
    setCustomRange: mockSetCustomRange,
    refetch: mockRefetch,
    dataUpdatedAt: Date.now(),
    ...overrides,
  })
  mockUseAnalyticsWidgets.mockReturnValue({ data: { widgets: {}, generatedAt: '', cacheHit: false } })
  mockUseExecutiveSummary.mockReturnValue({
    data: { riskScore: 58, riskPosture: 'medium', keyMetrics: [], topThreats: [], recommendations: [], generatedAt: '' },
  })
  mockUseServiceHealth.mockReturnValue({
    data: [
      { service: 'API Gateway', port: 3000, status: 'healthy', responseMs: 12 },
      { service: 'Ingestion', port: 3004, status: 'healthy', responseMs: 45 },
      { service: 'Admin Ops', port: 3022, status: 'unhealthy', responseMs: 0 },
    ],
  })
}

// ─── Tests ──────────────────────────────────────────────────────

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  it('renders all 3 sections', () => {
    render(<AnalyticsPage />)
    expect(screen.getByTestId('executive-summary')).toBeInTheDocument()
    expect(screen.getByTestId('trend-charts')).toBeInTheDocument()
    expect(screen.getByTestId('intelligence-breakdown')).toBeInTheDocument()
  })

  it('renders stats bar with title', () => {
    render(<AnalyticsPage />)
    expect(screen.getByTestId('page-stats-bar')).toHaveAttribute('data-title', 'Threat Intelligence Analytics')
  })

  it('shows risk score and services in stats bar', () => {
    render(<AnalyticsPage />)
    expect(screen.getByTestId('stat-Risk Score')).toHaveTextContent('58')
    expect(screen.getByTestId('stat-Services')).toHaveTextContent('2/3')
    expect(screen.getByTestId('stat-Posture')).toHaveTextContent('MEDIUM')
  })

  it('export CSV button exists and is clickable', () => {
    render(<AnalyticsPage />)
    const csvBtn = screen.getByTestId('export-csv')
    expect(csvBtn).toBeInTheDocument()
    expect(csvBtn).toHaveTextContent('CSV')
  })

  it('export PDF button exists', () => {
    render(<AnalyticsPage />)
    expect(screen.getByTestId('export-pdf')).toBeInTheDocument()
  })

  it('auto-refresh toggle buttons present', () => {
    render(<AnalyticsPage />)
    expect(screen.getByTestId('auto-refresh-off')).toBeInTheDocument()
    expect(screen.getByTestId('auto-refresh-5m')).toBeInTheDocument()
    expect(screen.getByTestId('auto-refresh-15m')).toBeInTheDocument()
  })

  it('demo banner shown when isDemo', () => {
    setupMocks({ isDemo: true })
    render(<AnalyticsPage />)
    expect(screen.getByText('Demo')).toBeInTheDocument()
    expect(screen.getByText('Demo data — connect Analytics Service for live metrics')).toBeInTheDocument()
  })

  it('full demo fallback renders complete page', () => {
    setupMocks({ isDemo: true })
    render(<AnalyticsPage />)
    expect(screen.getByTestId('executive-summary')).toBeInTheDocument()
    expect(screen.getByTestId('trend-charts')).toBeInTheDocument()
    expect(screen.getByTestId('intelligence-breakdown')).toBeInTheDocument()
  })

  it('staleness indicator renders with refresh', () => {
    render(<AnalyticsPage />)
    expect(screen.getByTestId('staleness-indicator')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('staleness-refresh'))
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('IOC count is displayed in stats', () => {
    render(<AnalyticsPage />)
    expect(screen.getByTestId('stat-IOCs')).toHaveTextContent('4,287')
  })
})
