/**
 * @module __tests__/command-center-tabs.test
 * @description Tests for ConfigureTab, ClientsTab, and QueueTab components.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { ConfigureTab } from '@/components/command-center/ConfigureTab'
import { ClientsTab } from '@/components/command-center/ClientsTab'
import { QueueTab } from '@/components/command-center/QueueTab'

// ─── Shared mock data ───────────────────────────────────────────

function makeMockCommandCenter(overrides = {}) {
  return {
    isSuperAdmin: true, userRole: 'super_admin', tenantPlan: 'teams',
    globalStats: { totalCostUsd: 142.30, totalItems: 12450, itemsBySubtask: {}, costByProvider: {}, costByModel: {}, costBySubtask: {}, costTrend: [] },
    tenantStats: {
      tenantId: 't1', itemsConsumed: 3200, attributedCostUsd: 23.45,
      costByProvider: { anthropic: 18.20, openai: 3.10, google: 2.15 },
      costByItemType: { ioc: 12.40, article: 8.50, report: 2.55 },
      consumptionTrend: Array.from({ length: 30 }, (_, i) => ({ date: `2026-03-${String(i + 1).padStart(2, '0')}`, count: 80 + i })),
      budgetUsedPercent: 62, budgetLimitUsd: 37,
    },
    tenantList: [
      { tenantId: 't1', name: 'Acme Corp', plan: 'teams', members: 12, itemsConsumed: 8400, attributedCostUsd: 28.30, status: 'active', usagePercent: 76 },
      { tenantId: 't2', name: 'ThreatDefend', plan: 'enterprise', members: 8, itemsConsumed: 6200, attributedCostUsd: 21.10, status: 'active', usagePercent: 56 },
      { tenantId: 't3', name: 'CyberWatch', plan: 'teams', members: 5, itemsConsumed: 4800, attributedCostUsd: 35.00, status: 'over_limit', usagePercent: 100 },
    ],
    queueStats: { pendingItems: 34, processingRate: 42, stuckItems: 0, oldestAge: '< 2m', bySubtask: { triage: 12, extraction: 8, scoring: 6 } },
    providerKeys: [
      { provider: 'anthropic', keyMasked: 'sk-ant-api0•••abc1', isValid: true, lastTested: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { provider: 'openai', keyMasked: null, isValid: false, lastTested: null, updatedAt: null },
      { provider: 'google', keyMasked: null, isValid: false, lastTested: null, updatedAt: null },
    ],
    isLoading: false, isDemo: false, period: 'month' as const,
    setPeriod: vi.fn(), refetchAll: vi.fn(), isFetching: false,
    setProviderKey: vi.fn(), isSettingKey: false,
    testProviderKey: vi.fn().mockResolvedValue({ success: true }),
    isTestingKey: false,
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
    confidenceModel: 'bayesian' as const,
    setConfidenceModel: vi.fn(), isSavingConfidence: false,
    recommendations: {}, modelCosts: { haiku: 0.80, sonnet: 3, opus: 15 },
    modelAccuracy: { haiku: 78, sonnet: 92, opus: 97 },
    presets: [],
    ...overrides,
  } as any
}

// ─── Mock enrichment hooks for QueueTab ─────────────────────────

vi.mock('@/hooks/use-enrichment-data', () => ({
  useEnrichmentPending: () => ({
    data: {
      data: [
        { id: 'ioc1', normalizedValue: '198.51.100.23', iocType: 'ip', severity: 'high', confidence: 85, createdAt: new Date(Date.now() - 120_000).toISOString() },
        { id: 'ioc2', normalizedValue: 'evil.com', iocType: 'domain', severity: 'critical', confidence: 92, createdAt: new Date(Date.now() - 300_000).toISOString() },
      ],
      total: 2,
    },
    isLoading: false,
  }),
  useTriggerEnrichment: () => ({ mutate: vi.fn(), isPending: false }),
  useBatchEnrichment: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
}))

// ─── ConfigureTab Tests ─────────────────────────────────────────

describe('ConfigureTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders provider key cards', () => {
    render(<ConfigureTab data={makeMockCommandCenter()} aiConfig={makeMockAiConfig()} />)
    expect(screen.getByTestId('provider-card-anthropic')).toBeInTheDocument()
    expect(screen.getByTestId('provider-card-openai')).toBeInTheDocument()
    expect(screen.getByTestId('provider-card-google')).toBeInTheDocument()
  })

  it('shows connected status for anthropic', () => {
    render(<ConfigureTab data={makeMockCommandCenter()} aiConfig={makeMockAiConfig()} />)
    const card = screen.getByTestId('provider-card-anthropic')
    expect(card.textContent).toContain('Connected')
  })

  it('shows not set for openai', () => {
    render(<ConfigureTab data={makeMockCommandCenter()} aiConfig={makeMockAiConfig()} />)
    const card = screen.getByTestId('provider-card-openai')
    expect(card.textContent).toContain('Not set')
  })

  it('renders model assignments table', () => {
    render(<ConfigureTab data={makeMockCommandCenter()} aiConfig={makeMockAiConfig()} />)
    expect(screen.getByTestId('model-assignments-table')).toBeInTheDocument()
  })

  it('shows subtask rows in table', () => {
    render(<ConfigureTab data={makeMockCommandCenter()} aiConfig={makeMockAiConfig()} />)
    expect(screen.getByText('News Feed Processing')).toBeInTheDocument()
    expect(screen.getByText('Triage')).toBeInTheDocument()
    expect(screen.getByText('Extraction')).toBeInTheDocument()
  })

  it('renders confidence model toggle', () => {
    render(<ConfigureTab data={makeMockCommandCenter()} aiConfig={makeMockAiConfig()} />)
    expect(screen.getByTestId('confidence-toggle-section')).toBeInTheDocument()
    expect(screen.getByTestId('confidence-linear')).toBeInTheDocument()
    expect(screen.getByTestId('confidence-bayesian')).toBeInTheDocument()
  })

  it('shows bayesian as active', () => {
    render(<ConfigureTab data={makeMockCommandCenter()} aiConfig={makeMockAiConfig()} />)
    const btn = screen.getByTestId('confidence-bayesian')
    expect(btn.textContent).toContain('Active')
  })

  it('calls setConfidenceModel on click', () => {
    const aiConfig = makeMockAiConfig()
    render(<ConfigureTab data={makeMockCommandCenter()} aiConfig={aiConfig} />)
    fireEvent.click(screen.getByTestId('confidence-linear'))
    expect(aiConfig.setConfidenceModel).toHaveBeenCalledWith('linear')
  })

  it('has save assignments button (disabled when no changes)', () => {
    render(<ConfigureTab data={makeMockCommandCenter()} aiConfig={makeMockAiConfig()} />)
    const btn = screen.getByTestId('save-assignments-btn')
    expect(btn).toBeDisabled()
  })
})

// ─── ClientsTab Tests ───────────────────────────────────────────

describe('ClientsTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders summary cards', () => {
    render(<ClientsTab data={makeMockCommandCenter()} />)
    expect(screen.getByTestId('summary-cards')).toBeInTheDocument()
  })

  it('shows platform cost in summary', () => {
    render(<ClientsTab data={makeMockCommandCenter()} />)
    expect(screen.getByText('$84.40')).toBeInTheDocument() // 28.30 + 21.10 + 35.00
  })

  it('shows active tenant count', () => {
    render(<ClientsTab data={makeMockCommandCenter()} />)
    // 2 active tenants
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders filter bar', () => {
    render(<ClientsTab data={makeMockCommandCenter()} />)
    expect(screen.getByTestId('filter-bar')).toBeInTheDocument()
    expect(screen.getByTestId('tenant-search')).toBeInTheDocument()
    expect(screen.getByTestId('plan-filter')).toBeInTheDocument()
    expect(screen.getByTestId('status-filter')).toBeInTheDocument()
  })

  it('shows tenant names in table', () => {
    render(<ClientsTab data={makeMockCommandCenter()} />)
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByText('ThreatDefend')).toBeInTheDocument()
    expect(screen.getByText('CyberWatch')).toBeInTheDocument()
  })

  it('filters tenants by search query', () => {
    render(<ClientsTab data={makeMockCommandCenter()} />)
    fireEvent.change(screen.getByTestId('tenant-search'), { target: { value: 'acme' } })
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.queryByText('ThreatDefend')).not.toBeInTheDocument()
  })

  it('filters tenants by plan', () => {
    render(<ClientsTab data={makeMockCommandCenter()} />)
    fireEvent.change(screen.getByTestId('plan-filter'), { target: { value: 'enterprise' } })
    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument()
    expect(screen.getByText('ThreatDefend')).toBeInTheDocument()
  })

  it('filters tenants by status', () => {
    render(<ClientsTab data={makeMockCommandCenter()} />)
    fireEvent.change(screen.getByTestId('status-filter'), { target: { value: 'over_limit' } })
    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument()
    expect(screen.getByText('CyberWatch')).toBeInTheDocument()
  })

  it('opens detail drawer on row click', () => {
    render(<ClientsTab data={makeMockCommandCenter()} />)
    fireEvent.click(screen.getByText('Acme Corp'))
    expect(screen.getByTestId('tenant-detail-drawer')).toBeInTheDocument()
  })

  it('closes detail drawer on close button', () => {
    render(<ClientsTab data={makeMockCommandCenter()} />)
    fireEvent.click(screen.getByText('Acme Corp'))
    expect(screen.getByTestId('tenant-detail-drawer')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('close-drawer'))
    expect(screen.queryByTestId('tenant-detail-drawer')).not.toBeInTheDocument()
  })
})

// ─── QueueTab Tests ─────────────────────────────────────────────

describe('QueueTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders queue health bar', () => {
    render(<QueueTab data={makeMockCommandCenter()} />)
    expect(screen.getByTestId('queue-health-bar')).toBeInTheDocument()
  })

  it('shows pending count', () => {
    render(<QueueTab data={makeMockCommandCenter()} />)
    expect(screen.getByText('34')).toBeInTheDocument()
  })

  it('shows processing rate', () => {
    render(<QueueTab data={makeMockCommandCenter()} />)
    expect(screen.getByText('42/min')).toBeInTheDocument()
  })

  it('renders queue depth chart', () => {
    render(<QueueTab data={makeMockCommandCenter()} />)
    expect(screen.getByTestId('queue-depth-chart')).toBeInTheDocument()
  })

  it('shows subtask names in depth chart', () => {
    render(<QueueTab data={makeMockCommandCenter()} />)
    expect(screen.getByText('triage')).toBeInTheDocument()
    expect(screen.getByText('extraction')).toBeInTheDocument()
  })

  it('shows pending IOCs in table', () => {
    render(<QueueTab data={makeMockCommandCenter()} />)
    expect(screen.getByText('198.51.100.23')).toBeInTheDocument()
    expect(screen.getByText('evil.com')).toBeInTheDocument()
  })

  it('shows select all button', () => {
    render(<QueueTab data={makeMockCommandCenter()} />)
    expect(screen.getByTestId('select-all-btn')).toBeInTheDocument()
  })

  it('enables batch enrich when items selected', () => {
    render(<QueueTab data={makeMockCommandCenter()} />)
    // Click first checkbox
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    expect(screen.getByTestId('batch-enrich-btn')).toBeInTheDocument()
  })
})
