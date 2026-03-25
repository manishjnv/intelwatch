/**
 * Tests for the "Provider API Keys" BYOK card in CustomizationPage (AI tab).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { CustomizationPage } from '@/pages/CustomizationPage'

// ─── Mock all phase5 hooks ───────────────────────────────────────

const mockAnthropicKeyStatus = vi.fn()
const mockSaveAnthropicKey = vi.fn()
const mockDeleteAnthropicKey = vi.fn()

vi.mock('@/hooks/use-phase5-data', () => ({
  useAnthropicKeyStatus:       () => mockAnthropicKeyStatus(),
  useSaveAnthropicKey:         () => mockSaveAnthropicKey(),
  useDeleteAnthropicKey:       () => mockDeleteAnthropicKey(),
  usePlanTiers:                () => ({ data: { data: [] }, isDemo: true }),
  useSubtaskMappings:          () => ({ data: { data: [] }, isDemo: true }),
  useRecommendedModels:        () => ({ data: { data: [] }, isDemo: true }),
  useCostEstimate:             () => ({ data: null, isDemo: true }),
  useApplyPlan:                () => ({ mutate: vi.fn(), isPending: false }),
  useSetSubtaskModel:          () => ({ mutate: vi.fn(), isPending: false }),
  useModuleToggles:            () => ({ data: { data: [] }, isDemo: true }),
  useAIConfigs:                () => ({ data: { data: [] }, isDemo: true }),
  useRiskWeights:              () => ({ data: { data: [] }, isDemo: true }),
  useNotificationChannels:     () => ({ data: { data: [] }, isDemo: true }),
  useCustomizationStats:       () => ({ data: { modulesEnabled: 0, customRules: 0, aiBudgetUsed: 0, theme: 'dark' }, isDemo: true }),
  useToggleModule:             () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateAIConfig:           () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateRiskWeight:         () => ({ mutate: vi.fn(), isPending: false }),
  useResetRiskWeights:         () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateNotificationChannel: () => ({ mutate: vi.fn(), isPending: false }),
  useTestNotification:         () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn((selector: (s: object) => unknown) =>
    selector({ user: { displayName: 'Admin', email: 'a@b.com' }, tenant: { name: 'ACME' }, accessToken: 'tok' }),
  ),
}))
vi.mock('@/stores/theme-store', () => ({ useThemeStore: vi.fn(() => ({ theme: 'dark' })) }))
vi.mock('@/stores/sidebar-store', () => ({ useSidebarStore: vi.fn(() => ({ isOpen: true, toggle: vi.fn() })) }))

// ─── Helpers ─────────────────────────────────────────────────────

function setupNoKey() {
  mockAnthropicKeyStatus.mockReturnValue({
    data: { data: { tenantId: 'default', hasKey: false, maskedKey: null } },
    isDemo: false,
    isLoading: false,
  })
  mockSaveAnthropicKey.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false })
  mockDeleteAnthropicKey.mockReturnValue({ mutate: vi.fn(), isPending: false })
}

function setupHasKey(maskedKey = 'sk-ant-api...5678') {
  mockAnthropicKeyStatus.mockReturnValue({
    data: { data: { tenantId: 'default', hasKey: true, maskedKey } },
    isDemo: false,
    isLoading: false,
  })
  mockSaveAnthropicKey.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false })
  mockDeleteAnthropicKey.mockReturnValue({ mutate: vi.fn(), isPending: false })
}

/** Navigate to the AI tab by clicking it */
function goToAiTab() {
  fireEvent.click(screen.getByRole('button', { name: /AI Config/i }))
}

// ─── Tests ───────────────────────────────────────────────────────

describe('ProviderApiKeysCard — no key state', () => {
  beforeEach(() => {
    setupNoKey()
    render(<CustomizationPage />)
    goToAiTab()
  })

  it('renders "Using platform key" badge when hasKey is false', () => {
    expect(screen.getByText('Using platform key')).toBeTruthy()
  })

  it('renders password input and Save Key button when no key is configured', () => {
    expect(screen.getByPlaceholderText('sk-ant-...')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Save Key/i })).toBeTruthy()
  })
})

describe('ProviderApiKeysCard — has key state', () => {
  beforeEach(() => {
    setupHasKey()
    render(<CustomizationPage />)
    goToAiTab()
  })

  it('renders "Configured" badge and masked key when hasKey is true', () => {
    expect(screen.getByText('Configured')).toBeTruthy()
    expect(screen.getByText('sk-ant-api...5678')).toBeTruthy()
  })

  it('renders Remove button instead of input when key is set', () => {
    expect(screen.getByRole('button', { name: /Remove Anthropic API key/i })).toBeTruthy()
    expect(screen.queryByPlaceholderText('sk-ant-...')).toBeNull()
  })
})

describe('ProviderApiKeysCard — interactions', () => {
  it('Save Key button calls mutate with trimmed input value', () => {
    const mutateFn = vi.fn()
    mockAnthropicKeyStatus.mockReturnValue({
      data: { data: { tenantId: 'default', hasKey: false, maskedKey: null } },
      isDemo: false, isLoading: false,
    })
    mockSaveAnthropicKey.mockReturnValue({ mutate: mutateFn, isPending: false, isError: false })
    mockDeleteAnthropicKey.mockReturnValue({ mutate: vi.fn(), isPending: false })

    render(<CustomizationPage />)
    goToAiTab()

    const input = screen.getByPlaceholderText('sk-ant-...')
    fireEvent.change(input, { target: { value: '  sk-ant-apiKEY1234  ' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Key/i }))

    expect(mutateFn).toHaveBeenCalledWith('sk-ant-apiKEY1234', expect.any(Object))
  })

  it('Remove button first shows confirm state, second click calls delete mutation', () => {
    const deleteFn = vi.fn()
    setupHasKey()
    mockDeleteAnthropicKey.mockReturnValue({ mutate: deleteFn, isPending: false })

    render(<CustomizationPage />)
    goToAiTab()

    const removeBtn = screen.getByRole('button', { name: /Remove Anthropic API key/i })
    // First click → confirm state
    fireEvent.click(removeBtn)
    expect(screen.getByText(/Confirm remove/i)).toBeTruthy()
    // Second click → calls mutation
    fireEvent.click(screen.getByText(/Confirm remove/i))
    expect(deleteFn).toHaveBeenCalled()
  })
})
