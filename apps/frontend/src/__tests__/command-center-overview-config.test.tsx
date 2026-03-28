/**
 * @module __tests__/command-center-overview-config.test
 * @description Tests for OverviewTab, ConfigurationTab, and SVG chart components.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { OverviewTab } from '@/components/command-center/OverviewTab'
import { ConfigurationTab } from '@/components/command-center/ConfigurationTab'
import {
  AreaChart, HorizontalBarChart, DonutChart,
  HeatmapGrid, BudgetBar, MiniSparkline,
} from '@/components/command-center/charts'

// ─── Shared mock factories ─────────────────────────────────────

function makeMockCommandCenter(overrides = {}) {
  return {
    isSuperAdmin: true, userRole: 'super_admin', tenantPlan: 'teams',
    globalStats: {
      totalCostUsd: 142.30, totalItems: 12450,
      itemsBySubtask: { triage: 5200, extraction: 3800 },
      costByProvider: { anthropic: 112.40, openai: 18.50, google: 11.40 },
      costByModel: { 'claude-sonnet-4-6': 95.20, 'gpt-4o': 18.50, 'gemini-2.5-pro': 11.40 },
      costBySubtask: { triage: 15.60, extraction: 62.30, classification: 8.40, summarization: 31.20, risk_scoring: 24.80 },
      costTrend: Array.from({ length: 7 }, (_, i) => ({
        date: `2026-03-${String(22 + i).padStart(2, '0')}`,
        cost: Number((18 + Math.sin(i * 0.9) * 6).toFixed(2)),
      })),
    },
    tenantStats: {
      tenantId: 't1', itemsConsumed: 3200, attributedCostUsd: 23.45,
      costByProvider: { anthropic: 18.20, openai: 3.10, google: 2.15 },
      costByItemType: { ioc: 12.40, article: 8.50, report: 2.55 },
      consumptionTrend: Array.from({ length: 30 }, (_, i) => ({
        date: `2026-03-${String(i + 1).padStart(2, '0')}`, count: 80 + i,
      })),
      budgetUsedPercent: 62, budgetLimitUsd: 37,
    },
    tenantList: [
      { tenantId: 't1', name: 'Acme', plan: 'teams', members: 5, itemsConsumed: 1000, attributedCostUsd: 10, status: 'active', usagePercent: 50 },
    ],
    queueStats: { pendingItems: 34, processingRate: 42, stuckItems: 0, oldestAge: '< 2m', bySubtask: {} },
    providerKeys: [],
    isLoading: false, isDemo: false, period: 'month' as const,
    setPeriod: vi.fn(), refetchAll: vi.fn(), isFetching: false,
    setProviderKey: vi.fn(), isSettingKey: false,
    testProviderKey: vi.fn(), isTestingKey: false,
    removeProviderKey: vi.fn(), isRemovingKey: false,
    ...overrides,
  } as any
}

function makeMockAiConfig(overrides = {}) {
  return {
    config: {
      subtasks: [
        { category: 'news_feed', subtask: 'triage', model: 'haiku', recommended: 'haiku', accuracyPct: 78, monthlyCostEstimate: 24 },
        { category: 'news_feed', subtask: 'extraction', model: 'sonnet', recommended: 'sonnet', accuracyPct: 92, monthlyCostEstimate: 90 },
        { category: 'ioc_enrichment', subtask: 'risk_scoring', model: 'sonnet', recommended: 'sonnet', accuracyPct: 94, monthlyCostEstimate: 90 },
      ],
      confidenceModel: 'bayesian',
      costEstimate: { totalMonthly: 204, byCategory: { news_feed: 114, ioc_enrichment: 90 } },
      activePlan: 'teams',
    },
    isLoading: false, error: null, isDemo: false,
    setModel: vi.fn(), isSavingModel: false,
    applyPlan: vi.fn(), isApplyingPlan: false,
    confidenceModel: 'bayesian', setConfidenceModel: vi.fn(), isSavingConfidence: false,
    recommendations: {}, modelCosts: {}, modelAccuracy: {},
    presets: [],
    ...overrides,
  } as any
}

// ─── SVG Chart Component Tests ─────────────────────────────────

describe('AreaChart', () => {
  it('renders with valid data', () => {
    const points = [
      { label: '03-22', value: 18 },
      { label: '03-23', value: 24 },
      { label: '03-24', value: 20 },
    ]
    render(<AreaChart points={points} />)
    expect(screen.getByTestId('cc-area-chart')).toBeInTheDocument()
  })

  it('shows insufficient data for < 2 points', () => {
    render(<AreaChart points={[{ label: 'x', value: 1 }]} />)
    expect(screen.getByText('Insufficient data')).toBeInTheDocument()
  })

  it('renders empty for 0 points', () => {
    render(<AreaChart points={[]} />)
    expect(screen.getByText('Insufficient data')).toBeInTheDocument()
  })
})

describe('HorizontalBarChart', () => {
  it('renders bars sorted by value', () => {
    const items = [
      { label: 'Triage', value: 15.60 },
      { label: 'Extraction', value: 62.30 },
      { label: 'Classification', value: 8.40 },
    ]
    render(<HorizontalBarChart items={items} />)
    expect(screen.getByTestId('cc-horizontal-bars')).toBeInTheDocument()
    expect(screen.getByText('Extraction')).toBeInTheDocument()
  })

  it('shows no data for empty items', () => {
    render(<HorizontalBarChart items={[]} />)
    expect(screen.getByText('No data')).toBeInTheDocument()
  })

  it('limits items to maxItems', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ label: `Item ${i}`, value: i }))
    render(<HorizontalBarChart items={items} maxItems={5} />)
    const bars = screen.getByTestId('cc-horizontal-bars')
    // Should show top 5 items
    expect(bars.children.length).toBe(5)
  })
})

describe('DonutChart', () => {
  it('renders with segments and center label', () => {
    const segments = [
      { label: 'Anthropic', value: 18.20, color: '#8b5cf6' },
      { label: 'OpenAI', value: 3.10, color: '#10b981' },
    ]
    render(<DonutChart segments={segments} centerValue="$21.30" centerLabel="Total" />)
    expect(screen.getByTestId('cc-donut-chart')).toBeInTheDocument()
    expect(screen.getByText('$21.30')).toBeInTheDocument()
    expect(screen.getByText('Anthropic')).toBeInTheDocument()
  })

  it('shows no data for empty segments', () => {
    render(<DonutChart segments={[]} />)
    expect(screen.getByText('No data')).toBeInTheDocument()
  })
})

describe('HeatmapGrid', () => {
  it('renders grid with cells', () => {
    const cells = [
      { row: 'triage', col: '03-22', value: 5.20 },
      { row: 'extraction', col: '03-22', value: 12.10 },
    ]
    render(<HeatmapGrid cells={cells} rows={['triage', 'extraction']} cols={['03-22']} />)
    expect(screen.getByTestId('cc-heatmap')).toBeInTheDocument()
  })

  it('shows no data when rows empty', () => {
    render(<HeatmapGrid cells={[]} rows={[]} cols={['a']} />)
    expect(screen.getByText('No data')).toBeInTheDocument()
  })
})

describe('BudgetBar', () => {
  it('renders with percentage', () => {
    render(<BudgetBar usedPercent={62} />)
    expect(screen.getByTestId('cc-budget-bar')).toBeInTheDocument()
    expect(screen.getByText('62%')).toBeInTheDocument()
  })

  it('clamps above 100', () => {
    render(<BudgetBar usedPercent={150} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('clamps below 0', () => {
    render(<BudgetBar usedPercent={-5} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})

describe('MiniSparkline', () => {
  it('renders with valid values', () => {
    render(<MiniSparkline values={[10, 15, 12, 18, 20]} />)
    expect(screen.getByTestId('cc-mini-sparkline')).toBeInTheDocument()
  })

  it('shows dash for < 2 values', () => {
    render(<MiniSparkline values={[5]} />)
    expect(screen.queryByTestId('cc-mini-sparkline')).not.toBeInTheDocument()
  })
})

// ─── OverviewTab Tests ─────────────────────────────────────────

describe('OverviewTab — Super-Admin', () => {
  it('renders overview tab with KPI cards', () => {
    const data = makeMockCommandCenter()
    render(<OverviewTab data={data} />)
    expect(screen.getByTestId('overview-tab')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-total-cost')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-total-items')).toBeInTheDocument()
  })

  it('shows cost timeline chart', () => {
    const data = makeMockCommandCenter()
    render(<OverviewTab data={data} />)
    expect(screen.getByTestId('chart-cost-timeline')).toBeInTheDocument()
    expect(screen.getByTestId('cc-area-chart')).toBeInTheDocument()
  })

  it('shows cost by subtask and model charts', () => {
    const data = makeMockCommandCenter()
    render(<OverviewTab data={data} />)
    expect(screen.getByTestId('chart-cost-by-subtask')).toBeInTheDocument()
    expect(screen.getByTestId('chart-cost-by-model')).toBeInTheDocument()
  })

  it('shows subtask heatmap', () => {
    const data = makeMockCommandCenter()
    render(<OverviewTab data={data} />)
    expect(screen.getByTestId('chart-subtask-heatmap')).toBeInTheDocument()
  })

  it('displays formatted total cost', () => {
    const data = makeMockCommandCenter()
    render(<OverviewTab data={data} />)
    expect(screen.getByText('$142.30')).toBeInTheDocument()
  })

  it('displays total items processed', () => {
    const data = makeMockCommandCenter()
    render(<OverviewTab data={data} />)
    expect(screen.getByText('12,450')).toBeInTheDocument()
  })
})

describe('OverviewTab — Tenant-Admin', () => {
  it('renders tenant-admin view with consumption charts', () => {
    const data = makeMockCommandCenter({ isSuperAdmin: false })
    render(<OverviewTab data={data} />)
    expect(screen.getByTestId('overview-tab')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-consumed')).toBeInTheDocument()
  })

  it('shows cost by provider donut', () => {
    const data = makeMockCommandCenter({ isSuperAdmin: false })
    render(<OverviewTab data={data} />)
    expect(screen.getByTestId('chart-cost-by-provider')).toBeInTheDocument()
    expect(screen.getByTestId('cc-donut-chart')).toBeInTheDocument()
  })

  it('shows budget gauge', () => {
    const data = makeMockCommandCenter({ isSuperAdmin: false })
    render(<OverviewTab data={data} />)
    expect(screen.getByTestId('chart-budget-gauge')).toBeInTheDocument()
  })

  it('shows consumption timeline', () => {
    const data = makeMockCommandCenter({ isSuperAdmin: false })
    render(<OverviewTab data={data} />)
    expect(screen.getByTestId('chart-consumption-timeline')).toBeInTheDocument()
  })
})

describe('OverviewTab — Free Tier', () => {
  it('shows upgrade prompt for free plan', () => {
    const data = makeMockCommandCenter({ isSuperAdmin: false, tenantPlan: 'free' })
    render(<OverviewTab data={data} />)
    expect(screen.getByText('AI Not Active')).toBeInTheDocument()
    expect(screen.getByText('Upgrade Plan')).toBeInTheDocument()
  })

  it('shows $0.00 cost for free plan', () => {
    const data = makeMockCommandCenter({ isSuperAdmin: false, tenantPlan: 'free' })
    render(<OverviewTab data={data} />)
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })
})

// ─── ConfigurationTab Tests ────────────────────────────────────

describe('ConfigurationTab — Paid Plan', () => {
  it('renders managed banner', () => {
    const data = makeMockCommandCenter({ isSuperAdmin: false })
    const aiConfig = makeMockAiConfig()
    render(<ConfigurationTab data={data} aiConfig={aiConfig} />)
    expect(screen.getByTestId('configuration-tab')).toBeInTheDocument()
    expect(screen.getByText('Managed by platform administrator')).toBeInTheDocument()
  })

  it('shows plan badge', () => {
    const data = makeMockCommandCenter({ isSuperAdmin: false })
    const aiConfig = makeMockAiConfig()
    render(<ConfigurationTab data={data} aiConfig={aiConfig} />)
    expect(screen.getByText('teams')).toBeInTheDocument()
  })

  it('renders read-only model assignments table', () => {
    const data = makeMockCommandCenter({ isSuperAdmin: false })
    const aiConfig = makeMockAiConfig()
    render(<ConfigurationTab data={data} aiConfig={aiConfig} />)
    expect(screen.getByTestId('model-assignments-readonly')).toBeInTheDocument()
    // Subtask names appear in table and possibly cost estimator
    expect(screen.getAllByText('Triage').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Extraction').length).toBeGreaterThanOrEqual(1)
  })

  it('renders cost estimator with slider', () => {
    const data = makeMockCommandCenter({ isSuperAdmin: false })
    const aiConfig = makeMockAiConfig()
    render(<ConfigurationTab data={data} aiConfig={aiConfig} />)
    expect(screen.getByTestId('cost-estimator')).toBeInTheDocument()
    expect(screen.getByTestId('articles-slider')).toBeInTheDocument()
  })

  it('updates cost estimate when slider changes', () => {
    const data = makeMockCommandCenter({ isSuperAdmin: false })
    const aiConfig = makeMockAiConfig()
    render(<ConfigurationTab data={data} aiConfig={aiConfig} />)
    const slider = screen.getByTestId('articles-slider') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '10000' } })
    expect(screen.getByText('10,000')).toBeInTheDocument()
  })

  it('shows confidence model type', () => {
    const data = makeMockCommandCenter({ isSuperAdmin: false })
    const aiConfig = makeMockAiConfig()
    render(<ConfigurationTab data={data} aiConfig={aiConfig} />)
    expect(screen.getByText(/bayesian/i)).toBeInTheDocument()
  })
})

describe('ConfigurationTab — Free Tier', () => {
  it('shows AI not included banner', () => {
    const data = makeMockCommandCenter({ tenantPlan: 'free' })
    const aiConfig = makeMockAiConfig()
    render(<ConfigurationTab data={data} aiConfig={aiConfig} />)
    expect(screen.getByText('AI Not Included')).toBeInTheDocument()
  })

  it('shows all subtasks as Haiku (basic)', () => {
    const data = makeMockCommandCenter({ tenantPlan: 'free' })
    const aiConfig = makeMockAiConfig()
    render(<ConfigurationTab data={data} aiConfig={aiConfig} />)
    const basicCells = screen.getAllByText('Haiku (basic)')
    expect(basicCells.length).toBe(5)
  })

  it('shows upgrade prompt', () => {
    const data = makeMockCommandCenter({ tenantPlan: 'free' })
    const aiConfig = makeMockAiConfig()
    render(<ConfigurationTab data={data} aiConfig={aiConfig} />)
    expect(screen.getByText('Upgrade Plan')).toBeInTheDocument()
  })
})
