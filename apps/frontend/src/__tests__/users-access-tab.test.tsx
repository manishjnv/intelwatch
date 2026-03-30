/**
 * @module __tests__/users-access-tab.test
 * @description Tests for UsersAccessTab — Team, Roles, SSO, Integrations sub-tabs.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { UsersAccessTab } from '@/components/command-center/UsersAccessTab'

// ─── Mock hooks ──────────────────────────────────────────────

vi.mock('@/hooks/use-phase5-data', () => ({
  useUsers: () => ({
    data: {
      data: [
        { id: 'u1', name: 'Manish Kumar', email: 'manish@intelwatch.in', role: 'super_admin', team: null, status: 'active', lastLogin: new Date().toISOString(), mfaEnabled: true, createdAt: '2026-01-01' },
        { id: 'u2', name: 'Priya Sharma', email: 'priya@intelwatch.in', role: 'analyst', team: 'SOC', status: 'active', lastLogin: new Date(Date.now() - 3600_000).toISOString(), mfaEnabled: false, createdAt: '2026-02-01' },
        { id: 'u3', name: 'New Hire', email: 'newhire@company.com', role: 'analyst', team: null, status: 'invited', lastLogin: null, mfaEnabled: false, createdAt: '2026-03-01' },
      ],
      total: 3, page: 1, limit: 50,
    },
    isLoading: false, isDemo: false,
  }),
  useRoles: () => ({
    data: {
      data: [
        { id: 'r1', name: 'analyst', permissionCount: 1, userCount: 5, isSystem: true, description: 'Read-only', createdAt: '' },
        { id: 'r2', name: 'tenant_admin', permissionCount: 6, userCount: 1, isSystem: true, description: 'Full access', createdAt: '' },
      ],
      total: 2, page: 1, limit: 50,
    },
    isLoading: false, isDemo: false,
  }),
  useSIEMIntegrations: () => ({
    data: { data: [], total: 0, page: 1, limit: 50 },
    isLoading: false, isDemo: true,
  }),
  useWebhooks: () => ({
    data: { data: [], total: 0, page: 1, limit: 50 },
    isLoading: false, isDemo: true,
  }),
  useIntegrationStats: () => ({
    data: { total: 7, active: 3, failing: 0, eventsPerHour: 42, lastSync: null },
    isLoading: false, isDemo: true,
  }),
}))

vi.mock('@/hooks/useDebouncedValue', () => ({
  useDebouncedValue: (v: any) => v,
}))

vi.mock('@/hooks/use-sso', () => ({
  useSsoConfig: () => ({ data: null, isLoading: false, isDemo: false }),
  useSaveSsoConfig: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSsoConfig: () => ({ mutate: vi.fn(), isPending: false }),
  useTestSsoConnection: () => ({ mutate: vi.fn(), isPending: false }),
  useAdminSsoConfig: () => ({ data: null, isLoading: false, isDemo: false }),
}))

vi.mock('@/components/ui/Toast', () => ({ toast: vi.fn() }))

// ─── Mock data ──────────────────────────────────────────────

const baseMockCC: any = {
  isSuperAdmin: true, userRole: 'super_admin', tenantPlan: 'teams',
  globalStats: { totalCostUsd: 0, totalItems: 0, itemsBySubtask: {}, costByProvider: {}, costByModel: {}, costBySubtask: {}, costTrend: [] },
  tenantStats: { tenantId: 't1', itemsConsumed: 0, attributedCostUsd: 0, costByProvider: {}, costByItemType: {}, consumptionTrend: [], budgetUsedPercent: 0, budgetLimitUsd: 0 },
  tenantList: [], queueStats: { pendingItems: 0, processingRate: 0 }, providerKeys: [],
  isLoading: false, isDemo: false, period: 'month' as const,
  setPeriod: vi.fn(), refetchAll: vi.fn(), isFetching: false,
  setProviderKey: vi.fn(), isSettingKey: false, testProviderKey: vi.fn(), isTestingKey: false, removeProviderKey: vi.fn(), isRemovingKey: false,
}

describe('UsersAccessTab', () => {
  it('renders Team sub-tab by default', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    expect(screen.getByTestId('users-access-tab')).toBeInTheDocument()
    expect(screen.getByTestId('team-panel')).toBeInTheDocument()
  })

  it('renders members table with active users', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    expect(screen.getByTestId('members-table')).toBeInTheDocument()
    expect(screen.getAllByText('Manish Kumar').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Priya Sharma').length).toBeGreaterThanOrEqual(1)
  })

  it('shows pending invites section', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    expect(screen.getByText('Pending Invites (1)')).toBeInTheDocument()
    expect(screen.getByText('newhire@company.com')).toBeInTheDocument()
  })

  it('shows invite button for paid plans', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    expect(screen.getByTestId('invite-btn')).toBeInTheDocument()
  })

  it('shows upgrade CTA for free plan', () => {
    const freeCC = { ...baseMockCC, tenantPlan: 'free' }
    render(<UsersAccessTab data={freeCC} />)
    expect(screen.getByTestId('upgrade-cta')).toBeInTheDocument()
  })

  it('opens invite modal', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    fireEvent.click(screen.getByTestId('invite-btn'))
    expect(screen.getByTestId('invite-modal')).toBeInTheDocument()
    expect(screen.getByTestId('invite-email')).toBeInTheDocument()
    expect(screen.getByTestId('invite-role')).toBeInTheDocument()
  })

  it('switches to Roles & Permissions sub-tab', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    fireEvent.click(screen.getByTestId('pill-roles'))
    expect(screen.getByTestId('roles-panel')).toBeInTheDocument()
    expect(screen.getByTestId('role-matrix')).toBeInTheDocument()
  })

  it('shows custom roles banner for non-enterprise', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    fireEvent.click(screen.getByTestId('pill-roles'))
    expect(screen.getByTestId('custom-roles-banner')).toBeInTheDocument()
  })

  it('hides custom roles banner for enterprise', () => {
    const entCC = { ...baseMockCC, tenantPlan: 'enterprise' }
    render(<UsersAccessTab data={entCC} />)
    fireEvent.click(screen.getByTestId('pill-roles'))
    expect(screen.queryByTestId('custom-roles-banner')).not.toBeInTheDocument()
  })

  it('shows SSO sub-tab for super-admin with SsoConfigPanel', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    expect(screen.getByTestId('pill-sso')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pill-sso'))
    expect(screen.getByTestId('sso-config-panel')).toBeInTheDocument()
    expect(screen.getByTestId('provider-saml')).toBeInTheDocument()
    expect(screen.getByTestId('provider-oidc')).toBeInTheDocument()
  })

  it('shows SSO sub-tab for tenant admin (SSO now available to all roles)', () => {
    const tenantCC = { ...baseMockCC, isSuperAdmin: false, userRole: 'tenant_admin' }
    render(<UsersAccessTab data={tenantCC} />)
    expect(screen.getByTestId('pill-sso')).toBeInTheDocument()
  })

  it('switches to Integrations sub-tab', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    fireEvent.click(screen.getByTestId('pill-integrations'))
    expect(screen.getByTestId('integrations-panel')).toBeInTheDocument()
    expect(screen.getByTestId('integration-splunk')).toBeInTheDocument()
    expect(screen.getByTestId('integration-webhooks')).toBeInTheDocument()
  })

  it('shows integration stats', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    fireEvent.click(screen.getByTestId('pill-integrations'))
    expect(screen.getByText('7')).toBeInTheDocument() // total
    expect(screen.getByText('42')).toBeInTheDocument() // events/hr
  })

  it('filters team members by search', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    fireEvent.change(screen.getByTestId('team-search'), { target: { value: 'Priya' } })
    expect(screen.getAllByText('Priya Sharma').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('Manish Kumar')).not.toBeInTheDocument()
  })

  it('shows SsoStatusBadge in Users & Access tab header', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    expect(screen.getByText('SSO Not Configured')).toBeInTheDocument()
  })
})
