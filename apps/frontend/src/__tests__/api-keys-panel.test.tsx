/**
 * @module __tests__/api-keys-panel
 * @description Tests for the API keys panel (S167). Mocked hook return shapes mirror the
 * real backend response bodies from apps/user-management-service/src/routes/api-keys.ts
 * (RCA #45) — list rows use `lastUsed` (not `lastUsedAt`), create returns the raw `key`
 * exactly once.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test/test-utils'
import { ApiKeysPanel } from '@/components/command-center/ApiKeysPanel'
import { ApiError } from '@/lib/api'
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/hooks/use-api-keys'

vi.mock('@/hooks/use-api-keys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-api-keys')>()
  return {
    ...actual,
    useApiKeys: vi.fn(),
    useCreateApiKey: vi.fn(),
    useRevokeApiKey: vi.fn(),
  }
})

vi.mock('@/components/ui/Toast', () => ({ toast: vi.fn() }))

// FeatureGate reads useFeatureLimits directly — mirrors feature-gate-wiring.test.tsx.
let mockApiAccessEnabled = true
vi.mock('@/hooks/use-feature-limits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-feature-limits')>()
  return {
    ...actual,
    useFeatureEnabled: () => mockApiAccessEnabled,
    useFeatureLimits: () => ({
      features: [{ featureKey: 'api_access', enabled: mockApiAccessEnabled, limitDaily: 0, usedDaily: 0, limitMonthly: 0, usedMonthly: 0, percentDaily: 0, percentMonthly: 0 }],
      isLoading: false,
      error: null,
    }),
  }
})

// Real backend shape: api-keys.ts GET /api-keys select (line 101).
const REAL_KEY = {
  id: 'k1', name: 'Splunk TAXII pull', prefix: 'etip_a1b2c3',
  scopes: ['ioc:read'], lastUsed: new Date(Date.now() - 3600_000).toISOString(),
  expiresAt: null, createdAt: '2026-09-01T00:00:00.000Z',
}

// Real backend shape: api-keys.ts POST /api-keys response (line 90-92).
const REAL_CREATED = {
  id: 'k2', name: 'New key', prefix: 'etip_ffffff',
  scopes: ['ioc:read'], expiresAt: null, createdAt: '2026-09-28T00:00:00.000Z',
  key: 'etip_ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
}

describe('ApiKeysPanel', () => {
  const createMutate = vi.fn()
  const revokeMutate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiAccessEnabled = true
    vi.mocked(useCreateApiKey).mockReturnValue({ mutate: createMutate, isPending: false } as never)
    vi.mocked(useRevokeApiKey).mockReturnValue({ mutate: revokeMutate, isPending: false } as never)
  })

  it('renders key rows without ever showing the full raw key', () => {
    vi.mocked(useApiKeys).mockReturnValue({
      data: { data: [REAL_KEY], total: 1, page: 1, limit: 50 },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    } as never)
    render(<ApiKeysPanel />)
    expect(screen.getByTestId('api-key-k1')).toBeInTheDocument()
    expect(screen.getByText('Splunk TAXII pull')).toBeInTheDocument()
    expect(screen.getByText('etip_a1b2c3…')).toBeInTheDocument()
    expect(screen.getByText('ioc:read')).toBeInTheDocument()
    expect(screen.queryByTestId('raw-api-key')).not.toBeInTheDocument()
  })

  it('shows the empty state with a Create API key CTA', () => {
    vi.mocked(useApiKeys).mockReturnValue({
      data: { data: [], total: 0, page: 1, limit: 50 },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    } as never)
    render(<ApiKeysPanel />)
    expect(screen.getByTestId('api-keys-empty')).toBeInTheDocument()
    expect(screen.getByText('No API keys yet')).toBeInTheDocument()
  })

  it('shows an error state with retry', () => {
    const refetch = vi.fn()
    vi.mocked(useApiKeys).mockReturnValue({
      data: undefined, isLoading: false, isError: true, error: new ApiError(500, 'INTERNAL', 'Server error'), refetch,
    } as never)
    render(<ApiKeysPanel />)
    expect(screen.getByTestId('query-error')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('query-retry'))
    expect(refetch).toHaveBeenCalled()
  })

  it('shows the plan-gated upgrade state when api_access is disabled', () => {
    mockApiAccessEnabled = false
    vi.mocked(useApiKeys).mockReturnValue({
      data: { data: [], total: 0, page: 1, limit: 50 },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    } as never)
    render(<ApiKeysPanel />)
    expect(screen.getByTestId('upgrade-cta-api_access')).toBeInTheDocument()
    expect(screen.queryByTestId('api-keys-panel')).not.toBeInTheDocument()
  })

  describe('create dialog', () => {
    beforeEach(() => {
      vi.mocked(useApiKeys).mockReturnValue({
        data: { data: [], total: 0, page: 1, limit: 50 },
        isLoading: false, isError: false, error: null, refetch: vi.fn(),
      } as never)
    })

    it('sends the selected scopes in the request body', () => {
      render(<ApiKeysPanel />)
      fireEvent.click(screen.getByTestId('create-api-key-btn'))
      fireEvent.change(screen.getByTestId('api-key-name-input'), { target: { value: 'My key' } })
      fireEvent.click(screen.getByTestId('scope-feed:read'))
      fireEvent.click(screen.getByTestId('create-key-submit-btn'))
      expect(createMutate).toHaveBeenCalledWith(
        { name: 'My key', scopes: ['ioc:read', 'feed:read'], expiresInDays: undefined },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      )
    })

    it('shows the raw key once with Copy, and clears it on close', async () => {
      createMutate.mockImplementation((_input, opts) => opts.onSuccess(REAL_CREATED))
      Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })

      render(<ApiKeysPanel />)
      fireEvent.click(screen.getByTestId('create-api-key-btn'))
      fireEvent.change(screen.getByTestId('api-key-name-input'), { target: { value: 'New key' } })
      fireEvent.click(screen.getByTestId('create-key-submit-btn'))

      expect(screen.getByTestId('raw-api-key')).toHaveTextContent(REAL_CREATED.key)
      fireEvent.click(screen.getByTestId('copy-raw-key-btn'))
      await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(REAL_CREATED.key))

      // Closing clears the key from state — it was never in the query cache.
      fireEvent.click(screen.getByTestId('create-key-done-btn'))
      expect(screen.queryByTestId('raw-api-key')).not.toBeInTheDocument()

      // Reopening starts a fresh create form, not the old key.
      fireEvent.click(screen.getByTestId('create-api-key-btn'))
      expect(screen.queryByTestId('raw-api-key')).not.toBeInTheDocument()
      expect(screen.getByTestId('api-key-name-input')).toBeInTheDocument()
    })

    it('Escape clears the one-time key and closes the dialog', () => {
      createMutate.mockImplementation((_input, opts) => opts.onSuccess(REAL_CREATED))
      render(<ApiKeysPanel />)
      fireEvent.click(screen.getByTestId('create-api-key-btn'))
      fireEvent.change(screen.getByTestId('api-key-name-input'), { target: { value: 'New key' } })
      fireEvent.click(screen.getByTestId('create-key-submit-btn'))
      expect(screen.getByTestId('raw-api-key')).toBeInTheDocument()

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByTestId('create-api-key-dialog')).not.toBeInTheDocument()
    })
  })

  describe('revoke', () => {
    beforeEach(() => {
      vi.mocked(useApiKeys).mockReturnValue({
        data: { data: [REAL_KEY], total: 1, page: 1, limit: 50 },
        isLoading: false, isError: false, error: null, refetch: vi.fn(),
      } as never)
    })

    it('requires confirmation before calling DELETE', () => {
      render(<ApiKeysPanel />)
      fireEvent.click(screen.getByTestId('revoke-k1'))
      expect(revokeMutate).not.toHaveBeenCalled()
      expect(screen.getByTestId('revoke-confirm-dialog')).toBeInTheDocument()
    })

    it('calls revoke with the key id on confirm', () => {
      render(<ApiKeysPanel />)
      fireEvent.click(screen.getByTestId('revoke-k1'))
      fireEvent.click(screen.getByTestId('revoke-confirm-btn'))
      expect(revokeMutate).toHaveBeenCalledWith('k1', expect.objectContaining({ onSuccess: expect.any(Function) }))
    })

    it('cancel dismisses without calling DELETE', () => {
      render(<ApiKeysPanel />)
      fireEvent.click(screen.getByTestId('revoke-k1'))
      fireEvent.click(screen.getByTestId('revoke-cancel-btn'))
      expect(revokeMutate).not.toHaveBeenCalled()
      expect(screen.queryByTestId('revoke-confirm-dialog')).not.toBeInTheDocument()
    })
  })
})
