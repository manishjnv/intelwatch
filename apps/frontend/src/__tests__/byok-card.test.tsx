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
  IOC_TYPES: ['ip', 'domain', 'url', 'hash_md5', 'hash_sha1', 'hash_sha256', 'email', 'cve', 'cidr', 'asn', 'ja3', 'mutex', 'registry_key'],
  useAnthropicKeyStatus:       () => mockAnthropicKeyStatus(),
  useSaveAnthropicKey:         () => mockSaveAnthropicKey(),
  useDeleteAnthropicKey:       () => mockDeleteAnthropicKey(),
  usePlanTiers:                () => ({ data: { data: [] }, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useSubtaskMappings:          () => ({ data: { data: [] }, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useRecommendedModels:        () => ({ data: { data: [] }, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useCostEstimate:             () => ({ data: null, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useApplyPlan:                () => ({ mutate: vi.fn(), isPending: false }),
  useSetSubtaskModel:          () => ({ mutate: vi.fn(), isPending: false }),
  useModuleToggles:            () => ({ data: { data: [] }, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useRiskWeights:              () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useRiskPresets:              () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useNotificationChannels:     () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useAiBudgetUsage:            () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useToggleModule:             () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateRiskWeight:         () => ({ mutate: vi.fn(), isPending: false }),
  useResetRiskWeights:         () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateNotificationChannel: () => ({ mutate: vi.fn(), isPending: false }),
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
    data: { tenantId: 'default', hasKey: false, maskedKey: null },
    isLoading: false, isError: false, error: null, refetch: vi.fn(),
  })
  mockSaveAnthropicKey.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false })
  mockDeleteAnthropicKey.mockReturnValue({ mutate: vi.fn(), isPending: false })
}

function setupHasKey(maskedKey = 'sk-ant-api...5678') {
  mockAnthropicKeyStatus.mockReturnValue({
    data: { tenantId: 'default', hasKey: true, maskedKey },
    isLoading: false, isError: false, error: null, refetch: vi.fn(),
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
      data: { tenantId: 'default', hasKey: false, maskedKey: null },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
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
