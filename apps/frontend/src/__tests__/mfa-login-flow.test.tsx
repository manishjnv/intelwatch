/**
 * @module __tests__/mfa-login-flow.test
 * @description Tests for MFA login flow: challenge page, setup required page, email not verified.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { MfaChallengePage } from '@/pages/MfaChallengePage'
import { MfaSetupRequiredPage } from '@/pages/MfaSetupRequiredPage'

// ─── Mock modules ────────────────────────────────────────────

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockChallenge = vi.fn()
vi.mock('@/hooks/use-mfa', () => ({
  useMfaSetup: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useMfaVerifySetup: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useMfaChallenge: () => ({
    mutate: mockChallenge,
    isPending: false,
    error: null,
  }),
}))

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => <div data-testid="qr-code">QR</div>,
}))

vi.mock('@/components/ui/Toast', () => ({
  toast: vi.fn(),
}))

let mockMfaToken: string | null = 'test-mfa-token'
const mockSetMfaToken = vi.fn()
const mockSetAuth = vi.fn()

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: any) => any) => {
    const state = {
      mfaToken: mockMfaToken,
      setMfaToken: mockSetMfaToken,
      setAuth: mockSetAuth,
      user: { id: 'u1', email: 'test@test.com', displayName: 'Test', role: 'analyst', tenantId: 't1', avatarUrl: null },
      setUser: vi.fn(),
    }
    return selector(state)
  },
}))

function renderPage(page: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        {page}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockMfaToken = 'test-mfa-token'
})

// ─── MFA Challenge Page ─────────────────────────────────────

describe('MfaChallengePage', () => {
  it('renders TOTP input and verify button', () => {
    renderPage(<MfaChallengePage />)
    expect(screen.getByText('Two-Factor Authentication')).toBeTruthy()
    expect(screen.getByTestId('mfa-code-input')).toBeTruthy()
    expect(screen.getByTestId('mfa-submit')).toBeTruthy()
  })

  it('calls challenge with mfaToken and code on submit', () => {
    renderPage(<MfaChallengePage />)
    fireEvent.change(screen.getByTestId('mfa-code-input'), { target: { value: '123456' } })
    fireEvent.click(screen.getByTestId('mfa-submit'))
    expect(mockChallenge).toHaveBeenCalledWith(
      { mfaToken: 'test-mfa-token', code: '123456' },
      expect.any(Object),
    )
  })

  it('redirects to login when no mfaToken', () => {
    mockMfaToken = null
    renderPage(<MfaChallengePage />)
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
  })

  it('shows backup code toggle', () => {
    renderPage(<MfaChallengePage />)
    expect(screen.getByTestId('toggle-backup')).toBeTruthy()
    expect(screen.getByText('Use a backup code instead')).toBeTruthy()
  })

  it('switches to backup code mode on toggle click', () => {
    renderPage(<MfaChallengePage />)
    fireEvent.click(screen.getByTestId('toggle-backup'))
    expect(screen.getByText('Enter a backup code')).toBeTruthy()
    expect(screen.getByText('Use authenticator code instead')).toBeTruthy()
  })

  it('has Back to login link that clears mfaToken', () => {
    renderPage(<MfaChallengePage />)
    fireEvent.click(screen.getByText('Back to login'))
    expect(mockSetMfaToken).toHaveBeenCalledWith(null)
    expect(mockNavigate).toHaveBeenCalledWith('/login')
  })
})

// ─── MFA Setup Required Page ────────────────────────────────

describe('MfaSetupRequiredPage', () => {
  it('renders forced setup message and inline wizard', () => {
    renderPage(<MfaSetupRequiredPage />)
    expect(screen.getByText('MFA Required')).toBeTruthy()
    expect(screen.getByText(/Your organization requires two-factor authentication/)).toBeTruthy()
    expect(screen.getByTestId('mfa-setup-wizard')).toBeTruthy()
  })

  it('redirects to login when no mfaToken', () => {
    mockMfaToken = null
    renderPage(<MfaSetupRequiredPage />)
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
  })
})
