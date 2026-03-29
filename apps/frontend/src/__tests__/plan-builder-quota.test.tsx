/**
 * @module __tests__/plan-builder-quota.test
 * @description Tests for Phase C: Plan Builder, PlanComparisonMatrix, Override Panel,
 * Tenant Usage, FeatureGate, QuotaWarningBanner, useFeatureLimits hook, 429 interceptor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@/test/test-utils'

// ─── Mock hooks ─────────────────────────────────────────────

const mockPlans = [
  {
    id: '1', planId: 'free', name: 'Free', description: 'Basic', priceMonthlyInr: 0,
    priceAnnualInr: 0, isPublic: true, isDefault: true, sortOrder: 0,
    createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z',
    features: [
      { featureKey: 'ioc_management', enabled: true, limitDaily: 100, limitWeekly: -1, limitMonthly: 1000, limitTotal: -1 },
      { featureKey: 'threat_actors', enabled: true, limitDaily: 50, limitWeekly: -1, limitMonthly: 500, limitTotal: -1 },
      { featureKey: 'malware_intel', enabled: false, limitDaily: 0, limitWeekly: -1, limitMonthly: 0, limitTotal: -1 },
      { featureKey: 'vulnerability_intel', enabled: false, limitDaily: 0, limitWeekly: -1, limitMonthly: 0, limitTotal: -1 },
      { featureKey: 'threat_hunting', enabled: false, limitDaily: 0, limitWeekly: -1, limitMonthly: 0, limitTotal: -1 },
      { featureKey: 'graph_exploration', enabled: false, limitDaily: 0, limitWeekly: -1, limitMonthly: 0, limitTotal: -1 },
      { featureKey: 'digital_risk_protection', enabled: false, limitDaily: 0, limitWeekly: -1, limitMonthly: 0, limitTotal: -1 },
      { featureKey: 'correlation_engine', enabled: false, limitDaily: 0, limitWeekly: -1, limitMonthly: 0, limitTotal: -1 },
      { featureKey: 'reports', enabled: false, limitDaily: 0, limitWeekly: -1, limitMonthly: 0, limitTotal: -1 },
      { featureKey: 'ai_enrichment', enabled: false, limitDaily: 0, limitWeekly: -1, limitMonthly: 0, limitTotal: -1 },
      { featureKey: 'feed_subscriptions', enabled: false, limitDaily: 0, limitWeekly: -1, limitMonthly: 0, limitTotal: -1 },
      { featureKey: 'users', enabled: false, limitDaily: 0, limitWeekly: -1, limitMonthly: 0, limitTotal: -1 },
      { featureKey: 'data_retention', enabled: false, limitDaily: 0, limitWeekly: -1, limitMonthly: 0, limitTotal: -1 },
      { featureKey: 'api_access', enabled: false, limitDaily: 0, limitWeekly: -1, limitMonthly: 0, limitTotal: -1 },
      { featureKey: 'ioc_storage', enabled: false, limitDaily: 0, limitWeekly: -1, limitMonthly: 0, limitTotal: -1 },
      { featureKey: 'alerts', enabled: false, limitDaily: 0, limitWeekly: -1, limitMonthly: 0, limitTotal: -1 },
    ],
    _count: { tenants: 12 },
  },
  {
    id: '2', planId: 'enterprise', name: 'Enterprise', description: 'Unlimited', priceMonthlyInr: 49999,
    priceAnnualInr: 499999, isPublic: true, isDefault: false, sortOrder: 3,
    createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z',
    features: Array.from({ length: 16 }, (_, i) => ({
      featureKey: ['ioc_management', 'threat_actors', 'malware_intel', 'vulnerability_intel', 'threat_hunting', 'graph_exploration', 'digital_risk_protection', 'correlation_engine', 'reports', 'ai_enrichment', 'feed_subscriptions', 'users', 'data_retention', 'api_access', 'ioc_storage', 'alerts'][i],
      enabled: true, limitDaily: -1, limitWeekly: -1, limitMonthly: -1, limitTotal: -1,
    })),
    _count: { tenants: 1 },
  },
]

const mockCreatePlan = vi.fn().mockResolvedValue({})
const mockUpdatePlan = vi.fn().mockResolvedValue({})
const mockDeletePlan = vi.fn().mockResolvedValue({})

vi.mock('@/hooks/use-plan-builder', () => ({
  usePlanBuilder: () => ({
    plans: mockPlans,
    isLoading: false, error: null, isDemo: false,
    createPlan: mockCreatePlan,
    isCreating: false,
    updatePlan: mockUpdatePlan,
    isUpdating: false,
    deletePlan: mockDeletePlan,
    isDeleting: false,
    deleteError: null,
  }),
}))

const mockFeatureLimits = [
  { featureKey: 'ioc_management', enabled: true, limitDaily: 5000, usedDaily: 4100, limitMonthly: 50000, usedMonthly: 38000, percentDaily: 82, percentMonthly: 76 },
  { featureKey: 'threat_actors', enabled: true, limitDaily: 1000, usedDaily: 450, limitMonthly: 10000, usedMonthly: 4500, percentDaily: 45, percentMonthly: 45 },
  { featureKey: 'malware_intel', enabled: true, limitDaily: 1000, usedDaily: 920, limitMonthly: 10000, usedMonthly: 9200, percentDaily: 92, percentMonthly: 92 },
  { featureKey: 'vulnerability_intel', enabled: true, limitDaily: -1, usedDaily: 0, limitMonthly: -1, usedMonthly: 0, percentDaily: 0, percentMonthly: 0 },
  { featureKey: 'threat_hunting', enabled: false, limitDaily: 0, usedDaily: 0, limitMonthly: 0, usedMonthly: 0, percentDaily: 0, percentMonthly: 0 },
  { featureKey: 'graph_exploration', enabled: true, limitDaily: 500, usedDaily: 500, limitMonthly: 5000, usedMonthly: 5000, percentDaily: 100, percentMonthly: 100 },
  { featureKey: 'digital_risk_protection', enabled: false, limitDaily: 0, usedDaily: 0, limitMonthly: 0, usedMonthly: 0, percentDaily: 0, percentMonthly: 0 },
  { featureKey: 'correlation_engine', enabled: true, limitDaily: 2000, usedDaily: 400, limitMonthly: 20000, usedMonthly: 4000, percentDaily: 20, percentMonthly: 20 },
  { featureKey: 'reports', enabled: true, limitDaily: 50, usedDaily: 10, limitMonthly: 500, usedMonthly: 100, percentDaily: 20, percentMonthly: 20 },
  { featureKey: 'ai_enrichment', enabled: true, limitDaily: 500, usedDaily: 100, limitMonthly: 5000, usedMonthly: 1000, percentDaily: 20, percentMonthly: 20 },
  { featureKey: 'feed_subscriptions', enabled: true, limitDaily: -1, usedDaily: 0, limitMonthly: -1, usedMonthly: 0, percentDaily: 0, percentMonthly: 0 },
  { featureKey: 'users', enabled: true, limitDaily: -1, usedDaily: 0, limitMonthly: -1, usedMonthly: 0, percentDaily: 0, percentMonthly: 0 },
  { featureKey: 'data_retention', enabled: true, limitDaily: -1, usedDaily: 0, limitMonthly: -1, usedMonthly: 0, percentDaily: 0, percentMonthly: 0 },
  { featureKey: 'api_access', enabled: true, limitDaily: 10000, usedDaily: 2000, limitMonthly: 100000, usedMonthly: 20000, percentDaily: 20, percentMonthly: 20 },
  { featureKey: 'ioc_storage', enabled: true, limitDaily: -1, usedDaily: 0, limitMonthly: -1, usedMonthly: 0, percentDaily: 0, percentMonthly: 0 },
  { featureKey: 'alerts', enabled: true, limitDaily: 100, usedDaily: 20, limitMonthly: 1000, usedMonthly: 200, percentDaily: 20, percentMonthly: 20 },
]

vi.mock('@/hooks/use-feature-limits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-feature-limits')>()
  return {
    ...actual,
    useFeatureLimits: () => ({
      features: mockFeatureLimits,
      isLoading: false, error: null, isDemo: false,
    }),
    useFeatureEnabled: (key: string) => {
      const f = mockFeatureLimits.find(l => l.featureKey === key)
      return f?.enabled ?? false
    },
    useQuotaStatus: (key: string) => {
      const f = mockFeatureLimits.find(l => l.featureKey === key)
      if (!f || !f.enabled) return { percentage: 0, period: 'daily', limit: 0, used: 0, status: 'ok' }
      const daily = f.limitDaily > 0 ? f.percentDaily : 0
      const monthly = f.limitMonthly > 0 ? f.percentMonthly : 0
      const useMonthly = monthly >= daily
      const pct = useMonthly ? monthly : daily
      return {
        percentage: pct,
        period: useMonthly ? 'monthly' : 'daily',
        limit: useMonthly ? f.limitMonthly : f.limitDaily,
        used: useMonthly ? f.usedMonthly : f.usedDaily,
        status: pct >= 100 ? 'exceeded' : pct >= 90 ? 'critical' : pct >= 80 ? 'warning' : 'ok',
      }
    },
  }
})

const mockOverrides = [
  {
    id: 'ov-1', tenantId: 't-1', featureKey: 'ioc_management',
    limitDaily: 10000, limitWeekly: null, limitMonthly: 100000, limitTotal: null,
    reason: 'Sales deal', grantedBy: 'admin@etip.io',
    grantedAt: '2026-03-15T00:00:00Z', expiresAt: '2026-06-15T00:00:00Z',
  },
]

vi.mock('@/hooks/use-tenant-overrides', () => ({
  useTenantOverrides: () => ({
    overrides: mockOverrides,
    isLoading: false, error: null, isDemo: false,
    createOverride: vi.fn().mockResolvedValue({}),
    isCreating: false,
    updateOverride: vi.fn().mockResolvedValue({}),
    isUpdating: false,
    deleteOverride: vi.fn().mockResolvedValue({}),
    isDeleting: false,
  }),
}))

vi.mock('@/hooks/useApiError', () => ({
  notifyApiError: (_err: unknown, _ctx: string, fallback: unknown) => fallback,
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: (s: any) => any) => selector({ user: { role: 'super_admin', tenantId: 't-1', id: 'u-1' }, accessToken: 'tok' }),
    { getState: () => ({ accessToken: 'tok', user: { tenantId: 't-1', id: 'u-1', role: 'super_admin' }, refreshToken: null, logout: vi.fn(), setTokens: vi.fn() }) }
  ),
}))

// ─── Import components after mocks ──────────────────────────

import { PlanBuilderPanel } from '@/components/command-center/PlanBuilderPanel'
import { PlanComparisonMatrix } from '@/components/command-center/PlanComparisonMatrix'
import { TenantOverridePanel } from '@/components/command-center/TenantOverridePanel'
import { TenantUsagePanel } from '@/components/command-center/TenantUsagePanel'
import { FeatureGate, UpgradeCTA } from '@/components/FeatureGate'
import { QuotaWarningBanner, QuotaUpgradeModal } from '@/components/QuotaWarningBanner'

// ═══════════════════════════════════════════════════════════
// Plan Builder Tests
// ═══════════════════════════════════════════════════════════

describe('PlanBuilderPanel', () => {
  it('renders plan card grid with all plans', () => {
    render(<PlanBuilderPanel />)
    expect(screen.getByTestId('plan-card-grid')).toBeInTheDocument()
    expect(screen.getByTestId('plan-card-free')).toBeInTheDocument()
    expect(screen.getByTestId('plan-card-enterprise')).toBeInTheDocument()
  })

  it('shows create plan button', () => {
    render(<PlanBuilderPanel />)
    expect(screen.getByTestId('create-plan-btn')).toBeInTheDocument()
  })

  it('opens editor modal on card click', () => {
    render(<PlanBuilderPanel />)
    fireEvent.click(screen.getByTestId('plan-card-free'))
    expect(screen.getByTestId('plan-editor-modal')).toBeInTheDocument()
    expect(screen.getByTestId('plan-name-input')).toHaveValue('Free')
  })

  it('opens editor in create mode', () => {
    render(<PlanBuilderPanel />)
    fireEvent.click(screen.getByTestId('create-plan-btn'))
    expect(screen.getByTestId('plan-editor-modal')).toBeInTheDocument()
    expect(screen.getByTestId('plan-name-input')).toHaveValue('')
    expect(screen.getByTestId('plan-id-input')).not.toBeDisabled()
  })

  it('plan ID is readonly in edit mode', () => {
    render(<PlanBuilderPanel />)
    fireEvent.click(screen.getByTestId('plan-card-free'))
    expect(screen.getByTestId('plan-id-input')).toBeDisabled()
  })

  it('opens delete confirmation modal', () => {
    render(<PlanBuilderPanel />)
    fireEvent.click(screen.getByTestId('delete-plan-free'))
    expect(screen.getByTestId('delete-confirm-modal')).toBeInTheDocument()
  })

  it('calls deletePlan on confirm', async () => {
    render(<PlanBuilderPanel />)
    fireEvent.click(screen.getByTestId('delete-plan-free'))
    fireEvent.click(screen.getByTestId('confirm-delete-btn'))
    await waitFor(() => expect(mockDeletePlan).toHaveBeenCalledWith('free'))
  })

  it('renders feature limit grid in editor', () => {
    render(<PlanBuilderPanel />)
    fireEvent.click(screen.getByTestId('plan-card-free'))
    expect(screen.getByTestId('feature-limit-grid')).toBeInTheDocument()
    expect(screen.getByTestId('toggle-ioc_management')).toBeInTheDocument()
  })

  it('displays tenant count on plan card', () => {
    render(<PlanBuilderPanel />)
    expect(screen.getByTestId('plan-card-free')).toHaveTextContent('12 tenants')
  })

  it('shows Default badge on default plan', () => {
    render(<PlanBuilderPanel />)
    expect(screen.getByTestId('plan-card-free')).toHaveTextContent('Default')
  })
})

// ═══════════════════════════════════════════════════════════
// Feature Limit Grid Tests
// ═══════════════════════════════════════════════════════════

describe('Feature Limit Grid (inside editor)', () => {
  it('shows toggle and limit inputs for each feature', () => {
    render(<PlanBuilderPanel />)
    fireEvent.click(screen.getByTestId('plan-card-free'))
    expect(screen.getByTestId('toggle-ioc_management')).toBeInTheDocument()
    expect(screen.getByTestId('input-ioc_management-limitDaily')).toBeInTheDocument()
    expect(screen.getByTestId('input-ioc_management-limitMonthly')).toBeInTheDocument()
  })

  it('disabled features have disabled limit inputs', () => {
    render(<PlanBuilderPanel />)
    fireEvent.click(screen.getByTestId('plan-card-free'))
    expect(screen.getByTestId('input-malware_intel-limitDaily')).toBeDisabled()
  })

  it('-1 values present for unlimited features', () => {
    render(<PlanBuilderPanel />)
    fireEvent.click(screen.getByTestId('plan-card-free'))
    expect(screen.getByTestId('input-ioc_management-limitWeekly')).toHaveValue(-1)
  })
})

// ═══════════════════════════════════════════════════════════
// Plan Comparison Matrix Tests
// ═══════════════════════════════════════════════════════════

describe('PlanComparisonMatrix', () => {
  it('renders columns for each plan', () => {
    render(<PlanComparisonMatrix plans={mockPlans} />)
    expect(screen.getByTestId('plan-col-free')).toBeInTheDocument()
    expect(screen.getByTestId('plan-col-enterprise')).toBeInTheDocument()
  })

  it('renders 16 feature rows', () => {
    render(<PlanComparisonMatrix plans={mockPlans} />)
    const matrix = screen.getByTestId('plan-comparison-matrix')
    const rows = matrix.querySelectorAll('tbody tr')
    expect(rows.length).toBe(16)
  })

  it('shows check for enabled features', () => {
    render(<PlanComparisonMatrix plans={mockPlans} />)
    // Enterprise has all features enabled — should have checks
    const matrix = screen.getByTestId('plan-comparison-matrix')
    const checks = matrix.querySelectorAll('tbody .lucide-check')
    expect(checks.length).toBeGreaterThan(0)
  })

  it('shows current plan badge when currentPlanId is set', () => {
    render(<PlanComparisonMatrix plans={mockPlans} currentPlanId="free" />)
    const freeCol = screen.getByTestId('plan-col-free')
    expect(freeCol).toHaveClass('ring-2')
  })

  it('renders upgrade buttons when onUpgrade is provided', () => {
    const onUpgrade = vi.fn()
    render(<PlanComparisonMatrix plans={mockPlans} currentPlanId="free" onUpgrade={onUpgrade} />)
    // Enterprise shows "Contact Sales" not upgrade, free shows "Current plan"
    expect(screen.getByText('Contact Sales')).toBeInTheDocument()
    expect(screen.getByText('Current plan')).toBeInTheDocument()
  })

  it('shows unlimited (∞) for -1 limit values', () => {
    render(<PlanComparisonMatrix plans={mockPlans} />)
    const matrix = screen.getByTestId('plan-comparison-matrix')
    expect(matrix.textContent).toContain('∞')
  })
})

// ═══════════════════════════════════════════════════════════
// Override Panel Tests
// ═══════════════════════════════════════════════════════════

describe('TenantOverridePanel', () => {
  it('renders override table', () => {
    render(<TenantOverridePanel tenantId="t-1" />)
    expect(screen.getByTestId('overrides-table')).toBeInTheDocument()
  })

  it('shows IOC Management override', () => {
    render(<TenantOverridePanel tenantId="t-1" />)
    expect(screen.getByTestId('overrides-table')).toHaveTextContent('IOC Management')
    expect(screen.getByTestId('overrides-table')).toHaveTextContent('Sales deal')
  })

  it('shows expiry date', () => {
    render(<TenantOverridePanel tenantId="t-1" />)
    expect(screen.getByTestId('overrides-table')).toHaveTextContent('15 Jun 2026')
  })

  it('opens add override modal', () => {
    render(<TenantOverridePanel tenantId="t-1" />)
    fireEvent.click(screen.getByTestId('add-override-btn'))
    expect(screen.getByTestId('override-modal')).toBeInTheDocument()
  })

  it('has delete button per override', () => {
    render(<TenantOverridePanel tenantId="t-1" />)
    expect(screen.getByTestId('delete-override-ioc_management')).toBeInTheDocument()
  })
})

// ═══════════════════════════════════════════════════════════
// Tenant Usage Page Tests
// ═══════════════════════════════════════════════════════════

describe('TenantUsagePanel', () => {
  it('renders 16 usage cards', () => {
    render(<TenantUsagePanel />)
    expect(screen.getByTestId('usage-cards-grid')).toBeInTheDocument()
    expect(screen.getByTestId('usage-card-ioc_management')).toBeInTheDocument()
    expect(screen.getByTestId('usage-card-alerts')).toBeInTheDocument()
  })

  it('shows summary header with enabled count', () => {
    render(<TenantUsagePanel />)
    const header = screen.getByTestId('usage-summary-header')
    expect(header).toHaveTextContent('of 16 features enabled')
  })

  it('disabled features show lock icon and upgrade CTA', () => {
    render(<TenantUsagePanel />)
    const card = screen.getByTestId('usage-card-threat_hunting')
    expect(card).toHaveTextContent('Not available on your plan')
    expect(card).toHaveTextContent('Upgrade to unlock')
  })

  it('unlimited features show Unlimited label', () => {
    render(<TenantUsagePanel />)
    const card = screen.getByTestId('usage-card-vulnerability_intel')
    expect(card).toHaveTextContent('Unlimited')
  })

  it('progress bars render for limited features', () => {
    render(<TenantUsagePanel />)
    const card = screen.getByTestId('usage-card-ioc_management')
    expect(card).toHaveTextContent('Daily')
    expect(card).toHaveTextContent('Monthly')
  })
})

// ═══════════════════════════════════════════════════════════
// FeatureGate Tests
// ═══════════════════════════════════════════════════════════

describe('FeatureGate', () => {
  it('renders children when feature is enabled', () => {
    render(
      <FeatureGate feature="ioc_management">
        <div data-testid="child-content">IOC Page</div>
      </FeatureGate>
    )
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
  })

  it('renders fallback when feature is disabled', () => {
    render(
      <FeatureGate feature="threat_hunting">
        <div data-testid="child-content">Hunting Page</div>
      </FeatureGate>
    )
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument()
    expect(screen.getByTestId('upgrade-cta-threat_hunting')).toBeInTheDocument()
  })

  it('renders custom fallback when provided', () => {
    render(
      <FeatureGate feature="threat_hunting" fallback={<div data-testid="custom-fallback">Custom</div>}>
        <div>Children</div>
      </FeatureGate>
    )
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument()
  })

  it('UpgradeCTA shows feature name and upgrade link', () => {
    render(<UpgradeCTA feature="digital_risk_protection" />)
    expect(screen.getByTestId('upgrade-cta-digital_risk_protection')).toHaveTextContent('Digital Risk Protection')
    expect(screen.getByTestId('upgrade-btn-digital_risk_protection')).toHaveAttribute('href', '/command-center#billing-plans')
  })
})

// ═══════════════════════════════════════════════════════════
// Quota Warning Banner Tests
// ═══════════════════════════════════════════════════════════

describe('QuotaWarningBanner', () => {
  it('shows no banner below 80%', () => {
    // threat_actors is at 45%
    render(<QuotaWarningBanner feature="threat_actors" />)
    expect(screen.queryByTestId('quota-banner-threat_actors')).not.toBeInTheDocument()
  })

  it('shows amber warning at 80%+', () => {
    // ioc_management daily is 82%
    render(<QuotaWarningBanner feature="ioc_management" />)
    const banner = screen.getByTestId('quota-banner-ioc_management')
    expect(banner).toBeInTheDocument()
    expect(banner).toHaveTextContent('82%')
    expect(banner).toHaveTextContent('Consider upgrading')
  })

  it('amber banner is dismissible', () => {
    render(<QuotaWarningBanner feature="ioc_management" />)
    expect(screen.getByTestId('quota-banner-ioc_management')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('dismiss-quota-banner'))
    expect(screen.queryByTestId('quota-banner-ioc_management')).not.toBeInTheDocument()
  })

  it('shows red banner at 90%+', () => {
    // malware_intel is at 92%
    render(<QuotaWarningBanner feature="malware_intel" />)
    const banner = screen.getByTestId('quota-banner-malware_intel')
    expect(banner).toBeInTheDocument()
    expect(banner).toHaveTextContent('92%')
    expect(banner).toHaveTextContent('Upgrade now')
  })

  it('red banner is NOT dismissible', () => {
    render(<QuotaWarningBanner feature="malware_intel" />)
    expect(screen.queryByTestId('dismiss-quota-banner')).not.toBeInTheDocument()
  })

  it('shows exceeded banner at 100%', () => {
    // graph_exploration is at 100%
    render(<QuotaWarningBanner feature="graph_exploration" />)
    const banner = screen.getByTestId('quota-banner-graph_exploration')
    expect(banner).toHaveTextContent('limit reached')
  })
})

// ═══════════════════════════════════════════════════════════
// Quota Upgrade Modal Tests
// ═══════════════════════════════════════════════════════════

describe('QuotaUpgradeModal', () => {
  const info = {
    feature: 'ioc_management', limit: 5000, used: 5000,
    period: 'daily', resetsAt: '2026-03-30T00:00:00Z', currentPlan: 'starter',
  }

  it('renders quota exceeded info', () => {
    render(<QuotaUpgradeModal info={info} onClose={vi.fn()} />)
    const modal = screen.getByTestId('quota-upgrade-modal')
    expect(modal).toHaveTextContent('Quota Exceeded')
    expect(modal).toHaveTextContent('5,000')
    expect(modal).toHaveTextContent('IOC Management')
  })

  it('has upgrade plan link', () => {
    render(<QuotaUpgradeModal info={info} onClose={vi.fn()} />)
    expect(screen.getByText('Upgrade Plan').closest('a')).toHaveAttribute('href', '/command-center#billing-plans')
  })

  it('has plan comparison toggle', () => {
    render(<QuotaUpgradeModal info={info} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('View Plan Comparison'))
    // Comparison matrix should now be visible
    expect(screen.getByTestId('plan-comparison-matrix')).toBeInTheDocument()
  })

  it('close button calls onClose', () => {
    const onClose = vi.fn()
    render(<QuotaUpgradeModal info={info} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('close-quota-modal'))
    expect(onClose).toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════
// useFeatureLimits hook shape test
// ═══════════════════════════════════════════════════════════

describe('useFeatureLimits hook (via component)', () => {
  it('returns correct shape through TenantUsagePanel', () => {
    render(<TenantUsagePanel />)
    // If all 16 cards render, hook shape is correct
    const grid = screen.getByTestId('usage-cards-grid')
    expect(grid.children.length).toBe(16)
  })
})

// ═══════════════════════════════════════════════════════════
// 429 Interceptor Tests
// ═══════════════════════════════════════════════════════════

describe('429 QUOTA_EXCEEDED interceptor', () => {
  it('onQuotaExceeded registers listener in api module', async () => {
    // Import from api.ts to verify the function exists
    const { onQuotaExceeded } = await import('@/lib/api')
    expect(typeof onQuotaExceeded).toBe('function')
  })
})
