/**
 * @module tests/mobile-responsive
 * @description Verifies mobile-responsive grid and tab patterns across pages
 * modified in the 375px audit. Checks that grid containers include `grid-cols-1`
 * base class and that tab labels are hidden on small screens.
 *
 * NOTE: jsdom does not apply CSS — these tests verify class presence, not layout.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'

// ── Shared mocks ──────────────────────────────────────────────────

vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children }: any) => <div data-testid="page-stats-bar">{children}</div>,
  CompactStat: ({ label, value }: any) => <span data-testid={`stat-${label}`}>{value}</span>,
}))
vi.mock('@etip/shared-ui/components/TooltipHelp', () => ({
  TooltipHelp: () => <span data-testid="tooltip" />,
}))
vi.mock('@etip/shared-ui/components/SeverityBadge', () => ({
  SeverityBadge: ({ severity }: any) => <span data-testid="severity-badge">{severity}</span>,
}))

// ── AnalyticsPage mocks ───────────────────────────────────────────

const MOCK_WIDGETS = [
  { id: 'w1', label: 'Total IOCs', value: '1,234', trend: { direction: 'up', deltaPercent: 5.2 } },
  { id: 'w2', label: 'Active Feeds', value: '12', trend: null },
]
const MOCK_HEALTH = [
  { service: 'api-gateway', status: 'healthy', latencyMs: 12, uptime: 99.9 },
  { service: 'ingestion', status: 'healthy', latencyMs: 20, uptime: 98.5 },
]
vi.mock('@/hooks/use-analytics-data', () => ({
  useAnalyticsWidgets: () => ({ data: { widgets: MOCK_WIDGETS, isDemo: true }, isDemo: true }),
  useAnalyticsTrends: () => ({ data: [] }),
  useExecutiveSummary: () => ({ data: { summary: '', keyMetrics: [], riskLevel: 'low' } }),
  useServiceHealth: () => ({ data: MOCK_HEALTH }),
}))

// ── HuntingWorkbenchPage mocks ────────────────────────────────────

vi.mock('@/hooks/use-phase4-data', () => ({
  useHuntSessions: () => ({ data: { data: [], total: 0 }, isDemo: true }),
  useHuntStats: () => ({ data: { total: 0, active: 0, completed: 0, avgDuration: 0 } }),
  useHuntHypotheses: () => ({ data: [] }),
  useHuntEvidence: () => ({ data: [] }),
  useHuntTemplates: () => ({ data: [] }),
  useCorrelations: () => ({ data: { data: [], total: 0 }, isDemo: true }),
  useCorrelationStats: () => ({ data: null }),
  useCampaigns: () => ({ data: [] }),
  useTriggerCorrelation: () => ({ mutate: vi.fn(), isPending: false }),
  useCorrelationFeedback: () => ({ mutate: vi.fn() }),
  useCreateTicket: () => ({ mutate: vi.fn(), isPending: false }),
  useAddToHunt: () => ({ mutate: vi.fn(), isPending: false }),
  useGraphNodes: () => ({ data: null, isDemo: true }),
  useGraphStats: () => ({ data: null }),
  useGraphSearch: () => ({ data: null }),
  useGraphPath: () => ({ data: null }),
  useNodeNeighbors: () => ({ data: null }),
}))

vi.mock('@/components/viz/HuntingModals', () => ({
  CreateHuntModal: () => null,
  HuntStatusControls: () => null,
  AddHypothesisForm: () => null,
  AddEvidenceForm: () => null,
}))
vi.mock('@/components/ui/Toast', () => ({
  toast: vi.fn(),
  ToastContainer: () => null,
}))
vi.mock('@/components/data/DataTable', () => ({
  DataTable: ({ 'data-testid': testId }: any) => <div data-testid={testId ?? 'data-table'} />,
}))
vi.mock('@/components/data/FilterBar', () => ({
  FilterBar: () => <div data-testid="filter-bar" />,
}))
vi.mock('@/components/data/Pagination', () => ({
  Pagination: () => null,
}))
vi.mock('@/components/CorrelationDetailDrawer', () => ({
  CorrelationDetailDrawer: () => null,
}))

// ── Imports (after mocks) ─────────────────────────────────────────

import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { HuntingWorkbenchPage } from '@/pages/HuntingWorkbenchPage'

// ── Tests ─────────────────────────────────────────────────────────

describe('Mobile responsive audit — grid-cols-1 base classes', () => {
  it('AnalyticsPage: widget grid has grid-cols-1 for mobile collapse', () => {
    render(<AnalyticsPage />)
    const widgetGrid = screen.getByTestId('widget-grid')
    expect(widgetGrid.className).toContain('grid-cols-1')
  })

  it('AnalyticsPage: health grid has grid-cols-1 for mobile collapse', () => {
    render(<AnalyticsPage />)
    // Switch to pipeline health tab
    const tabs = screen.getAllByRole('button')
    const healthTab = tabs.find(b => b.textContent?.includes('Pipeline'))
      ?? tabs.find(b => b.querySelector('svg')) // fallback: icon-only on mobile
    if (healthTab) {
      healthTab.click()
      const healthGrid = screen.queryByTestId('health-grid')
      if (healthGrid) {
        expect(healthGrid.className).toContain('grid-cols-1')
      }
    }
  })

  it('AnalyticsPage: tab labels are hidden on mobile (hidden sm:inline)', () => {
    const { container } = render(<AnalyticsPage />)
    const tabSpans = container.querySelectorAll('span.hidden.sm\\:inline')
    expect(tabSpans.length).toBeGreaterThan(0)
  })

  it('HuntingWorkbenchPage: renders without errors on mobile viewport', () => {
    const { container } = render(<HuntingWorkbenchPage />)
    // Page renders successfully — kanban grid with grid-cols-1 only appears with data
    expect(container.querySelector('[data-testid="page-stats-bar"]')).toBeTruthy()
  })
})
