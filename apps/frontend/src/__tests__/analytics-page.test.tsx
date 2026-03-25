/**
 * Tests for AnalyticsPage: 4 tabs (Overview/Trends/Landscape/Health),
 * stats bar, demo fallback, widget grid, trend cards, service health matrix.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Mock hooks ─────────────────────────────────────────────────

const mockUseAnalyticsWidgets = vi.fn()
const mockUseAnalyticsTrends = vi.fn()
const mockUseExecutiveSummary = vi.fn()
const mockUseServiceHealth = vi.fn()

vi.mock('@/hooks/use-analytics-data', () => ({
  useAnalyticsWidgets: () => mockUseAnalyticsWidgets(),
  useAnalyticsTrends: (...args: any[]) => mockUseAnalyticsTrends(...args),
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

// ─── Test Data ──────────────────────────────────────────────────

const DASHBOARD = {
  widgets: {
    'ioc.total': { id: 'ioc.total', label: 'Total IOCs', value: 4287, trend: { delta: 142, deltaPercent: 3.4, direction: 'up' } },
    'alert.open': { id: 'alert.open', label: 'Open Alerts', value: 38, trend: { delta: -5, deltaPercent: -11.6, direction: 'down' } },
    'feed.active': { id: 'feed.active', label: 'Active Feeds', value: 12, trend: { delta: 0, deltaPercent: 0, direction: 'flat' } },
  },
  generatedAt: new Date().toISOString(),
  cacheHit: false,
}

const TRENDS = {
  data: [
    { metric: 'ioc.total', label: 'Total IOCs', points: [{ timestamp: '2026-03-20', value: 4200 }, { timestamp: '2026-03-21', value: 4287 }], currentValue: 4287, previousValue: 4200, delta: 87, deltaPercent: 2.1, direction: 'up' },
    { metric: 'alert.open', label: 'Open Alerts', points: [{ timestamp: '2026-03-20', value: 43 }, { timestamp: '2026-03-21', value: 38 }], currentValue: 38, previousValue: 43, delta: -5, deltaPercent: -11.6, direction: 'down' },
  ],
  period: '7d',
  metrics: ['ioc.total', 'alert.open'],
}

const EXECUTIVE = {
  riskPosture: 'medium',
  riskScore: 58,
  keyMetrics: [
    { label: 'Total IOCs', value: 4287, trend: 'up' },
    { label: 'Open Alerts', value: 38, trend: 'down' },
  ],
  topThreats: [
    { name: 'APT28 (Fancy Bear)', severity: 'critical', count: 23 },
    { name: 'Lazarus Group', severity: 'critical', count: 18 },
  ],
  recommendations: [
    'Investigate 23 APT28-linked IOCs',
    'Patch CVE-2024-21762 on Fortinet appliances',
  ],
  generatedAt: new Date().toISOString(),
}

const SERVICES = [
  { service: 'API Gateway', port: 3000, status: 'healthy', responseMs: 12 },
  { service: 'Ingestion', port: 3004, status: 'healthy', responseMs: 45 },
  { service: 'Admin Ops', port: 3022, status: 'unhealthy', responseMs: 0 },
]

// ─── Setup ──────────────────────────────────────────────────────

function setupMocks() {
  mockUseAnalyticsWidgets.mockReturnValue({ data: DASHBOARD, isDemo: false })
  mockUseAnalyticsTrends.mockReturnValue({ data: TRENDS })
  mockUseExecutiveSummary.mockReturnValue({ data: EXECUTIVE })
  mockUseServiceHealth.mockReturnValue({ data: SERVICES })
}

// ─── Tests ──────────────────────────────────────────────────────

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  // ── Stats bar ──
  describe('Stats bar', () => {
    it('renders stats bar with title Analytics', () => {
      render(<AnalyticsPage />)
      expect(screen.getByTestId('page-stats-bar')).toHaveAttribute('data-title', 'Analytics')
    })

    it('shows risk score, widgets, services stats', () => {
      render(<AnalyticsPage />)
      expect(screen.getByTestId('stat-Risk Score')).toHaveTextContent('58')
      expect(screen.getByTestId('stat-Widgets')).toHaveTextContent('3')
      expect(screen.getByTestId('stat-Services')).toHaveTextContent('2/3')
      expect(screen.getByTestId('stat-Posture')).toHaveTextContent('MEDIUM')
    })
  })

  // ── Tabs ──
  describe('Tabs', () => {
    it('renders all 4 tab buttons', () => {
      render(<AnalyticsPage />)
      expect(screen.getByText('Overview')).toBeInTheDocument()
      expect(screen.getByText('IOC Trends')).toBeInTheDocument()
      expect(screen.getByText('Threat Landscape')).toBeInTheDocument()
      expect(screen.getByText('Pipeline Health')).toBeInTheDocument()
    })

    it('defaults to Overview tab', () => {
      render(<AnalyticsPage />)
      expect(screen.getByTestId('widget-grid')).toBeInTheDocument()
    })
  })

  // ── Overview tab ──
  describe('Overview tab', () => {
    it('renders widget cards', () => {
      render(<AnalyticsPage />)
      expect(screen.getByText('Total IOCs')).toBeInTheDocument()
      expect(screen.getByText('4287')).toBeInTheDocument()
      expect(screen.getByText('Open Alerts')).toBeInTheDocument()
      expect(screen.getByText('38')).toBeInTheDocument()
    })

    it('shows trend arrows', () => {
      render(<AnalyticsPage />)
      expect(screen.getByText('+3.4%')).toBeInTheDocument()
      expect(screen.getByText('-11.6%')).toBeInTheDocument()
    })

    it('shows demo banner when isDemo', () => {
      mockUseAnalyticsWidgets.mockReturnValue({ data: DASHBOARD, isDemo: true })
      render(<AnalyticsPage />)
      expect(screen.getByText('Demo')).toBeInTheDocument()
    })
  })

  // ── IOC Trends tab ──
  describe('IOC Trends tab', () => {
    it('renders trend cards', () => {
      render(<AnalyticsPage />)
      fireEvent.click(screen.getByText('IOC Trends'))
      expect(screen.getByTestId('trend-cards')).toBeInTheDocument()
      expect(screen.getByText('Metric Trends')).toBeInTheDocument()
    })

    it('shows period toggles', () => {
      render(<AnalyticsPage />)
      fireEvent.click(screen.getByText('IOC Trends'))
      expect(screen.getByText('7d')).toBeInTheDocument()
      expect(screen.getByText('30d')).toBeInTheDocument()
      expect(screen.getByText('90d')).toBeInTheDocument()
    })

    it('shows current and previous values', () => {
      render(<AnalyticsPage />)
      fireEvent.click(screen.getByText('IOC Trends'))
      expect(screen.getByText('prev: 4200')).toBeInTheDocument()
    })

    it('shows empty state when no trends', () => {
      mockUseAnalyticsTrends.mockReturnValue({ data: { data: [], period: '7d', metrics: [] } })
      render(<AnalyticsPage />)
      fireEvent.click(screen.getByText('IOC Trends'))
      expect(screen.getByText('No trend data available')).toBeInTheDocument()
    })
  })

  // ── Threat Landscape tab ──
  describe('Threat Landscape tab', () => {
    it('shows risk posture badge', () => {
      render(<AnalyticsPage />)
      fireEvent.click(screen.getByText('Threat Landscape'))
      expect(screen.getByTestId('landscape-tab')).toBeInTheDocument()
      expect(screen.getByText('medium')).toBeInTheDocument()
    })

    it('shows risk score', () => {
      render(<AnalyticsPage />)
      fireEvent.click(screen.getByText('Threat Landscape'))
      expect(screen.getByText('58')).toBeInTheDocument()
    })

    it('shows top threats', () => {
      render(<AnalyticsPage />)
      fireEvent.click(screen.getByText('Threat Landscape'))
      expect(screen.getByText('APT28 (Fancy Bear)')).toBeInTheDocument()
      expect(screen.getByText('Lazarus Group')).toBeInTheDocument()
    })

    it('shows recommendations', () => {
      render(<AnalyticsPage />)
      fireEvent.click(screen.getByText('Threat Landscape'))
      expect(screen.getByText('Investigate 23 APT28-linked IOCs')).toBeInTheDocument()
      expect(screen.getByText('Patch CVE-2024-21762 on Fortinet appliances')).toBeInTheDocument()
    })

    it('shows key metrics', () => {
      render(<AnalyticsPage />)
      fireEvent.click(screen.getByText('Threat Landscape'))
      expect(screen.getByText('Top Threats')).toBeInTheDocument()
      expect(screen.getByText('Recommendations')).toBeInTheDocument()
    })
  })

  // ── Pipeline Health tab ──
  describe('Pipeline Health tab', () => {
    it('renders health grid', () => {
      render(<AnalyticsPage />)
      fireEvent.click(screen.getByText('Pipeline Health'))
      expect(screen.getByTestId('health-tab')).toBeInTheDocument()
      expect(screen.getByTestId('health-grid')).toBeInTheDocument()
    })

    it('shows service names and ports', () => {
      render(<AnalyticsPage />)
      fireEvent.click(screen.getByText('Pipeline Health'))
      expect(screen.getByText('API Gateway')).toBeInTheDocument()
      expect(screen.getByText(':3000')).toBeInTheDocument()
      expect(screen.getByText('Ingestion')).toBeInTheDocument()
    })

    it('shows healthy/total count', () => {
      render(<AnalyticsPage />)
      fireEvent.click(screen.getByText('Pipeline Health'))
      expect(screen.getByText('2/3 healthy')).toBeInTheDocument()
    })

    it('shows response time for healthy services', () => {
      render(<AnalyticsPage />)
      fireEvent.click(screen.getByText('Pipeline Health'))
      expect(screen.getByText('12ms')).toBeInTheDocument()
    })

    it('shows Down for unhealthy services', () => {
      render(<AnalyticsPage />)
      fireEvent.click(screen.getByText('Pipeline Health'))
      expect(screen.getByText('Down')).toBeInTheDocument()
      expect(screen.getByText('Admin Ops')).toBeInTheDocument()
    })

    it('shows empty state when no services', () => {
      mockUseServiceHealth.mockReturnValue({ data: [] })
      render(<AnalyticsPage />)
      fireEvent.click(screen.getByText('Pipeline Health'))
      expect(screen.getByText('No service health data')).toBeInTheDocument()
    })
  })
})
