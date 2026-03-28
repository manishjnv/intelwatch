/**
 * @module __tests__/command-center-billing-alerts.test
 * @description Tests for BillingPlansTab and AlertsReportsTab (Command Center Phase F).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@/test/test-utils'
import { BillingPlansTab } from '@/components/command-center/BillingPlansTab'
import { AlertsReportsTab } from '@/components/command-center/AlertsReportsTab'

// ─── Shared mock data ───────────────────────────────────────────

function makeMockCC(overrides = {}) {
  return {
    isSuperAdmin: true, userRole: 'super_admin', tenantPlan: 'teams',
    globalStats: { totalCostUsd: 142.30, totalItems: 12450, itemsBySubtask: {}, costByProvider: {}, costByModel: {}, costBySubtask: {}, costTrend: [] },
    tenantStats: {
      tenantId: 't1', itemsConsumed: 3200, attributedCostUsd: 23.45,
      costByProvider: {}, costByItemType: {},
      consumptionTrend: [], budgetUsedPercent: 62, budgetLimitUsd: 37,
    },
    tenantList: [], queueStats: { pendingItems: 0, processingRate: 0, stuckItems: 0, oldestAge: '0', bySubtask: {} },
    providerKeys: [], isLoading: false, isDemo: false, period: 'month' as const,
    setPeriod: vi.fn(), refetchAll: vi.fn(), isFetching: false,
    setProviderKey: vi.fn(), isSettingKey: false,
    testProviderKey: vi.fn(), isTestingKey: false,
    removeProviderKey: vi.fn(), isRemovingKey: false,
    ...overrides,
  } as any
}

// ─── Mock hooks ─────────────────────────────────────────────────

const mockSubData = {
  planId: 'teams', planName: 'Teams', status: 'active', billingCycle: 'monthly',
  currentPeriodEnd: '2026-04-15T00:00:00.000Z', cancelAtPeriodEnd: false,
  trialEnd: null, couponApplied: null, discountPercent: 0,
}

const mockUsageData = {
  apiCalls: { used: 4200, limit: 50000, resetAt: '2026-04-01' },
  iocCount: { used: 8500, limit: 100000 },
  storageGb: { used: 2.1, limit: 10 },
  seats: { used: 8, limit: 25 },
  period: { start: '2026-03-01', end: '2026-03-31' },
}

const mockInvoices = [
  { id: 'inv-001', date: '2026-03-01T00:00:00.000Z', description: 'Teams Plan', amount: 18999, status: 'paid', invoiceUrl: null, plan: 'Teams' },
  { id: 'inv-002', date: '2026-02-01T00:00:00.000Z', description: 'Teams Plan', amount: 18999, status: 'paid', invoiceUrl: null, plan: 'Teams' },
]

const mockPlans = [
  { id: 'free', name: 'Free', price: 0, priceAnnual: 0, seats: 1, apiCallsPerMonth: 1000, iocLimit: 500, storageGb: 1, features: [] },
  { id: 'starter', name: 'Starter', price: 9999, priceAnnual: 8999, seats: 5, apiCallsPerMonth: 10000, iocLimit: 10000, storageGb: 5, features: [] },
  { id: 'teams', name: 'Teams', price: 18999, priceAnnual: 16999, seats: 25, apiCallsPerMonth: 50000, iocLimit: 100000, storageGb: 10, features: [], highlighted: true },
  { id: 'enterprise', name: 'Enterprise', price: 49999, priceAnnual: 44999, seats: -1, apiCallsPerMonth: -1, iocLimit: -1, storageGb: -1, features: [] },
]

vi.mock('@/hooks/use-phase6-data', () => ({
  useBillingPlans: () => ({ data: mockPlans, isLoading: false, isDemo: false }),
  useUsageMeters: () => ({ data: mockUsageData, isLoading: false, isDemo: false }),
  useCurrentSubscription: () => ({ data: mockSubData, isLoading: false, isDemo: false }),
  usePaymentHistory: () => ({ data: { data: mockInvoices, total: 2, page: 1, limit: 20 }, isLoading: false, isDemo: false }),
  useBillingStats: () => ({ data: { currentPlan: 'Teams', monthlySpend: 18999, nextBillingDate: '2026-04-15', apiUsagePercent: 8 }, isLoading: false, isDemo: false }),
  useApplyCoupon: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false }),
  useUpgradePlan: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelSubscription: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@/hooks/use-plan-limits', () => ({
  usePlanLimits: () => ({
    plans: [
      { id: 'free', planName: 'Free', maxPrivateFeeds: 2, maxGlobalSubscriptions: 5, minFetchIntervalMinutes: 240, retentionDays: 30, aiEnabled: false, dailyTokenBudget: 0 },
      { id: 'starter', planName: 'Starter', maxPrivateFeeds: 10, maxGlobalSubscriptions: 20, minFetchIntervalMinutes: 60, retentionDays: 90, aiEnabled: true, dailyTokenBudget: 50000 },
      { id: 'teams', planName: 'Teams', maxPrivateFeeds: 50, maxGlobalSubscriptions: 100, minFetchIntervalMinutes: 30, retentionDays: 365, aiEnabled: true, dailyTokenBudget: 500000 },
      { id: 'enterprise', planName: 'Enterprise', maxPrivateFeeds: -1, maxGlobalSubscriptions: -1, minFetchIntervalMinutes: 15, retentionDays: -1, aiEnabled: true, dailyTokenBudget: -1 },
    ],
    isLoading: false, error: null, isDemo: false,
    updatePlan: vi.fn(), isUpdating: false,
    resetPlan: vi.fn(), isResetting: false,
    defaults: [],
  }),
}))

const mockRules = [
  { id: 'r1', name: 'Critical IOC Alert', description: 'Alert on critical IOCs', tenantId: 't1', severity: 'critical', condition: { type: 'threshold', entity: 'ioc', field: 'severity', operator: 'eq', value: 'critical' }, enabled: true, channelIds: ['ch1'], escalationPolicyId: null, cooldownMinutes: 15, tags: [], lastTriggeredAt: '2026-03-27T12:00:00Z', triggerCount: 42, createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-27T12:00:00Z' },
  { id: 'r2', name: 'Feed Error Alert', description: 'Alert on feed failures', tenantId: 't1', severity: 'medium', condition: { type: 'threshold', entity: 'feed', field: 'failures', operator: 'gte', value: '3' }, enabled: false, channelIds: [], escalationPolicyId: null, cooldownMinutes: 30, tags: [], lastTriggeredAt: null, triggerCount: 0, createdAt: '2026-03-10T00:00:00Z', updatedAt: '2026-03-10T00:00:00Z' },
]

const mockAlerts = [
  { id: 'a1', ruleId: 'r1', ruleName: 'Critical IOC Alert', tenantId: 't1', severity: 'critical', status: 'open', title: 'Malicious IP detected: 198.51.100.23', description: 'C2 server communication detected', source: {}, acknowledgedBy: null, acknowledgedAt: null, resolvedBy: null, resolvedAt: null, suppressedUntil: null, suppressReason: null, escalationLevel: 0, escalatedAt: null, createdAt: '2026-03-27T14:30:00Z', updatedAt: '2026-03-27T14:30:00Z' },
  { id: 'a2', ruleId: 'r1', ruleName: 'Critical IOC Alert', tenantId: 't1', severity: 'high', status: 'acknowledged', title: 'Suspicious domain: evil.com', description: 'Known phishing domain', source: {}, acknowledgedBy: 'admin', acknowledgedAt: '2026-03-27T15:00:00Z', resolvedBy: null, resolvedAt: null, suppressedUntil: null, suppressReason: null, escalationLevel: 0, escalatedAt: null, createdAt: '2026-03-27T13:00:00Z', updatedAt: '2026-03-27T15:00:00Z' },
]

const mockTemplates = [
  { id: 'tpl-1', type: 'executive', name: 'Weekly Executive Brief', description: 'High-level threat overview', sections: ['IOC Summary', 'Actor Activity', 'CVE Status'], defaultFormat: 'pdf' },
  { id: 'tpl-2', type: 'daily', name: 'Daily Threat Summary', description: 'Day-end threat digest', sections: ['New IOCs', 'Feed Health', 'Alerts'], defaultFormat: 'html' },
]

const mockSchedules = [
  { id: 'sch-1', name: 'Weekly Brief', type: 'weekly', format: 'pdf', cronExpression: '0 9 * * 1', enabled: true, lastRunAt: '2026-03-24T09:00:00Z', nextRunAt: '2026-03-31T09:00:00Z', runCount: 8, createdAt: '2026-02-01T00:00:00Z' },
]

const mockReports = [
  { id: 'rpt-1', title: 'Daily Threat — Mar 27', type: 'daily', format: 'html', status: 'completed', createdAt: '2026-03-27T09:00:00Z', completedAt: '2026-03-27T09:02:00Z', generationTimeMs: 2340, tenantId: 't1' },
]

vi.mock('@/hooks/use-alerting-data', () => ({
  useAlertRules: () => ({ data: mockRules, isLoading: false, isDemo: false }),
  useAlerts: () => ({ data: { data: mockAlerts, total: 2, page: 1, limit: 50 }, isLoading: false, isDemo: false }),
  useAcknowledgeAlert: () => ({ mutate: vi.fn() }),
  useResolveAlert: () => ({ mutate: vi.fn() }),
  useBulkAcknowledge: () => ({ mutate: vi.fn() }),
  useCreateRule: () => ({ mutate: vi.fn() }),
  useToggleRule: () => ({ mutate: vi.fn() }),
  useDeleteRule: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/hooks/use-reporting-data', () => ({
  useReports: () => ({ data: { data: mockReports, total: 1, page: 1, limit: 50 }, isLoading: false, isDemo: false }),
  useReportTemplates: () => ({ data: mockTemplates, isLoading: false, isDemo: false }),
  useReportSchedules: () => ({ data: mockSchedules, isLoading: false, isDemo: false }),
  useCreateReport: () => ({ mutate: vi.fn() }),
  useCreateSchedule: () => ({ mutate: vi.fn() }),
}))

// ═══════════════════════════════════════════════════════════════
// BillingPlansTab Tests
// ═══════════════════════════════════════════════════════════════

describe('BillingPlansTab', () => {
  describe('Subscription sub-tab', () => {
    it('renders tenant subscription card with plan name and status', () => {
      render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: false })} />)
      expect(screen.getByTestId('subscription-tenant')).toBeInTheDocument()
      expect(screen.getByText('Teams Plan')).toBeInTheDocument()
    })

    it('renders super-admin tenant subscriptions table', () => {
      render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: true })} />)
      expect(screen.getByTestId('subscription-admin')).toBeInTheDocument()
      expect(screen.getByTestId('tenant-subscriptions-table')).toBeInTheDocument()
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    })

    it('shows usage meters for tenant users', () => {
      render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: false })} />)
      expect(screen.getByTestId('usage-meters')).toBeInTheDocument()
      expect(screen.getByText('API Calls')).toBeInTheDocument()
      expect(screen.getByText('IOCs')).toBeInTheDocument()
    })
  })

  describe('Invoices sub-tab', () => {
    it('renders invoice history table when Invoices pill is clicked', () => {
      render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: false })} />)
      fireEvent.click(screen.getByText('Invoices'))
      expect(screen.getByTestId('invoices-table')).toBeInTheDocument()
    })

    it('shows download buttons for invoices', () => {
      render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: false })} />)
      fireEvent.click(screen.getByText('Invoices'))
      expect(screen.getByTestId('download-invoice-inv-001')).toBeInTheDocument()
    })
  })

  describe('Plans & Upgrade sub-tab', () => {
    it('shows plan comparison cards for tenant users', () => {
      render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: false })} />)
      fireEvent.click(screen.getByText('Plans & Upgrade'))
      expect(screen.getByTestId('plan-cards')).toBeInTheDocument()
      expect(screen.getByText('Current')).toBeInTheDocument() // current plan badge
    })

    it('shows upgrade CTA for Free plan users', () => {
      render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: false })} />)
      fireEvent.click(screen.getByText('Plans & Upgrade'))
      expect(screen.getByText('Contact Sales')).toBeInTheDocument() // Enterprise
    })

    it('does not show Plans & Upgrade pill for super-admin', () => {
      render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: true })} />)
      expect(screen.queryByText('Plans & Upgrade')).not.toBeInTheDocument()
    })
  })

  describe('Limits sub-tab (super-admin only)', () => {
    it('shows limits table with plan quotas', () => {
      render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: true })} />)
      fireEvent.click(screen.getByText('Limits'))
      expect(screen.getByTestId('limits-table')).toBeInTheDocument()
    })

    it('supports inline editing on limit cells', () => {
      render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: true })} />)
      fireEvent.click(screen.getByText('Limits'))
      const cell = screen.getByTestId('limit-cell-free-maxPrivateFeeds')
      fireEvent.click(cell)
      expect(screen.getByTestId('edit-input-free-maxPrivateFeeds')).toBeInTheDocument()
    })

    it('does not show Limits pill for tenant-admin', () => {
      render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: false })} />)
      expect(screen.queryByText('Limits')).not.toBeInTheDocument()
    })
  })

  describe('Offers sub-tab', () => {
    it('shows coupon input for tenant users', () => {
      render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: false })} />)
      fireEvent.click(screen.getByText('Offers'))
      expect(screen.getByTestId('coupon-input')).toBeInTheDocument()
      expect(screen.getByTestId('apply-coupon-btn')).toBeInTheDocument()
    })

    it('shows coupon management table for super-admin', () => {
      render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: true })} />)
      fireEvent.click(screen.getByText('Offers'))
      expect(screen.getByTestId('coupons-table')).toBeInTheDocument()
      expect(screen.getByText('LAUNCH50')).toBeInTheDocument()
    })
  })

  describe('Billing Info sub-tab', () => {
    it('shows payment method and billing address for tenant users', () => {
      render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: false })} />)
      fireEvent.click(screen.getByText('Billing Info'))
      expect(screen.getByTestId('billing-info')).toBeInTheDocument()
      expect(screen.getByText('•••• •••• •••• 4242')).toBeInTheDocument()
    })

    it('does not show Billing Info pill for super-admin', () => {
      render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: true })} />)
      expect(screen.queryByText('Billing Info')).not.toBeInTheDocument()
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// AlertsReportsTab Tests
// ═══════════════════════════════════════════════════════════════

describe('AlertsReportsTab', () => {
  describe('Alert Rules sub-tab', () => {
    it('renders rules table with existing rules', () => {
      render(<AlertsReportsTab data={makeMockCC()} />)
      const table = screen.getByTestId('rules-table')
      expect(table).toBeInTheDocument()
      expect(within(table).getByText('Critical IOC Alert')).toBeInTheDocument()
      expect(within(table).getByText('Feed Error Alert')).toBeInTheDocument()
    })

    it('shows quick template buttons', () => {
      render(<AlertsReportsTab data={makeMockCC()} />)
      expect(screen.getByTestId('quick-template-critical-ioc-alert')).toBeInTheDocument()
      expect(screen.getByTestId('quick-template-new-cve-for-my-stack')).toBeInTheDocument()
      expect(screen.getByTestId('quick-template-feed-error-alert')).toBeInTheDocument()
    })

    it('opens create rule modal when New Rule button is clicked', () => {
      render(<AlertsReportsTab data={makeMockCC()} />)
      fireEvent.click(screen.getByTestId('create-rule-btn'))
      expect(screen.getByTestId('create-rule-modal')).toBeInTheDocument()
      expect(screen.getByTestId('rule-name-input')).toBeInTheDocument()
    })

    it('shows toggle and delete actions per rule', () => {
      render(<AlertsReportsTab data={makeMockCC()} />)
      expect(screen.getByTestId('toggle-rule-r1')).toBeInTheDocument()
      expect(screen.getByTestId('delete-rule-r1')).toBeInTheDocument()
    })
  })

  describe('Alert History sub-tab', () => {
    it('renders alert history table with alerts', () => {
      render(<AlertsReportsTab data={makeMockCC()} />)
      fireEvent.click(screen.getByText('Alert History'))
      expect(screen.getByTestId('alerts-table')).toBeInTheDocument()
    })

    it('shows acknowledge and resolve buttons for open alerts', () => {
      render(<AlertsReportsTab data={makeMockCC()} />)
      fireEvent.click(screen.getByText('Alert History'))
      expect(screen.getByTestId('ack-a1')).toBeInTheDocument()
      expect(screen.getByTestId('resolve-a1')).toBeInTheDocument()
    })

    it('shows severity and status filter dropdowns', () => {
      render(<AlertsReportsTab data={makeMockCC()} />)
      fireEvent.click(screen.getByText('Alert History'))
      expect(screen.getByTestId('severity-filter')).toBeInTheDocument()
      expect(screen.getByTestId('status-filter')).toBeInTheDocument()
    })

    it('expands alert detail on row click', () => {
      render(<AlertsReportsTab data={makeMockCC()} />)
      fireEvent.click(screen.getByText('Alert History'))
      // Click on the rule name text to expand
      fireEvent.click(screen.getByText('Malicious IP detected: 198.51.100.23'))
      expect(screen.getByTestId('alert-detail-a1')).toBeInTheDocument()
    })
  })

  describe('Report Templates sub-tab', () => {
    it('renders template cards grid', () => {
      render(<AlertsReportsTab data={makeMockCC()} />)
      fireEvent.click(screen.getByText('Report Templates'))
      expect(screen.getByTestId('template-cards')).toBeInTheDocument()
      expect(screen.getByText('Weekly Executive Brief')).toBeInTheDocument()
      expect(screen.getByText('Daily Threat Summary')).toBeInTheDocument()
    })

    it('shows section badges on template cards', () => {
      render(<AlertsReportsTab data={makeMockCC()} />)
      fireEvent.click(screen.getByText('Report Templates'))
      expect(screen.getByText('IOC Summary')).toBeInTheDocument()
      expect(screen.getByText('Actor Activity')).toBeInTheDocument()
    })
  })

  describe('Generate & Schedule sub-tab', () => {
    it('shows generate report and create schedule buttons', () => {
      render(<AlertsReportsTab data={makeMockCC()} />)
      fireEvent.click(screen.getByText('Generate & Schedule'))
      expect(screen.getByTestId('generate-report-btn')).toBeInTheDocument()
      expect(screen.getByTestId('create-schedule-btn')).toBeInTheDocument()
    })

    it('opens generate report modal', () => {
      render(<AlertsReportsTab data={makeMockCC()} />)
      fireEvent.click(screen.getByText('Generate & Schedule'))
      fireEvent.click(screen.getByTestId('generate-report-btn'))
      expect(screen.getByTestId('generate-report-modal')).toBeInTheDocument()
      expect(screen.getByTestId('report-title-input')).toBeInTheDocument()
    })

    it('shows active schedules list', () => {
      render(<AlertsReportsTab data={makeMockCC()} />)
      fireEvent.click(screen.getByText('Generate & Schedule'))
      expect(screen.getByText('Weekly Brief')).toBeInTheDocument()
    })

    it('shows recent reports table', () => {
      render(<AlertsReportsTab data={makeMockCC()} />)
      fireEvent.click(screen.getByText('Generate & Schedule'))
      expect(screen.getByTestId('recent-reports-table')).toBeInTheDocument()
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// Role Gating Tests
// ═══════════════════════════════════════════════════════════════

describe('Role gating', () => {
  it('super-admin sees Limits tab but not Plans & Upgrade or Billing Info', () => {
    render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: true })} />)
    expect(screen.getByText('Limits')).toBeInTheDocument()
    expect(screen.queryByText('Plans & Upgrade')).not.toBeInTheDocument()
    expect(screen.queryByText('Billing Info')).not.toBeInTheDocument()
  })

  it('tenant-admin sees Plans & Upgrade and Billing Info but not Limits', () => {
    render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: false })} />)
    expect(screen.getByText('Plans & Upgrade')).toBeInTheDocument()
    expect(screen.getByText('Billing Info')).toBeInTheDocument()
    expect(screen.queryByText('Limits')).not.toBeInTheDocument()
  })

  it('both roles see Subscription, Invoices, and Offers tabs', () => {
    // Super-admin
    const { unmount } = render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: true })} />)
    expect(screen.getByText('Subscription')).toBeInTheDocument()
    expect(screen.getByText('Invoices')).toBeInTheDocument()
    expect(screen.getByText('Offers')).toBeInTheDocument()
    unmount()

    // Tenant-admin
    render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: false })} />)
    expect(screen.getByText('Subscription')).toBeInTheDocument()
    expect(screen.getByText('Invoices')).toBeInTheDocument()
    expect(screen.getByText('Offers')).toBeInTheDocument()
  })

  it('free user sees upgrade CTA on Plans & Upgrade tab', () => {
    // Mock subscription to return Free plan
    render(<BillingPlansTab data={makeMockCC({ isSuperAdmin: false })} />)
    fireEvent.click(screen.getByText('Plans & Upgrade'))
    expect(screen.getByTestId('plans-upgrade')).toBeInTheDocument()
  })
})
