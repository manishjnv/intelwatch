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

vi.mock('@/hooks/use-intel-data', () => ({
  useFeeds: () => ({ data: { data: [], total: 0, page: 1, limit: 50 }, isLoading: false, isDemo: true }),
  useToggleFeed: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteFeed: () => ({ mutate: vi.fn(), isPending: false }),
  useForceFetch: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/use-global-catalog', () => ({
  useGlobalCatalog: () => ({ data: [], isLoading: false, isDemo: true }),
  useMySubscriptions: () => ({ data: [], isLoading: false, isDemo: true, subscribe: vi.fn(), unsubscribe: vi.fn(), isSubscribing: false, isUnsubscribing: false }),
  useGlobalPipelineHealth: () => ({ data: { queues: [], pipeline: { articlesProcessed24h: 0, iocsCreated24h: 0, iocsEnriched24h: 0, avgNormalizeLatencyMs: 0, avgEnrichLatencyMs: 0 } }, isLoading: false, isDemo: true }),
}))

vi.mock('@/hooks/use-phase5-data', () => ({
  useUsers: () => ({ data: { data: [], total: 0, page: 1, limit: 50 }, isLoading: false, isDemo: true }),
  useRoles: () => ({ data: { data: [], total: 0, page: 1, limit: 50 }, isLoading: false, isDemo: true }),
  useSIEMIntegrations: () => ({ data: { data: [], total: 0, page: 1, limit: 50 }, isLoading: false, isDemo: true }),
  useWebhooks: () => ({ data: { data: [], total: 0, page: 1, limit: 50 }, isLoading: false, isDemo: true }),
  useIntegrationStats: () => ({ data: { total: 0, active: 0, failing: 0, eventsPerHour: 0, lastSync: null }, isLoading: false, isDemo: true }),
}))

vi.mock('@/hooks/useDebouncedValue', () => ({
  useDebouncedValue: (v: any) => v,
}))

vi.mock('@/components/feed/FeedCard', () => ({
  FeedTypeIcon: () => null, StatusDot: () => null, ReliabilityBar: () => null,
  HealthDot: () => null, FailureSparkline: () => null, formatTime: () => '', computeFeedHealth: () => 0,
}))

// Mock phase6 hooks for SystemTab (lazy-rendered)
vi.mock('@/hooks/use-phase6-data', () => ({
  useSystemHealth: () => ({
    data: { services: [], summary: { healthy: 0, degraded: 0, down: 0, total: 0, uptimePercent: 0, lastUpdated: '' } },
    refetch: vi.fn(), isFetching: false,
  }),
  useQueueHealth: () => ({ data: { queues: [], updatedAt: '' }, refetch: vi.fn(), isFetching: false }),
  useQueueAlerts: () => ({ data: { alerts: [] } }),
  useMaintenanceWindows: () => ({ data: { data: [], total: 0, page: 1, limit: 50 } }),
  useActivateMaintenance: () => ({ mutate: vi.fn(), isPending: false }),
  useDeactivateMaintenance: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateMaintenanceWindow: () => ({ mutate: vi.fn(), isPending: false }),
  useDlqStatus: () => ({ data: { queues: [], totalFailed: 0, updatedAt: '' } }),
  useRetryDlqQueue: () => ({ mutate: vi.fn(), isPending: false }),
  useRetryAllDlq: () => ({ mutate: vi.fn(), isPending: false }),
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

  it('shows 8 tabs for super_admin', () => {
    render(<CommandCenterPage />)
    expect(screen.getByTestId('tab-overview')).toBeInTheDocument()
    expect(screen.getByTestId('tab-configuration')).toBeInTheDocument()
    expect(screen.getByTestId('tab-settings')).toBeInTheDocument()
    expect(screen.getByTestId('tab-users-access')).toBeInTheDocument()
    expect(screen.getByTestId('tab-clients')).toBeInTheDocument()
    expect(screen.getByTestId('tab-billing-plans')).toBeInTheDocument()
    expect(screen.getByTestId('tab-alerts-reports')).toBeInTheDocument()
    expect(screen.getByTestId('tab-system')).toBeInTheDocument()
  })

  it('shows 6 tabs for tenant_admin (no clients, system)', () => {
    mockRole = 'tenant_admin'
    mockCommandCenter.isSuperAdmin = false
    render(<CommandCenterPage />)
    expect(screen.getByTestId('tab-overview')).toBeInTheDocument()
    expect(screen.getByTestId('tab-configuration')).toBeInTheDocument()
    expect(screen.getByTestId('tab-settings')).toBeInTheDocument()
    expect(screen.getByTestId('tab-users-access')).toBeInTheDocument()
    expect(screen.getByTestId('tab-billing-plans')).toBeInTheDocument()
    expect(screen.getByTestId('tab-alerts-reports')).toBeInTheDocument()
    expect(screen.queryByTestId('tab-clients')).not.toBeInTheDocument()
    expect(screen.queryByTestId('tab-system')).not.toBeInTheDocument()
  })

  it('shows KPI strip with stats', () => {
    render(<CommandCenterPage />)
    // Values appear in KPI strip and in OverviewTab KPI cards
    expect(screen.getAllByText('12,450').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('$142.30').length).toBeGreaterThanOrEqual(1)
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

  it('switches to settings tab on click', () => {
    render(<CommandCenterPage />)
    fireEvent.click(screen.getByTestId('tab-settings'))
    expect(screen.getByTestId('settings-tab-admin')).toBeInTheDocument()
  })

  it('switches to clients tab on click', () => {
    render(<CommandCenterPage />)
    fireEvent.click(screen.getByTestId('tab-clients'))
    expect(screen.getByTestId('clients-tab')).toBeInTheDocument()
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
