/**
 * @module __tests__/honest-customization
 * @description DECISION-048 honest-UI coverage for CustomizationPage: no isDemo disabling,
 * error cards with Retry on failed loads, safe rendering when data is undefined, and real
 * mutations firing on module toggle / risk weight save / notification channel update.
 * Risk Weights and Notifications were rewired off the BLOCKED placeholder hooks onto the real
 * customization-service routes (GET/PUT /customization/risk/profiles/:type, POST
 * /customization/risk/presets/apply, GET /customization/notifications, PUT
 * /customization/notifications/channels/:channel) — see use-phase5-data.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { CustomizationPage } from '@/pages/CustomizationPage'

const mockModuleToggles = vi.fn()
const mockRiskWeights = vi.fn()
const mockRiskPresets = vi.fn()
const mockNotificationChannels = vi.fn()
const mockAiBudgetUsage = vi.fn()
const mockPlanTiers = vi.fn()
const mockSubtaskMappings = vi.fn()
const mockRecommendedModels = vi.fn()
const mockCostEstimate = vi.fn()
const mockAnthropicKeyStatus = vi.fn()

const mockToggleModule = vi.fn()
const mockUpdateRiskWeight = vi.fn()
const mockResetRiskWeights = vi.fn()
const mockUpdateNotificationChannel = vi.fn()
const mockApplyPlan = vi.fn()
const mockSetSubtaskModel = vi.fn()
const mockSaveAnthropicKey = vi.fn()
const mockDeleteAnthropicKey = vi.fn()

vi.mock('@/hooks/use-phase5-data', () => ({
  IOC_TYPES: ['ip', 'domain', 'url', 'hash_md5', 'hash_sha1', 'hash_sha256', 'email', 'cve', 'cidr', 'asn', 'ja3', 'mutex', 'registry_key'],
  useModuleToggles:            () => mockModuleToggles(),
  useRiskWeights:               (iocType: string) => mockRiskWeights(iocType),
  useRiskPresets:               () => mockRiskPresets(),
  useNotificationChannels:      () => mockNotificationChannels(),
  useAiBudgetUsage:             () => mockAiBudgetUsage(),
  usePlanTiers:                 () => mockPlanTiers(),
  useSubtaskMappings:           () => mockSubtaskMappings(),
  useRecommendedModels:         () => mockRecommendedModels(),
  useCostEstimate:              () => mockCostEstimate(),
  useAnthropicKeyStatus:        () => mockAnthropicKeyStatus(),
  useToggleModule:              () => mockToggleModule(),
  useUpdateRiskWeight:          () => mockUpdateRiskWeight(),
  useResetRiskWeights:          () => mockResetRiskWeights(),
  useUpdateNotificationChannel: () => mockUpdateNotificationChannel(),
  useApplyPlan:                 () => mockApplyPlan(),
  useSetSubtaskModel:           () => mockSetSubtaskModel(),
  useSaveAnthropicKey:          () => mockSaveAnthropicKey(),
  useDeleteAnthropicKey:        () => mockDeleteAnthropicKey(),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector: (s: object) => unknown) =>
    selector({ user: { displayName: 'Admin', email: 'a@b.com' }, tenant: { name: 'ACME' }, accessToken: 'tok' }),
  ),
}))
vi.mock('@/stores/theme-store', () => ({ useThemeStore: vi.fn(() => ({ theme: 'dark' })) }))
vi.mock('@/stores/sidebar-store', () => ({ useSidebarStore: vi.fn(() => ({ isOpen: true, toggle: vi.fn() })) }))

// ─── Real-shape fixtures ──────────────────────────────────────────

const MODULE = { id: 'mod-1', name: 'Ingestion Service', description: 'Feed collection and parsing', enabled: true, icon: 'Zap', dependencies: [], category: 'Pipeline' }

// Single-factor profile: sums to 1.0 by construction, so "no edits yet" == Save enabled.
const RISK_PROFILE = { id: 'rp-1', tenantId: 'default', iocType: 'ip', weights: { source_reliability: 1 }, decayRate: 0.05, updatedAt: '2026-01-01', updatedBy: 'system' }
const BALANCED_PRESET = { name: 'balanced', weights: { source_reliability: 0.25, freshness: 0.2, corroboration: 0.2, specificity: 0.2, context: 0.15 } }

const NOTIF_PREFS = {
  channels: [
    { id: 'email', type: 'email', name: 'Email', enabled: false, threshold: 'medium', config: {} },
    { id: 'webhook', type: 'webhook', name: 'Webhook', enabled: false, threshold: 'medium', config: {} },
    { id: 'in_app', type: 'in_app', name: 'In-app', enabled: true, threshold: 'medium', config: {} },
  ],
  quietHours: { enabled: false, start: '22:00', end: '07:00', timezone: 'UTC', daysOfWeek: ['mon'] },
}

function baseQuery<T>(data: T | undefined, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data, isLoading: false, isError: false, error: null, refetch: vi.fn(), ...overrides,
  }
}

function setupLoaded() {
  mockModuleToggles.mockReturnValue(baseQuery({ data: [MODULE], total: 1, page: 1, limit: 50 }))
  mockRiskWeights.mockReturnValue(baseQuery(RISK_PROFILE))
  mockRiskPresets.mockReturnValue(baseQuery({ data: [BALANCED_PRESET], total: 1, page: 1, limit: 50 }))
  mockNotificationChannels.mockReturnValue(baseQuery(NOTIF_PREFS))
  mockAiBudgetUsage.mockReturnValue(baseQuery({ totalTokens: 0, byTask: {}, dailyUsage: 0, monthlyUsage: 0, budgetUtilization: 0.31 }))
  mockPlanTiers.mockReturnValue(baseQuery({ data: [], total: 0, page: 1, limit: 50 }))
  mockSubtaskMappings.mockReturnValue(baseQuery({ data: [], total: 0, page: 1, limit: 50 }))
  mockRecommendedModels.mockReturnValue(baseQuery({ data: [], total: 0, page: 1, limit: 50 }))
  mockCostEstimate.mockReturnValue(baseQuery(null))
  mockAnthropicKeyStatus.mockReturnValue(baseQuery({ tenantId: 'default', hasKey: false, maskedKey: null }))
  mockToggleModule.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUpdateRiskWeight.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false, error: null })
  mockResetRiskWeights.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUpdateNotificationChannel.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockApplyPlan.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockSetSubtaskModel.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockSaveAnthropicKey.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false })
  mockDeleteAnthropicKey.mockReturnValue({ mutate: vi.fn(), isPending: false })
}

beforeEach(() => { vi.clearAllMocks(); setupLoaded() })

describe('CustomizationPage — honest UI', () => {
  it('data loaded: module toggle is enabled and no Demo banner renders', () => {
    render(<CustomizationPage />)
    expect(screen.queryByText('Demo')).not.toBeInTheDocument()
    const card = screen.getByText('Ingestion Service').closest('.p-3')!
    const toggleBtn = card.querySelector('button')!
    expect(toggleBtn).not.toBeDisabled()
  })

  it('module toggle click calls the real mutation', () => {
    const mutateFn = vi.fn()
    mockToggleModule.mockReturnValue({ mutate: mutateFn, isPending: false })
    render(<CustomizationPage />)
    const card = screen.getByText('Ingestion Service').closest('.p-3')!
    const toggleBtn = card.querySelector('button')!
    fireEvent.click(toggleBtn)
    expect(mutateFn).toHaveBeenCalledWith({ id: 'mod-1', enabled: false })
  })

  it('modules isError shows query-error with Retry calling refetch', () => {
    const refetch = vi.fn()
    mockModuleToggles.mockReturnValue(baseQuery(undefined, { isError: true, error: new Error('boom'), refetch }))
    render(<CustomizationPage />)
    expect(screen.getByTestId('query-error')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('query-retry'))
    expect(refetch).toHaveBeenCalled()
  })

  it('risk weights isError shows query-error on Risk Weights tab', () => {
    const refetch = vi.fn()
    mockRiskWeights.mockReturnValue(baseQuery(undefined, { isError: true, error: new Error('boom'), refetch }))
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Risk Weights'))
    expect(screen.getByTestId('query-error')).toBeInTheDocument()
  })

  it('notifications isError shows query-error on Notifications tab', () => {
    mockNotificationChannels.mockReturnValue(baseQuery(undefined, { isError: true, error: new Error('boom') }))
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Notifications'))
    expect(screen.getByTestId('query-error')).toBeInTheDocument()
  })

  it('data undefined + not loading does not crash any tab', () => {
    mockModuleToggles.mockReturnValue(baseQuery(undefined))
    mockRiskWeights.mockReturnValue(baseQuery(undefined))
    mockRiskPresets.mockReturnValue(baseQuery(undefined))
    mockNotificationChannels.mockReturnValue(baseQuery(undefined))
    mockAiBudgetUsage.mockReturnValue(baseQuery(undefined))
    mockSubtaskMappings.mockReturnValue(baseQuery(undefined))
    mockAnthropicKeyStatus.mockReturnValue(baseQuery(undefined))
    render(<CustomizationPage />)
    for (const tab of ['Modules', 'AI Config', 'Risk Weights', 'Dashboard', 'Notifications']) {
      expect(() => fireEvent.click(screen.getByText(tab))).not.toThrow()
    }
  })

  it('risk weight Save button is enabled when the draft sums to 1.0 and calls the real PUT mutation', () => {
    const mutateFn = vi.fn()
    mockUpdateRiskWeight.mockReturnValue({ mutate: mutateFn, isPending: false, isError: false, error: null })
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Risk Weights'))
    const saveBtn = screen.getByText('Save')
    expect(saveBtn).not.toBeDisabled()
    fireEvent.click(saveBtn)
    expect(mutateFn).toHaveBeenCalledWith(
      { iocType: 'ip', weights: { source_reliability: 1 } },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('risk weight Save button disables once the draft no longer sums to 1.0', () => {
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Risk Weights'))
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '0.5' } })
    expect(screen.getByText('Save')).toBeDisabled()
  })

  it('reset-to-balanced calls the preset-apply mutation', () => {
    const mutateFn = vi.fn()
    mockResetRiskWeights.mockReturnValue({ mutate: mutateFn, isPending: false })
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Risk Weights'))
    fireEvent.click(screen.getByText('Reset all IOC types to balanced'))
    expect(mutateFn).toHaveBeenCalledWith('balanced', expect.objectContaining({ onSuccess: expect.any(Function) }))
  })

  it('does not render a Test Notification button (no backend route for it)', () => {
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Notifications'))
    expect(screen.queryByText('Test Notification')).not.toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('Webhook')).toBeInTheDocument()
    expect(screen.getByText('In-app')).toBeInTheDocument()
  })

  it('notification channel toggle calls the real channel-update mutation', () => {
    const mutateFn = vi.fn()
    mockUpdateNotificationChannel.mockReturnValue({ mutate: mutateFn, isPending: false })
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Notifications'))
    const card = screen.getByText('In-app').closest('.p-3')!
    fireEvent.click(card.querySelector('button')!)
    expect(mutateFn).toHaveBeenCalledWith({ channel: 'in_app', enabled: false, threshold: 'medium', config: {} })
  })

  it('stats bar shows the real module-enabled count and AI budget usage, no Custom Rules or Theme tile', () => {
    render(<CustomizationPage />)
    expect(screen.getByText('Modules Enabled').nextSibling?.textContent).toBe('1')
    expect(screen.getByText('AI Budget Used').nextSibling?.textContent).toBe('31%')
    expect(screen.queryByText('Custom Rules')).not.toBeInTheDocument()
    expect(screen.queryByText('Theme')).not.toBeInTheDocument()
  })

  it('stats bar shows — while modules/usage data is unavailable', () => {
    mockModuleToggles.mockReturnValue(baseQuery(undefined))
    mockAiBudgetUsage.mockReturnValue(baseQuery(undefined))
    render(<CustomizationPage />)
    expect(screen.getByText('Modules Enabled').nextSibling?.textContent).toBe('—')
    expect(screen.getByText('AI Budget Used').nextSibling?.textContent).toBe('—')
  })
})
