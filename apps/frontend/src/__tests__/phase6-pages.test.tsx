/**
 * Tests for Phase 6 frontend pages: BillingPage and AdminOpsPage.
 * Covers: rendering, tabs, demo fallback, plan cards, usage meters,
 * upgrade/cancel modals, coupon input, payment history, service health
 * grid, maintenance rows, tenant actions, audit log + CSV export.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'

// ─── Mock Phase 6 data hooks ────────────────────────────────────

const mockUseBillingPlans = vi.fn()
const mockUseUsageMeters = vi.fn()
const mockUseCurrentSubscription = vi.fn()
const mockUsePaymentHistory = vi.fn()
const mockUseBillingStats = vi.fn()
const mockUseApplyCoupon = vi.fn()
const mockUseUpgradePlan = vi.fn()
const mockUseCancelSubscription = vi.fn()
const mockUseSystemHealth = vi.fn()
const mockUseMaintenanceWindows = vi.fn()
const mockUseAdminTenants = vi.fn()
const mockUseAdminAuditLog = vi.fn()
const mockUseAdminStats = vi.fn()
const mockUseActivateMaintenance = vi.fn()
const mockUseDeactivateMaintenance = vi.fn()
const mockUseSuspendTenant = vi.fn()
const mockUseReinstateTenant = vi.fn()
const mockUseChangeTenantPlan = vi.fn()
const mockUseOnboardingWizard = vi.fn()
const mockUseWelcomeDashboard = vi.fn()
const mockUsePipelineHealth = vi.fn()
const mockUseModuleReadiness = vi.fn()
const mockUseReadinessCheck = vi.fn()
const mockUseCompleteStep = vi.fn()
const mockUseSkipStep = vi.fn()
const mockUseSeedDemo = vi.fn()

vi.mock('@/hooks/use-phase6-data', () => ({
  useBillingPlans:         () => mockUseBillingPlans(),
  useUsageMeters:          () => mockUseUsageMeters(),
  useCurrentSubscription:  () => mockUseCurrentSubscription(),
  usePaymentHistory:       (...args: any[]) => mockUsePaymentHistory(...args),
  useBillingStats:         () => mockUseBillingStats(),
  useApplyCoupon:          () => mockUseApplyCoupon(),
  useUpgradePlan:          () => mockUseUpgradePlan(),
  useCancelSubscription:   () => mockUseCancelSubscription(),
  useSystemHealth:         () => mockUseSystemHealth(),
  useMaintenanceWindows:   () => mockUseMaintenanceWindows(),
  useAdminTenants:         () => mockUseAdminTenants(),
  useAdminAuditLog:        (...args: any[]) => mockUseAdminAuditLog(...args),
  useAdminStats:           () => mockUseAdminStats(),
  useActivateMaintenance:  () => mockUseActivateMaintenance(),
  useDeactivateMaintenance:() => mockUseDeactivateMaintenance(),
  useSuspendTenant:        () => mockUseSuspendTenant(),
  useReinstateTenant:      () => mockUseReinstateTenant(),
  useChangeTenantPlan:     () => mockUseChangeTenantPlan(),
  useOnboardingWizard:     () => mockUseOnboardingWizard(),
  useWelcomeDashboard:     () => mockUseWelcomeDashboard(),
  usePipelineHealth:       () => mockUsePipelineHealth(),
  useModuleReadiness:      () => mockUseModuleReadiness(),
  useReadinessCheck:       () => mockUseReadinessCheck(),
  useCompleteStep:         () => mockUseCompleteStep(),
  useSkipStep:             () => mockUseSkipStep(),
  useSeedDemo:             () => mockUseSeedDemo(),
}))

// Mock shared-ui components
vi.mock('@etip/shared-ui/components/PageStatsBar', () => ({
  PageStatsBar: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div data-testid="page-stats-bar" data-title={title}>{children}</div>
  ),
  CompactStat: ({ label, value }: { label: string; value: string }) => (
    <span data-testid={`stat-${label}`}>{label}: {value}</span>
  ),
}))

// ─── Test Data ───────────────────────────────────────────────────

const PLAN_FREE = {
  id: 'free', name: 'Free', price: 0, priceAnnual: 0,
  seats: 2, apiCallsPerMonth: 10_000, iocLimit: 10_000, storageGb: 1,
  features: ['Up to 2 users', '10K API calls / month'],
}
const PLAN_TEAMS = {
  id: 'teams', name: 'Teams', price: 18_999, priceAnnual: 14_999,
  seats: 25, apiCallsPerMonth: 250_000, iocLimit: 250_000, storageGb: 50,
  features: ['Up to 25 users', '250K API calls / month'],
  highlighted: true,
}
const PLANS = [PLAN_FREE, PLAN_TEAMS]

const SUBSCRIPTION = {
  planId: 'teams', planName: 'Teams', status: 'active',
  billingCycle: 'annual', currentPeriodEnd: new Date(Date.now() + 8 * 86_400_000).toISOString(),
  cancelAtPeriodEnd: false, trialEnd: null, couponApplied: 'LAUNCH20', discountPercent: 20,
}

const USAGE = {
  apiCalls: { used: 847_234, limit: 1_000_000, resetAt: new Date(Date.now() + 8 * 86_400_000).toISOString() },
  iocCount: { used: 312_445, limit: 500_000 },
  storageGb: { used: 42.7, limit: 100 },
  seats: { used: 12, limit: 50 },
  period: {
    start: new Date(Date.now() - 22 * 86_400_000).toISOString(),
    end: new Date(Date.now() + 8 * 86_400_000).toISOString(),
  },
}

const PAYMENT = {
  id: 'inv-001', date: new Date(Date.now() - 8 * 86_400_000).toISOString(),
  description: 'Teams Plan — Annual', amount: 179_988,
  status: 'paid', invoiceUrl: '/api/v1/billing/invoices/inv-001/download', plan: 'Teams',
}

const BILLING_STATS = {
  currentPlan: 'Teams', monthlySpend: 14_999,
  nextBillingDate: new Date(Date.now() + 8 * 86_400_000).toISOString(),
  apiUsagePercent: 84.7,
}

const SERVICE_HEALTHY = {
  name: 'api-gateway', status: 'healthy', uptime: 99.98,
  responseMs: 12, lastChecked: new Date().toISOString(), port: 3001,
  version: '0.1.0', errorRate: 0.01,
}
const SERVICE_DEGRADED = {
  name: 'ai-enrichment', status: 'degraded', uptime: 98.20,
  responseMs: 340, lastChecked: new Date().toISOString(), port: 3006,
  version: '0.3.0', errorRate: 1.80,
}

const HEALTH_SUMMARY = {
  healthy: 17, degraded: 1, down: 0, total: 18,
  uptimePercent: 99.87, lastUpdated: new Date().toISOString(),
}

const MAINT_ACTIVE = {
  id: 'mw-1', title: 'Neo4j Index Rebuild', description: 'Rebuilding indices.',
  status: 'active', startsAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  endsAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
  affectedServices: ['threat-graph'], createdBy: 'Manish Kumar',
  createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
}
const MAINT_SCHEDULED = {
  id: 'mw-2', title: 'AI Rate Limit Window', description: 'AI pause for quota reset.',
  status: 'scheduled', startsAt: new Date(Date.now() + 86_400_000).toISOString(),
  endsAt: new Date(Date.now() + 90_000_000).toISOString(),
  affectedServices: ['ai-enrichment'], createdBy: 'Manish Kumar',
  createdAt: new Date(Date.now() - 86_400_000).toISOString(),
}

const TENANT_ACTIVE = {
  id: 'tenant-1', name: 'Acme Security', domain: 'acme-sec.com', plan: 'Pro',
  status: 'active', seats: 50, usedSeats: 23, iocCount: 98_234,
  createdAt: new Date(Date.now() - 60 * 86_400_000).toISOString(),
  lastActiveAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
}
const TENANT_SUSPENDED = {
  id: 'tenant-5', name: 'Blocked Corp', domain: 'blocked.example', plan: 'Free',
  status: 'suspended', seats: 2, usedSeats: 0, iocCount: 512,
  createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
  lastActiveAt: new Date(Date.now() - 15 * 86_400_000).toISOString(),
}

const AUDIT_ENTRY = {
  id: 'adm-1', timestamp: new Date().toISOString(),
  adminName: 'Manish Kumar', action: 'maintenance.activate',
  targetType: 'maintenance_window', targetId: 'mw-1',
  details: 'Activated Neo4j Index Rebuild window', ip: '72.61.227.64',
}

const ADMIN_STATS = {
  totalTenants: 5, activeTenants: 3, suspendedTenants: 1,
  maintenanceWindowsThisMonth: 4, backupsLast7Days: 7, openAlerts: 1,
}

// ─── Default mock return helpers ─────────────────────────────────

function mockMutation() {
  return { mutate: vi.fn(), isPending: false }
}

function mockQuery<T>(data: T, isDemo = false) {
  return { data, isDemo, isLoading: false, error: null }
}

// ─── BILLING PAGE TESTS ──────────────────────────────────────────

describe('BillingPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUseBillingPlans.mockReturnValue(mockQuery(PLANS, true))
    mockUseUsageMeters.mockReturnValue(mockQuery(USAGE))
    mockUseCurrentSubscription.mockReturnValue(mockQuery(SUBSCRIPTION))
    mockUsePaymentHistory.mockReturnValue(mockQuery({ data: [PAYMENT], total: 1, page: 1, limit: 20 }))
    mockUseBillingStats.mockReturnValue(mockQuery(BILLING_STATS))
    mockUseApplyCoupon.mockReturnValue(mockMutation())
    mockUseUpgradePlan.mockReturnValue(mockMutation())
    mockUseCancelSubscription.mockReturnValue(mockMutation())
  })

  it('renders page stats bar', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    expect(screen.getByTestId('page-stats-bar')).toBeInTheDocument()
  })

  it('shows current plan in stats bar', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    expect(screen.getByTestId('stat-Current Plan')).toHaveTextContent('Teams')
  })

  it('renders Plans & Upgrade tab by default', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    expect(screen.getByText('Plans & Upgrade')).toBeInTheDocument()
  })

  it('renders all 3 tabs', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    expect(screen.getByText('Plans & Upgrade')).toBeInTheDocument()
    expect(screen.getByText('Usage Meters')).toBeInTheDocument()
    expect(screen.getByText('Payment History')).toBeInTheDocument()
  })

  it('renders billing cycle toggle buttons', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    expect(screen.getByText('Monthly')).toBeInTheDocument()
    expect(screen.getByText('Annual')).toBeInTheDocument()
  })

  it('renders plan names', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    // 'Free' appears in multiple places (card header + cancel info text)
    expect(screen.getAllByText('Free').length).toBeGreaterThan(0)
    // 'Teams' appears in card header and CURRENT badge
    expect(screen.getAllByText('Teams').length).toBeGreaterThan(0)
  })

  it('shows CURRENT badge on active plan', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    expect(screen.getByText('CURRENT')).toBeInTheDocument()
  })

  it('shows MOST POPULAR on highlighted plan', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    expect(screen.getByText('MOST POPULAR')).toBeInTheDocument()
  })

  it('shows plan features', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    expect(screen.getByText('Up to 2 users')).toBeInTheDocument()
    expect(screen.getByText('Up to 25 users')).toBeInTheDocument()
  })

  it('shows subscription status banner', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(screen.getByText('annual')).toBeInTheDocument()
  })

  it('shows coupon applied in stats', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    expect(screen.getByTestId('stat-Coupon')).toHaveTextContent('LAUNCH20')
  })

  it('renders promo code input section', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    expect(screen.getByText('Promo Code')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter code')).toBeInTheDocument()
  })

  it('renders billing info section', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    expect(screen.getByText('Billing Info')).toBeInTheDocument()
    expect(screen.getByText(/All prices include 18% GST/)).toBeInTheDocument()
  })

  it('switches to Usage Meters tab', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    fireEvent.click(screen.getByText('Usage Meters'))
    expect(screen.getByText('API Calls')).toBeInTheDocument()
    expect(screen.getByText('IOC Count')).toBeInTheDocument()
    expect(screen.getByText('Storage')).toBeInTheDocument()
    expect(screen.getByText('Seats')).toBeInTheDocument()
  })

  it('shows billing period info on usage tab', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    fireEvent.click(screen.getByText('Usage Meters'))
    expect(screen.getByText('Billing Period')).toBeInTheDocument()
    expect(screen.getByText('API Reset')).toBeInTheDocument()
  })

  it('shows CISO note on usage tab', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    fireEvent.click(screen.getByText('Usage Meters'))
    expect(screen.getByText(/CISO Note/)).toBeInTheDocument()
  })

  it('switches to Payment History tab', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    fireEvent.click(screen.getByText('Payment History'))
    expect(screen.getByText('Teams Plan — Annual')).toBeInTheDocument()
  })

  it('shows payment status badge', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    fireEvent.click(screen.getByText('Payment History'))
    expect(screen.getByText('paid')).toBeInTheDocument()
  })

  it('shows invoice count in history tab', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    fireEvent.click(screen.getByText('Payment History'))
    expect(screen.getByText(/1 invoice/)).toBeInTheDocument()
  })

  it('opens upgrade/downgrade modal when plan button clicked', async () => {
    // Current plan = Teams → Free plan shows 'Downgrade' button
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    // Use role selector to find the Downgrade button (Free < Pro = current)
    const planBtn = screen.getByRole('button', { name: /Downgrade/ })
    fireEvent.click(planBtn)
    expect(screen.getByText(/Upgrade to|Downgrade to/)).toBeInTheDocument()
  })

  it('closes upgrade/downgrade modal when Cancel clicked', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    const planBtn = screen.getByRole('button', { name: /Downgrade/ })
    fireEvent.click(planBtn)
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    fireEvent.click(cancelBtn)
    expect(screen.queryByText(/Upgrade to|Downgrade to/)).not.toBeInTheDocument()
  })

  it('shows cancel subscription button for current plan', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    expect(screen.getByText('Cancel Subscription')).toBeInTheDocument()
  })

  it('opens cancel modal when Cancel Subscription clicked', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    fireEvent.click(screen.getByText('Cancel Subscription'))
    expect(screen.getByText('Cancel Subscription?')).toBeInTheDocument()
    expect(screen.getByText('Keep Subscription')).toBeInTheDocument()
  })

  it('closes cancel modal when Keep Subscription clicked', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    fireEvent.click(screen.getByText('Cancel Subscription'))
    fireEvent.click(screen.getByText('Keep Subscription'))
    expect(screen.queryByText('Cancel Subscription?')).not.toBeInTheDocument()
  })

  it('shows annual savings text', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    expect(screen.getByText(/Save up to 20%/)).toBeInTheDocument()
  })

  it('switches billing cycle to monthly', async () => {
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    fireEvent.click(screen.getByText('Monthly'))
    // Monthly button should become active (has bg-accent class internally)
    expect(screen.getByText('Monthly')).toBeInTheDocument()
  })

  it('renders with empty plans list gracefully', async () => {
    mockUseBillingPlans.mockReturnValue(mockQuery([]))
    const { BillingPage } = await import('@/pages/BillingPage')
    render(<BillingPage />)
    expect(screen.getByTestId('page-stats-bar')).toBeInTheDocument()
  })
})

// ─── ADMIN OPS PAGE TESTS ────────────────────────────────────────

describe('AdminOpsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUseSystemHealth.mockReturnValue(mockQuery(
      { services: [SERVICE_HEALTHY, SERVICE_DEGRADED], summary: HEALTH_SUMMARY },
      true,
    ))
    mockUseMaintenanceWindows.mockReturnValue(mockQuery(
      { data: [MAINT_ACTIVE, MAINT_SCHEDULED], total: 2, page: 1, limit: 50 },
    ))
    mockUseAdminTenants.mockReturnValue(mockQuery(
      { data: [TENANT_ACTIVE, TENANT_SUSPENDED], total: 2, page: 1, limit: 50 },
    ))
    mockUseAdminAuditLog.mockReturnValue(mockQuery(
      { data: [AUDIT_ENTRY], total: 1, page: 1, limit: 50 },
    ))
    mockUseAdminStats.mockReturnValue(mockQuery(ADMIN_STATS))
    mockUseActivateMaintenance.mockReturnValue(mockMutation())
    mockUseDeactivateMaintenance.mockReturnValue(mockMutation())
    mockUseSuspendTenant.mockReturnValue(mockMutation())
    mockUseReinstateTenant.mockReturnValue(mockMutation())
    mockUseChangeTenantPlan.mockReturnValue(mockMutation())
  })

  it('renders page stats bar', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    expect(screen.getByTestId('page-stats-bar')).toBeInTheDocument()
  })

  it('shows total services count in stats', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    expect(screen.getByTestId('stat-Services')).toHaveTextContent('17/18 healthy')
  })

  it('shows platform uptime in stats', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    expect(screen.getByTestId('stat-Platform Uptime')).toHaveTextContent('99.87%')
  })

  it('shows tenant count in stats', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    expect(screen.getByTestId('stat-Tenants')).toHaveTextContent('5')
  })

  it('renders all 4 tabs', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    expect(screen.getByText('System Health')).toBeInTheDocument()
    expect(screen.getByText('Maintenance')).toBeInTheDocument()
    expect(screen.getByText('Tenants')).toBeInTheDocument()
    expect(screen.getByText('Audit Log')).toBeInTheDocument()
  })

  it('defaults to System Health tab', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    // Degraded alert shown on health tab
    expect(screen.getByText(/1 service is degraded/)).toBeInTheDocument()
  })

  it('renders service name cards', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    expect(screen.getByText('api-gateway')).toBeInTheDocument()
    expect(screen.getByText('ai-enrichment')).toBeInTheDocument()
  })

  it('shows system status summary strip', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    expect(screen.getByText('Healthy:')).toBeInTheDocument()
    expect(screen.getByText('Degraded:')).toBeInTheDocument()
  })

  it('shows CISO insight on health tab', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    expect(screen.getByText(/CISO Insight/)).toBeInTheDocument()
  })

  it('switches to Maintenance tab', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Maintenance'))
    expect(screen.getByText('Neo4j Index Rebuild')).toBeInTheDocument()
    expect(screen.getByText('AI Rate Limit Window')).toBeInTheDocument()
  })

  it('shows active maintenance window with End button', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Maintenance'))
    expect(screen.getByText('End')).toBeInTheDocument()
  })

  it('shows scheduled window with Activate button', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Maintenance'))
    expect(screen.getByText('Activate')).toBeInTheDocument()
  })

  it('expands maintenance row on click', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Maintenance'))
    fireEvent.click(screen.getByText('Neo4j Index Rebuild'))
    expect(screen.getByText('Rebuilding indices.')).toBeInTheDocument()
  })

  it('shows affected services in expanded row', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Maintenance'))
    fireEvent.click(screen.getByText('Neo4j Index Rebuild'))
    expect(screen.getByText('threat-graph')).toBeInTheDocument()
  })

  it('switches to Tenants tab', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Tenants'))
    expect(screen.getByText('Acme Security')).toBeInTheDocument()
    expect(screen.getByText('Blocked Corp')).toBeInTheDocument()
  })

  it('shows tenant plan badges', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Tenants'))
    expect(screen.getByText('Pro')).toBeInTheDocument()
    expect(screen.getByText('Free')).toBeInTheDocument()
  })

  it('shows tenant status badges', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Tenants'))
    expect(screen.getByText('active')).toBeInTheDocument()
    expect(screen.getByText('suspended')).toBeInTheDocument()
  })

  it('shows tenant action buttons', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Tenants'))
    const actionBtns = screen.getAllByText(/Actions/)
    expect(actionBtns.length).toBeGreaterThan(0)
  })

  it('shows suspend option in actions dropdown for active tenant', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Tenants'))
    // Use role to skip the <th>Actions</th> column header
    const actionBtns = screen.getAllByRole('button', { name: /Actions/ })
    fireEvent.click(actionBtns[0]!)
    expect(screen.getByText('Suspend tenant')).toBeInTheDocument()
  })

  it('shows reinstate option for suspended tenant', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Tenants'))
    // Use role to skip the <th>Actions</th> column header
    const actionBtns = screen.getAllByRole('button', { name: /Actions/ })
    // Second tenant is suspended
    fireEvent.click(actionBtns[1]!)
    expect(screen.getByText('Reinstate tenant')).toBeInTheDocument()
  })

  it('switches to Audit Log tab', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Audit Log'))
    expect(screen.getByText('maintenance.activate')).toBeInTheDocument()
    expect(screen.getByText('Manish Kumar')).toBeInTheDocument()
  })

  it('shows audit action details', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Audit Log'))
    expect(screen.getByText('Activated Neo4j Index Rebuild window')).toBeInTheDocument()
  })

  it('shows audit IP address', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Audit Log'))
    expect(screen.getByText('72.61.227.64')).toBeInTheDocument()
  })

  it('shows Export CSV button on audit tab', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Audit Log'))
    expect(screen.getByText('Export CSV')).toBeInTheDocument()
  })

  it('shows audit count on audit tab', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Audit Log'))
    expect(screen.getByText(/1 audit event/)).toBeInTheDocument()
  })

  it('renders with empty services list gracefully', async () => {
    mockUseSystemHealth.mockReturnValue(mockQuery({ services: [], summary: { ...HEALTH_SUMMARY, healthy: 0, total: 0 } }))
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    expect(screen.getByTestId('page-stats-bar')).toBeInTheDocument()
  })

  it('renders empty maintenance list gracefully', async () => {
    mockUseMaintenanceWindows.mockReturnValue(mockQuery({ data: [], total: 0, page: 1, limit: 50 }))
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Maintenance'))
    expect(screen.getByText('No maintenance windows found.')).toBeInTheDocument()
  })

  it('renders empty tenant list gracefully', async () => {
    mockUseAdminTenants.mockReturnValue(mockQuery({ data: [], total: 0, page: 1, limit: 50 }))
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Tenants'))
    expect(screen.getByText('No tenants found.')).toBeInTheDocument()
  })

  it('renders empty audit log gracefully', async () => {
    mockUseAdminAuditLog.mockReturnValue(mockQuery({ data: [], total: 0, page: 1, limit: 50 }))
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Audit Log'))
    expect(screen.getByText('No audit entries found.')).toBeInTheDocument()
  })

  it('shows retention policy note on audit tab', async () => {
    const { AdminOpsPage } = await import('@/pages/AdminOpsPage')
    render(<AdminOpsPage />)
    fireEvent.click(screen.getByText('Audit Log'))
    expect(screen.getByText(/retained for 90 days/)).toBeInTheDocument()
  })
})

// ─── ONBOARDING PAGE TEST DATA ────────────────────────────────────

const WIZARD_STATE = {
  id: 'wiz-1',
  currentStep: 'feed_activation',
  steps: {
    welcome: 'completed',
    org_profile: 'completed',
    team_invite: 'completed',
    feed_activation: 'in_progress',
    integration_setup: 'pending',
    dashboard_config: 'pending',
    readiness_check: 'pending',
    launch: 'pending',
  },
  completionPercent: 62,
  orgProfile: null,
  teamInvites: [],
  dataSources: [],
  dashboardPrefs: null,
  startedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  updatedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  completedAt: null,
}

const PIPELINE_HEALTH_DATA = {
  overall: 'healthy',
  stages: [
    { name: 'ingestion',     status: 'healthy', latencyMs: 45,  message: 'Processing 127 articles/min' },
    { name: 'normalization', status: 'healthy', latencyMs: 12,  message: 'All IOC types handled' },
    { name: 'enrichment',    status: 'healthy', latencyMs: 340, message: 'VT + AbuseIPDB active' },
    { name: 'indexing',      status: 'healthy', latencyMs: 8,   message: 'IOC index up to date' },
    { name: 'correlation',   status: 'healthy', latencyMs: 28,  message: 'All correlations active' },
  ],
  lastCheckedAt: new Date().toISOString(),
}

const MODULE_STATUS_DATA = [
  { module: 'ingestion',        enabled: true,  healthy: true,  configured: true,  dependencies: [],                  missingDeps: [], status: 'ready' },
  { module: 'normalization',    enabled: true,  healthy: true,  configured: true,  dependencies: ['ingestion'],       missingDeps: [], status: 'ready' },
  { module: 'ai-enrichment',    enabled: true,  healthy: true,  configured: false, dependencies: ['normalization'],   missingDeps: [], status: 'needs_config' },
  { module: 'threat-graph',     enabled: false, healthy: false, configured: false, dependencies: ['ioc-intelligence'],missingDeps: [], status: 'disabled' },
]

const READINESS_DATA = {
  overall: 'not_ready',
  checks: [
    { name: 'Feed connected', passed: true,  description: 'At least one active feed', required: true },
    { name: 'Graph ready',    passed: false, description: 'Threat graph has 50 nodes', required: false },
  ],
  score: 7,
  maxScore: 10,
}

const WELCOME_DATA = {
  tenantId: 'tenant-1',
  onboardingComplete: false,
  completionPercent: 62,
  nextStep: 'feed_activation',
  stats: { feedsActive: 3, iocsIngested: 1247, teamMembers: 4, modulesEnabled: 7 },
  quickActions: [],
  tips: [
    { id: 'tip-1', title: 'Activate your first feed', content: 'Connect to a threat intel feed to start ingesting IOCs.', category: 'getting_started', order: 1 },
    { id: 'tip-2', title: 'Configure AI enrichment',  content: 'Add your VirusTotal API key to enable enrichment.',       category: 'best_practice',   order: 2 },
  ],
}

// ─── ONBOARDING PAGE TESTS ────────────────────────────────────────

describe('OnboardingPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUseOnboardingWizard.mockReturnValue(mockQuery(WIZARD_STATE, true))
    mockUseWelcomeDashboard.mockReturnValue(mockQuery(WELCOME_DATA))
    mockUsePipelineHealth.mockReturnValue(mockQuery(PIPELINE_HEALTH_DATA))
    mockUseModuleReadiness.mockReturnValue(mockQuery(MODULE_STATUS_DATA))
    mockUseReadinessCheck.mockReturnValue(mockQuery(READINESS_DATA))
    mockUseCompleteStep.mockReturnValue(mockMutation())
    mockUseSkipStep.mockReturnValue(mockMutation())
    mockUseSeedDemo.mockReturnValue(mockMutation())
  })

  it('renders page stats bar', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    expect(screen.getByTestId('page-stats-bar')).toBeInTheDocument()
  })

  it('shows completion percent in stats', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    expect(screen.getByTestId('stat-Completion')).toHaveTextContent('62%')
  })

  it('shows readiness score in stats', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    expect(screen.getByTestId('stat-Readiness')).toHaveTextContent('7/10')
  })

  it('shows pipeline status in stats', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    expect(screen.getByTestId('stat-Pipeline')).toHaveTextContent('healthy')
  })

  it('renders all 4 tabs', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    expect(screen.getByText('Setup Wizard')).toBeInTheDocument()
    expect(screen.getByText('Pipeline Health')).toBeInTheDocument()
    expect(screen.getByText('Module Status')).toBeInTheDocument()
    expect(screen.getByText('Quick Start')).toBeInTheDocument()
  })

  it('Setup Wizard is the default tab', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    // Feed Activation is the in_progress step — shows CURRENT badge
    expect(screen.getByText('CURRENT')).toBeInTheDocument()
  })

  it('shows all step names in wizard tab', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    expect(screen.getByText('Welcome')).toBeInTheDocument()
    expect(screen.getByText('Org Profile')).toBeInTheDocument()
    expect(screen.getByText('Team Invite')).toBeInTheDocument()
    // 'Feed Activation' appears in step list AND in "Current: Feed Activation" label
    expect(screen.getAllByText('Feed Activation').length).toBeGreaterThan(0)
    expect(screen.getByText('Integration Setup')).toBeInTheDocument()
    expect(screen.getByText('Dashboard Config')).toBeInTheDocument()
    expect(screen.getByText('Readiness Check')).toBeInTheDocument()
    expect(screen.getByText('Launch')).toBeInTheDocument()
  })

  it('shows CURRENT badge on in_progress step', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    expect(screen.getByText('CURRENT')).toBeInTheDocument()
  })

  it('shows completed status badges for finished steps', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    // welcome, org_profile, team_invite are all 'completed'
    const completedBadges = screen.getAllByText('completed')
    expect(completedBadges.length).toBeGreaterThanOrEqual(3)
  })

  it('shows Complete Step button', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    expect(screen.getByRole('button', { name: /Complete Step/ })).toBeInTheDocument()
  })

  it('shows Skip Step button', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    expect(screen.getByRole('button', { name: /Skip Step/ })).toBeInTheDocument()
  })

  it('Complete Step button calls mutation', async () => {
    const mutate = vi.fn()
    mockUseCompleteStep.mockReturnValue({ mutate, isPending: false })
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('button', { name: /Complete Step/ }))
    expect(mutate).toHaveBeenCalledWith({ step: 'feed_activation' })
  })

  it('Skip Step button calls mutation', async () => {
    const mutate = vi.fn()
    mockUseSkipStep.mockReturnValue({ mutate, isPending: false })
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    fireEvent.click(screen.getByRole('button', { name: /Skip Step/ }))
    expect(mutate).toHaveBeenCalledWith({ step: 'feed_activation' })
  })

  it('switches to Pipeline Health tab', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    fireEvent.click(screen.getByText('Pipeline Health'))
    expect(screen.getByText('ingestion')).toBeInTheDocument()
    expect(screen.getByText('normalization')).toBeInTheDocument()
    expect(screen.getByText('enrichment')).toBeInTheDocument()
  })

  it('shows overall status banner on pipeline tab', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    fireEvent.click(screen.getByText('Pipeline Health'))
    expect(screen.getByText('Pipeline Status:')).toBeInTheDocument()
    // 'healthy' appears in both banner and stage badges — verify at least 1 instance
    expect(screen.getAllByText('healthy').length).toBeGreaterThan(0)
  })

  it('shows stage health on pipeline tab', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    fireEvent.click(screen.getByText('Pipeline Health'))
    expect(screen.getByText('Processing 127 articles/min')).toBeInTheDocument()
  })

  it('switches to Module Status tab', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    fireEvent.click(screen.getByText('Module Status'))
    expect(screen.getByText('ingestion')).toBeInTheDocument()
    expect(screen.getByText('normalization')).toBeInTheDocument()
    expect(screen.getByText('ai-enrichment')).toBeInTheDocument()
  })

  it('shows status badges on module tab', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    fireEvent.click(screen.getByText('Module Status'))
    // 'ready' and 'needs config' badges
    expect(screen.getAllByText('ready').length).toBeGreaterThan(0)
    expect(screen.getByText('needs config')).toBeInTheDocument()
    expect(screen.getByText('disabled')).toBeInTheDocument()
  })

  it('switches to Quick Start tab', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    fireEvent.click(screen.getByText('Quick Start'))
    expect(screen.getByText('Feeds Active')).toBeInTheDocument()
    expect(screen.getByText('IOCs Ingested')).toBeInTheDocument()
    expect(screen.getByText('Team Members')).toBeInTheDocument()
    expect(screen.getByText('Modules Enabled')).toBeInTheDocument()
  })

  it('shows stat chip values on Quick Start tab', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    fireEvent.click(screen.getByText('Quick Start'))
    expect(screen.getByText('3')).toBeInTheDocument()   // feedsActive
    expect(screen.getByText('4')).toBeInTheDocument()   // teamMembers
    expect(screen.getByText('7')).toBeInTheDocument()   // modulesEnabled
  })

  it('shows next step CTA on Quick Start tab', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    fireEvent.click(screen.getByText('Quick Start'))
    expect(screen.getByText('Next Step')).toBeInTheDocument()
  })

  it('shows tips list on Quick Start tab', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    fireEvent.click(screen.getByText('Quick Start'))
    expect(screen.getByText('Getting Started Tips')).toBeInTheDocument()
    expect(screen.getByText('Activate your first feed')).toBeInTheDocument()
    expect(screen.getByText('Configure AI enrichment')).toBeInTheDocument()
  })

  it('shows Seed Demo Data button on Quick Start tab', async () => {
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    fireEvent.click(screen.getByText('Quick Start'))
    expect(screen.getByRole('button', { name: /Seed Demo Data/ })).toBeInTheDocument()
  })

  it('Seed Demo Data button calls mutation', async () => {
    const mutate = vi.fn()
    mockUseSeedDemo.mockReturnValue({ mutate, isPending: false })
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    fireEvent.click(screen.getByText('Quick Start'))
    fireEvent.click(screen.getByRole('button', { name: /Seed Demo Data/ }))
    expect(mutate).toHaveBeenCalledWith({})
  })

  it('renders gracefully with empty modules list', async () => {
    mockUseModuleReadiness.mockReturnValue(mockQuery([]))
    const { OnboardingPage } = await import('@/pages/OnboardingPage')
    render(<OnboardingPage />)
    fireEvent.click(screen.getByText('Module Status'))
    expect(screen.getByText('No modules found.')).toBeInTheDocument()
  })
})
