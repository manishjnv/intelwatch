/**
 * @module __tests__/command-center-page.test
 * @description Tests for CommandCenterPage shell — tabs, KPI strip, role-gating.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { CommandCenterPage } from '@/pages/CommandCenterPage'

// ─── Mock auth store ────────────────────────────────────────────

let mockRole = 'super_admin'
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: any) => any) => selector({
    user: { id: 'u1', email: 'a@test.com', displayName: 'Admin', role: mockRole, tenantId: 't1', avatarUrl: null },
    accessToken: 'tok', tenant: { id: 't1', name: 'Test', slug: 'test', plan: 'teams' },
  }),
}))

// ─── Mock hooks ─────────────────────────────────────────────────

const mockCommandCenter = {
  isSuperAdmin: true, userRole: 'super_admin', tenantPlan: 'teams',
  globalStats: { totalCostUsd: 142.30, totalItems: 12450, itemsBySubtask: {}, costByProvider: {}, costByModel: {}, costBySubtask: {}, costTrend: [] },
  tenantStats: { tenantId: 't1', itemsConsumed: 3200, attributedCostUsd: 23.45, costByProvider: {}, costByItemType: {}, consumptionTrend: [], budgetUsedPercent: 62, budgetLimitUsd: 37 },
  tenantList: [
    { tenantId: 't1', name: 'Acme', plan: 'teams', members: 5, itemsConsumed: 1000, attributedCostUsd: 10, status: 'active', usagePercent: 50 },
    { tenantId: 't2', name: 'Bad', plan: 'free', members: 1, itemsConsumed: 50, attributedCostUsd: 0, status: 'over_limit', usagePercent: 100 },
  ],
  queueStats: { pendingItems: 34, processingRate: 42, stuckItems: 0, oldestAge: '< 2m', bySubtask: {} },
  providerKeys: [{ provider: 'anthropic', keyMasked: 'sk-***', isValid: true, lastTested: null, updatedAt: null }],
  isLoading: false, isDemo: false, period: 'month' as const,
  setPeriod: vi.fn(), refetchAll: vi.fn(), isFetching: false,
  setProviderKey: vi.fn(), isSettingKey: false,
  testProviderKey: vi.fn(), isTestingKey: false,
  removeProviderKey: vi.fn(), isRemovingKey: false,
}

vi.mock('@/hooks/use-command-center', () => ({
  useCommandCenter: () => mockCommandCenter,
}))

vi.mock('@/hooks/use-global-ai-config', () => ({
  useGlobalAiConfig: () => ({
    config: { subtasks: [], confidenceModel: 'bayesian', costEstimate: { totalMonthly: 0, byCategory: {} }, activePlan: null },
    isLoading: false, error: null, isDemo: true,
    setModel: vi.fn(), isSavingModel: false,
    applyPlan: vi.fn(), isApplyingPlan: false,
    confidenceModel: 'bayesian', setConfidenceModel: vi.fn(), isSavingConfidence: false,
    recommendations: {}, modelCosts: {}, modelAccuracy: {}, presets: [],
  }),
}))

vi.mock('@/hooks/use-enrichment-data', () => ({
  useEnrichmentPending: () => ({ data: { data: [], total: 0 }, isLoading: false }),
  useTriggerEnrichment: () => ({ mutate: vi.fn(), isPending: false }),
  useBatchEnrichment: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
}))

describe('CommandCenterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRole = 'super_admin'
    mockCommandCenter.isSuperAdmin = true
    mockCommandCenter.isLoading = false
  })

  it('renders page shell with title', () => {
    render(<CommandCenterPage />)
    expect(screen.getByText('Command Center')).toBeInTheDocument()
  })

  it('shows 5 tabs for super_admin', () => {
    render(<CommandCenterPage />)
    expect(screen.getByTestId('tab-overview')).toBeInTheDocument()
    expect(screen.getByTestId('tab-configuration')).toBeInTheDocument()
    expect(screen.getByTestId('tab-queue')).toBeInTheDocument()
    expect(screen.getByTestId('tab-configure')).toBeInTheDocument()
    expect(screen.getByTestId('tab-clients')).toBeInTheDocument()
  })

  it('shows only 2 tabs for tenant_admin', () => {
    mockRole = 'tenant_admin'
    mockCommandCenter.isSuperAdmin = false
    render(<CommandCenterPage />)
    expect(screen.getByTestId('tab-overview')).toBeInTheDocument()
    expect(screen.getByTestId('tab-configuration')).toBeInTheDocument()
    expect(screen.queryByTestId('tab-queue')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tab-configure')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tab-clients')).not.toBeInTheDocument()
  })

  it('shows KPI strip with stats', () => {
    render(<CommandCenterPage />)
    expect(screen.getByText('12,450')).toBeInTheDocument()
    expect(screen.getByText('$142.30')).toBeInTheDocument()
  })

  it('shows period picker buttons', () => {
    render(<CommandCenterPage />)
    expect(screen.getByTestId('period-day')).toBeInTheDocument()
    expect(screen.getByTestId('period-week')).toBeInTheDocument()
    expect(screen.getByTestId('period-month')).toBeInTheDocument()
  })

  it('calls setPeriod when clicking period button', () => {
    render(<CommandCenterPage />)
    fireEvent.click(screen.getByTestId('period-week'))
    expect(mockCommandCenter.setPeriod).toHaveBeenCalledWith('week')
  })

  it('has export CSV button', () => {
    render(<CommandCenterPage />)
    expect(screen.getByTestId('export-csv')).toBeInTheDocument()
  })

  it('has refresh button', () => {
    render(<CommandCenterPage />)
    expect(screen.getByTestId('refresh-btn')).toBeInTheDocument()
  })

  it('calls refetchAll when clicking refresh', () => {
    render(<CommandCenterPage />)
    fireEvent.click(screen.getByTestId('refresh-btn'))
    expect(mockCommandCenter.refetchAll).toHaveBeenCalled()
  })

  it('switches to queue tab on click', () => {
    render(<CommandCenterPage />)
    fireEvent.click(screen.getByTestId('tab-queue'))
    expect(screen.getByTestId('queue-tab')).toBeInTheDocument()
  })

  it('switches to configure tab on click', () => {
    render(<CommandCenterPage />)
    fireEvent.click(screen.getByTestId('tab-configure'))
    expect(screen.getByTestId('configure-tab')).toBeInTheDocument()
  })

  it('switches to clients tab on click', () => {
    render(<CommandCenterPage />)
    fireEvent.click(screen.getByTestId('tab-clients'))
    expect(screen.getByTestId('clients-tab')).toBeInTheDocument()
  })

  it('shows queue badge when pending items > 0', () => {
    render(<CommandCenterPage />)
    const badge = screen.getByTestId('tab-queue')
    expect(badge.textContent).toContain('34')
  })

  it('shows clients badge when over_limit tenants exist', () => {
    render(<CommandCenterPage />)
    const badge = screen.getByTestId('tab-clients')
    expect(badge.textContent).toContain('1')
  })

  it('shows loading skeletons when isLoading', () => {
    mockCommandCenter.isLoading = true
    render(<CommandCenterPage />)
    const skeletons = screen.getByTestId('command-center-page').querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows demo badge when isDemo', () => {
    mockCommandCenter.isDemo = true
    render(<CommandCenterPage />)
    expect(screen.getByTestId('demo-badge')).toBeInTheDocument()
    mockCommandCenter.isDemo = false
  })
})
