/**
 * @module __tests__/users-access-tab.test
 * @description Tests for UsersAccessTab — Team, Roles, SSO, Integrations sub-tabs.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@/test/test-utils'
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
}))

vi.mock('@/hooks/use-integrations', () => ({
  // Real GET /integrations/stats body (integration-store getStats)
  useIntegrationStats: () => ({
    data: { totalIntegrations: 2, enabledIntegrations: 1, totalLogs: 5, failedLogs: 1, dlqSize: 0, totalTickets: 0 },
    isLoading: false, isError: false,
  }),
  useIntegrations: () => ({
    data: { data: [], total: 0, page: 1, limit: 50 },
    isLoading: false, isError: false, error: null, refetch: vi.fn(),
  }),
  useIntegrationsHealth: () => ({ data: null, isLoading: false }),
  useUpdateIntegration: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteIntegration: () => ({ mutate: vi.fn(), isPending: false }),
  useTestIntegration: () => ({ mutate: vi.fn(), isPending: false }),
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

// S167: API keys pill — real backend shape (api-keys.ts GET /api-keys, line 101).
vi.mock('@/hooks/use-api-keys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-api-keys')>()
  return {
    ...actual,
    useApiKeys: () => ({
      data: { data: [], total: 0, page: 1, limit: 50 },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    }),
    useCreateApiKey: () => ({ mutate: vi.fn(), isPending: false }),
    useRevokeApiKey: () => ({ mutate: vi.fn(), isPending: false }),
  }
})

vi.mock('@/hooks/use-feature-limits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-feature-limits')>()
  return {
    ...actual,
    useFeatureEnabled: () => true,
    useFeatureLimits: () => ({ features: [], isLoading: false, error: null }),
  }
})

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

  it('hides the invite button (no DB-backed invite route yet)', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    expect(screen.queryByTestId('invite-btn')).not.toBeInTheDocument()
  })

  it('shows upgrade CTA for free plan', () => {
    const freeCC = { ...baseMockCC, tenantPlan: 'free' }
    render(<UsersAccessTab data={freeCC} />)
    expect(screen.getByTestId('upgrade-cta')).toBeInTheDocument()
  })

  it('switches to Roles & Permissions sub-tab', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    fireEvent.click(screen.getByTestId('pill-roles'))
    expect(screen.getByTestId('roles-panel')).toBeInTheDocument()
    expect(screen.getByTestId('role-matrix')).toBeInTheDocument()
  })

  it('shows only the 3 real roles, no fake roles or custom-role upsell', () => {
    render(<UsersAccessTab data={{ ...baseMockCC, tenantPlan: 'free' }} />)
    fireEvent.click(screen.getByTestId('pill-roles'))
    const matrix = screen.getByTestId('role-matrix')
    expect(matrix.querySelectorAll('tbody tr')).toHaveLength(3)
    for (const role of ['analyst', 'tenant admin', 'super admin']) expect(within(matrix).getByText(role)).toBeInTheDocument()
    expect(within(matrix).queryByText('lead')).not.toBeInTheDocument()
    expect(within(matrix).queryByText('manager')).not.toBeInTheDocument()
    expect(screen.queryByTestId('custom-roles-banner')).not.toBeInTheDocument()
  })

  it('matches shared-auth: analyst has view-only feeds and no user admin', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    fireEvent.click(screen.getByTestId('pill-roles'))
    const analystRow = within(screen.getByTestId('role-matrix')).getByText('analyst').closest('tr')!
    expect(within(analystRow).getByText('View only')).toBeInTheDocument()
    expect(within(analystRow).getAllByLabelText('No access')).toHaveLength(3)
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
    expect(screen.getByTestId('taxii-feed-card')).toBeInTheDocument()
    expect(screen.getByTestId('connection-list')).toBeInTheDocument()
    expect(screen.getByTestId('connections-empty')).toBeInTheDocument()
  })

  it('stat tiles show the real /integrations/stats counts, never demo numbers', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    fireEvent.click(screen.getByTestId('pill-integrations'))
    const panel = screen.getByTestId('integrations-panel')
    expect(panel).toHaveTextContent('Connections2')
    expect(panel).toHaveTextContent('Enabled1')
    expect(panel).toHaveTextContent('Failed deliveries1')
    expect(panel).toHaveTextContent('Dead-letter queue0')
    expect(panel).not.toHaveTextContent('Events/hr')
    expect(panel).not.toHaveTextContent('2840')
  })

  it('never shows the old fake XSOAR "connected" card (QRadar is legit here — plain-text TAXII compatibility line)', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    fireEvent.click(screen.getByTestId('pill-integrations'))
    expect(screen.queryByText(/XSOAR/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('integration-qradar')).not.toBeInTheDocument()
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

  // ─── API keys pill (S167) ───────────────────────────────────

  it('shows the API keys pill for super_admin and switches to it', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    expect(screen.getByTestId('pill-api-keys')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pill-api-keys'))
    expect(screen.getByTestId('api-keys-panel')).toBeInTheDocument()
  })

  it('shows the API keys pill for tenant_admin', () => {
    const tenantCC = { ...baseMockCC, isSuperAdmin: false, userRole: 'tenant_admin' }
    render(<UsersAccessTab data={tenantCC} />)
    expect(screen.getByTestId('pill-api-keys')).toBeInTheDocument()
  })

  it('hides the API keys pill for analyst', () => {
    const analystCC = { ...baseMockCC, isSuperAdmin: false, userRole: 'analyst' }
    render(<UsersAccessTab data={analystCC} />)
    expect(screen.queryByTestId('pill-api-keys')).not.toBeInTheDocument()
  })

  it('does not render the TaxiiFeedCard "Create an API key" link for analyst', () => {
    const analystCC = { ...baseMockCC, isSuperAdmin: false, userRole: 'analyst' }
    render(<UsersAccessTab data={analystCC} />)
    fireEvent.click(screen.getByTestId('pill-integrations'))
    expect(screen.queryByTestId('taxii-create-key-link')).not.toBeInTheDocument()
  })

  it('TaxiiFeedCard "Create an API key" link switches to the API keys pill', () => {
    render(<UsersAccessTab data={baseMockCC} />)
    fireEvent.click(screen.getByTestId('pill-integrations'))
    fireEvent.click(screen.getByTestId('taxii-create-key-link'))
    expect(screen.getByTestId('api-keys-panel')).toBeInTheDocument()
  })
})
