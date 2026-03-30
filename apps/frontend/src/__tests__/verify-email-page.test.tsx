/**
 * @module __tests__/verify-email-page.test
 * @description Tests for VerifyEmailPage — token verification, resend, error states.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { VerifyEmailPage } from '@/pages/VerifyEmailPage'
import { ApiError } from '@/lib/api'

// ─── Mock hooks ──────────────────────────────────────────────

const mockVerify = vi.fn()
const mockResend = vi.fn()

vi.mock('@/hooks/use-email-verification', () => ({
  useVerifyEmail: () => ({
    mutate: mockVerify,
    isPending: false,
    error: null,
  }),
  useResendVerification: () => ({
    mutate: mockResend,
    isPending: false,
    error: null,
  }),
}))

vi.mock('@/components/ui/Toast', () => ({
  toast: vi.fn(),
}))

function renderWithRouter(initialEntry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <VerifyEmailPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => vi.clearAllMocks())

// ─── Tests ──────────────────────────────────────────────────

describe('VerifyEmailPage', () => {
  it('shows verifying state when token is present', () => {
    renderWithRouter('/auth/verify-email?token=valid-token')
    expect(screen.getByTestId('state-verifying')).toBeTruthy()
    expect(screen.getByText('Verifying your email...')).toBeTruthy()
  })

  it('calls verify endpoint with token on mount', () => {
    renderWithRouter('/auth/verify-email?token=my-token')
    expect(mockVerify).toHaveBeenCalledWith({ token: 'my-token' }, expect.any(Object))
  })

  it('shows success state after successful verification', () => {
    mockVerify.mockImplementation((_: any, opts: any) => opts.onSuccess())
    renderWithRouter('/auth/verify-email?token=good-token')
    expect(screen.getByTestId('state-success')).toBeTruthy()
    expect(screen.getByText('Email Verified!')).toBeTruthy()
    expect(screen.getByTestId('go-to-login')).toBeTruthy()
  })

  it('shows expired state on 410 error', () => {
    mockVerify.mockImplementation((_: any, opts: any) => {
      opts.onError(new ApiError(410, 'TOKEN_EXPIRED', 'Token expired'))
    })
    renderWithRouter('/auth/verify-email?token=expired')
    expect(screen.getByTestId('state-expired')).toBeTruthy()
    expect(screen.getByText('Link Expired')).toBeTruthy()
  })

  it('shows invalid state on 404 error', () => {
    mockVerify.mockImplementation((_: any, opts: any) => {
      opts.onError(new ApiError(404, 'NOT_FOUND', 'Not found'))
    })
    renderWithRouter('/auth/verify-email?token=bad')
    expect(screen.getByTestId('state-invalid')).toBeTruthy()
    expect(screen.getByText('Invalid Link')).toBeTruthy()
  })

  it('shows no-token state when no token in URL', () => {
    renderWithRouter('/auth/verify-email')
    expect(screen.getByTestId('state-no-token')).toBeTruthy()
    expect(screen.getByText('Verify Your Email')).toBeTruthy()
  })

  it('resend form sends email', () => {
    renderWithRouter('/auth/verify-email')
    const input = screen.getByTestId('resend-email-input')
    fireEvent.change(input, { target: { value: 'user@test.com' } })
    fireEvent.click(screen.getByTestId('resend-btn'))
    expect(mockResend).toHaveBeenCalledWith({ email: 'user@test.com' }, expect.any(Object))
  })

  it('shows generic success after resend (no email leak)', () => {
    mockResend.mockImplementation((_: any, opts: any) => opts.onSuccess())
    renderWithRouter('/auth/verify-email')
    fireEvent.change(screen.getByTestId('resend-email-input'), { target: { value: 'user@test.com' } })
    fireEvent.click(screen.getByTestId('resend-btn'))
    expect(screen.getByText(/If this email is registered/)).toBeTruthy()
  })
})
