/**
 * @module __tests__/honest-customization
 * @description DECISION-048 honest-UI coverage for CustomizationPage: no isDemo disabling,
 * error cards with Retry on failed loads, safe rendering when data is undefined, and real
 * mutations firing on module toggle / risk weight save.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { CustomizationPage } from '@/pages/CustomizationPage'

const mockModuleToggles = vi.fn()
const mockRiskWeights = vi.fn()
const mockNotificationChannels = vi.fn()
const mockCustomizationStats = vi.fn()
const mockPlanTiers = vi.fn()
const mockSubtaskMappings = vi.fn()
const mockRecommendedModels = vi.fn()
const mockCostEstimate = vi.fn()
const mockAnthropicKeyStatus = vi.fn()

const mockToggleModule = vi.fn()
const mockUpdateRiskWeight = vi.fn()
const mockResetRiskWeights = vi.fn()
const mockUpdateNotificationChannel = vi.fn()
const mockTestNotification = vi.fn()
const mockApplyPlan = vi.fn()
const mockSetSubtaskModel = vi.fn()
const mockSaveAnthropicKey = vi.fn()
const mockDeleteAnthropicKey = vi.fn()

vi.mock('@/hooks/use-phase5-data', () => ({
  useModuleToggles:            () => mockModuleToggles(),
  useRiskWeights:               () => mockRiskWeights(),
  useNotificationChannels:      () => mockNotificationChannels(),
  useCustomizationStats:        () => mockCustomizationStats(),
  usePlanTiers:                 () => mockPlanTiers(),
  useSubtaskMappings:           () => mockSubtaskMappings(),
  useRecommendedModels:         () => mockRecommendedModels(),
  useCostEstimate:              () => mockCostEstimate(),
  useAnthropicKeyStatus:        () => mockAnthropicKeyStatus(),
  useToggleModule:              () => mockToggleModule(),
  useUpdateRiskWeight:          () => mockUpdateRiskWeight(),
  useResetRiskWeights:          () => mockResetRiskWeights(),
  useUpdateNotificationChannel: () => mockUpdateNotificationChannel(),
  useTestNotification:          () => mockTestNotification(),
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
const RISK_WEIGHT = { id: 'rw-1', factor: 'Severity', weight: 0.35, description: 'Impact severity', min: 0, max: 1, default: 0.3 }
const NOTIF_CHANNEL = { id: 'nc-1', type: 'email' as const, name: 'Security Team Email', enabled: true, severities: ['critical', 'high'], quietHoursStart: null, quietHoursEnd: null }

function baseQuery<T>(data: T | undefined, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data, isLoading: false, isError: false, error: null, refetch: vi.fn(), ...overrides,
  }
}

function setupLoaded() {
  mockModuleToggles.mockReturnValue(baseQuery({ data: [MODULE], total: 1, page: 1, limit: 50 }))
  mockRiskWeights.mockReturnValue(baseQuery({ data: [RISK_WEIGHT] }))
  mockNotificationChannels.mockReturnValue(baseQuery({ data: [NOTIF_CHANNEL] }))
  mockCustomizationStats.mockReturnValue(baseQuery({ modulesEnabled: 8, customRules: 6, aiBudgetUsed: 31, theme: 'dark' }))
  mockPlanTiers.mockReturnValue(baseQuery({ data: [], total: 0, page: 1, limit: 50 }))
  mockSubtaskMappings.mockReturnValue(baseQuery({ data: [], total: 0, page: 1, limit: 50 }))
  mockRecommendedModels.mockReturnValue(baseQuery({ data: [], total: 0, page: 1, limit: 50 }))
  mockCostEstimate.mockReturnValue(baseQuery(null))
  mockAnthropicKeyStatus.mockReturnValue(baseQuery({ tenantId: 'default', hasKey: false, maskedKey: null }))
  mockToggleModule.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUpdateRiskWeight.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockResetRiskWeights.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockUpdateNotificationChannel.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockTestNotification.mockReturnValue({ mutate: vi.fn(), isPending: false })
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
    mockNotificationChannels.mockReturnValue(baseQuery(undefined))
    mockCustomizationStats.mockReturnValue(baseQuery(undefined))
    mockSubtaskMappings.mockReturnValue(baseQuery(undefined))
    mockAnthropicKeyStatus.mockReturnValue(baseQuery(undefined))
    render(<CustomizationPage />)
    for (const tab of ['Modules', 'AI Config', 'Risk Weights', 'Dashboard', 'Notifications']) {
      expect(() => fireEvent.click(screen.getByText(tab))).not.toThrow()
    }
  })

  it('risk weight save on mouse-up calls the real mutation', () => {
    const mutateFn = vi.fn()
    mockUpdateRiskWeight.mockReturnValue({ mutate: mutateFn, isPending: false })
    render(<CustomizationPage />)
    fireEvent.click(screen.getByText('Risk Weights'))
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '0.6' } })
    fireEvent.mouseUp(slider)
    expect(mutateFn).toHaveBeenCalledWith({ id: 'rw-1', weight: 0.6 })
  })
})
