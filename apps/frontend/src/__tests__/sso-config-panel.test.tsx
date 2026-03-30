/**
 * @module __tests__/sso-config-panel.test
 * @description Tests for SsoConfigPanel — provider selection, SAML/OIDC fields,
 * domain tags, group mappings, save/test/delete, status badge, admin view.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { SsoConfigPanel, SsoStatusBadge, AdminSsoView } from '@/components/command-center/SsoConfigPanel'
import type { SsoConfig } from '@/hooks/use-sso'

// ─── Mock hooks ──────────────────────────────────────────────

const mockSaveMutate = vi.fn()
const mockDeleteMutate = vi.fn()
const mockTestMutate = vi.fn()

let mockSsoConfig: SsoConfig | null = null

vi.mock('@/hooks/use-sso', () => ({
  useSsoConfig: () => ({
    data: mockSsoConfig,
    isLoading: false, isDemo: false,
  }),
  useSaveSsoConfig: () => ({
    mutate: mockSaveMutate,
    isPending: false,
  }),
  useDeleteSsoConfig: () => ({
    mutate: mockDeleteMutate,
    isPending: false,
  }),
  useTestSsoConnection: () => ({
    mutate: mockTestMutate,
    isPending: false,
  }),
  useAdminSsoConfig: () => ({
    data: {
      provider: 'saml', enabled: true,
      entityId: 'https://idp.acme.com/metadata',
      approvedDomains: ['acme.com'],
      groupMappings: [{ groupName: 'IT-Admins', role: 'tenant_admin' }],
    },
    isLoading: false, isDemo: false,
  }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (sel: any) => sel({ user: { id: 'u0', role: 'tenant_admin', tenantId: 't1' } }),
}))

vi.mock('@/components/ui/Toast', () => ({ toast: vi.fn() }))

// ─── Tests: SsoStatusBadge ──────────────────────────────────

describe('SsoStatusBadge', () => {
  it('shows "SSO Not Configured" when config is null', () => {
    render(<SsoStatusBadge config={null} />)
    expect(screen.getByText('SSO Not Configured')).toBeInTheDocument()
  })

  it('shows "SSO Configured (Disabled)" when configured but not enabled', () => {
    render(<SsoStatusBadge config={{ provider: 'saml', enabled: false, approvedDomains: [], groupMappings: [] }} />)
    expect(screen.getByText('SSO Configured (Disabled)')).toBeInTheDocument()
  })

  it('shows "SSO Active: SAML" when configured and enabled', () => {
    render(<SsoStatusBadge config={{ provider: 'saml', enabled: true, approvedDomains: [], groupMappings: [] }} />)
    expect(screen.getByText('SSO Active: SAML')).toBeInTheDocument()
  })

  it('shows "SSO Active: OIDC" for OIDC provider', () => {
    render(<SsoStatusBadge config={{ provider: 'oidc', enabled: true, approvedDomains: [], groupMappings: [] }} />)
    expect(screen.getByText('SSO Active: OIDC')).toBeInTheDocument()
  })
})

// ─── Tests: SsoConfigPanel ──────────────────────────────────

describe('SsoConfigPanel', () => {
  beforeEach(() => {
    mockSsoConfig = null
    mockSaveMutate.mockClear()
    mockDeleteMutate.mockClear()
    mockTestMutate.mockClear()
  })

  it('renders provider selector with SAML and OIDC', () => {
    render(<SsoConfigPanel />)
    expect(screen.getByTestId('provider-saml')).toBeInTheDocument()
    expect(screen.getByTestId('provider-oidc')).toBeInTheDocument()
  })

  it('SAML selected → shows Entity ID, Metadata URL, Certificate', () => {
    render(<SsoConfigPanel />)
    fireEvent.click(screen.getByTestId('provider-saml'))
    expect(screen.getByTestId('saml-fields')).toBeInTheDocument()
    expect(screen.getByTestId('entity-id-input')).toBeInTheDocument()
    expect(screen.getByTestId('metadata-url-input')).toBeInTheDocument()
    expect(screen.getByTestId('certificate-input')).toBeInTheDocument()
  })

  it('OIDC selected → shows Client ID, Client Secret, Issuer URL', () => {
    render(<SsoConfigPanel />)
    fireEvent.click(screen.getByTestId('provider-oidc'))
    expect(screen.getByTestId('oidc-fields')).toBeInTheDocument()
    expect(screen.getByTestId('client-id-input')).toBeInTheDocument()
    expect(screen.getByTestId('client-secret-input')).toBeInTheDocument()
    expect(screen.getByTestId('issuer-url-input')).toBeInTheDocument()
  })

  it('client secret placeholder shows dots for existing config', () => {
    mockSsoConfig = {
      provider: 'oidc', enabled: true,
      clientId: 'abc', clientSecret: '•••',
      issuerUrl: 'https://accounts.google.com',
      approvedDomains: [], groupMappings: [],
    }
    render(<SsoConfigPanel />)
    const secretInput = screen.getByTestId('client-secret-input')
    expect(secretInput).toHaveAttribute('placeholder', expect.stringContaining('•'))
  })

  it('approved domains: add and remove tags', () => {
    render(<SsoConfigPanel />)
    const input = screen.getByTestId('domain-input')
    fireEvent.change(input, { target: { value: 'acme.com' } })
    fireEvent.click(screen.getByTestId('add-domain-btn'))
    expect(screen.getByText('acme.com')).toBeInTheDocument()

    // Remove
    fireEvent.click(screen.getByTestId('remove-domain-acme.com'))
    expect(screen.queryByText('acme.com')).not.toBeInTheDocument()
  })

  it('group mapping: add row, set group + role, remove row', () => {
    render(<SsoConfigPanel />)
    fireEvent.click(screen.getByTestId('add-mapping-btn'))
    expect(screen.getByTestId('group-name-0')).toBeInTheDocument()
    expect(screen.getByTestId('group-role-0')).toBeInTheDocument()

    // Set values
    fireEvent.change(screen.getByTestId('group-name-0'), { target: { value: 'IT-Admins' } })
    fireEvent.change(screen.getByTestId('group-role-0'), { target: { value: 'tenant_admin' } })
    expect(screen.getByTestId('group-role-0')).toHaveValue('tenant_admin')

    // Only tenant_admin and analyst are valid options
    const options = screen.getByTestId('group-role-0').querySelectorAll('option')
    const values = Array.from(options).map(o => o.getAttribute('value'))
    expect(values).toContain('tenant_admin')
    expect(values).toContain('analyst')
    expect(values).not.toContain('super_admin')

    // Remove row
    fireEvent.click(screen.getByTestId('remove-mapping-0'))
    expect(screen.queryByTestId('group-name-0')).not.toBeInTheDocument()
  })

  it('save → PUT called', () => {
    render(<SsoConfigPanel />)
    fireEvent.click(screen.getByTestId('sso-save-btn'))
    expect(mockSaveMutate).toHaveBeenCalled()
  })

  it('test connection → POST called', () => {
    render(<SsoConfigPanel />)
    fireEvent.click(screen.getByTestId('sso-test-btn'))
    expect(mockTestMutate).toHaveBeenCalled()
  })

  it('remove SSO → confirm modal → DELETE called', () => {
    mockSsoConfig = {
      provider: 'saml', enabled: true,
      entityId: 'https://test.com',
      approvedDomains: [], groupMappings: [],
    }
    render(<SsoConfigPanel />)
    fireEvent.click(screen.getByTestId('sso-remove-btn'))
    expect(screen.getByTestId('delete-sso-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('delete-sso-confirm-btn'))
    expect(mockDeleteMutate).toHaveBeenCalled()
  })

  it('enabled toggle works', () => {
    render(<SsoConfigPanel />)
    const toggle = screen.getByTestId('sso-enabled-toggle')
    expect(screen.getByText('SSO Disabled')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.getByText('SSO Enabled')).toBeInTheDocument()
  })
})

// ─── Tests: AdminSsoView ────────────────────────────────────

describe('AdminSsoView', () => {
  it('renders read-only tenant SSO config', () => {
    render(<AdminSsoView tenantId="t1" />)
    const view = screen.getByTestId('admin-sso-view')
    expect(view).toBeInTheDocument()
    expect(view.textContent).toContain('SAML')
    expect(screen.getByText('acme.com')).toBeInTheDocument()
    expect(view.textContent).toContain('IT-Admins')
  })

  it('shows no edit buttons in admin view', () => {
    render(<AdminSsoView tenantId="t1" />)
    expect(screen.queryByTestId('sso-save-btn')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sso-remove-btn')).not.toBeInTheDocument()
  })
})
