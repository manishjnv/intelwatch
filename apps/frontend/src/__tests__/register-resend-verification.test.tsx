/**
 * RegisterPage 409 dead-end fix: a user whose first sign-up never got its verification
 * email can now resend it from the plan step instead of being stuck on a server error.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test/test-utils'
import { RegisterPage } from '@/pages/RegisterPage'
import { ApiError } from '@/lib/api'

const resendMutate = vi.fn()

vi.mock('@/hooks/use-email-verification', () => ({
  useResendVerification: () => ({ mutate: resendMutate, isPending: false }),
}))

vi.mock('@/components/TurnstileWidget', () => ({
  CAPTCHA_ENABLED: false,
  TurnstileWidget: () => null,
}))

function fillAccount() {
  fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Test User' } })
  fireEvent.change(document.getElementById('reg-email')!, { target: { value: 'user@example.com' } })
  fireEvent.change(document.getElementById('reg-password')!, { target: { value: 'a-very-long-password-1' } })
  fireEvent.change(document.getElementById('tenantName')!, { target: { value: 'ABC Ltd' } })
}

const choosePlanBtn = () => screen.getByRole('button', { name: /choose plan/i })

function mockRegisterResponse(code: string, message: string) {
  return vi.fn(async () => new Response(
    JSON.stringify({ error: { code, message } }),
    { status: 409, headers: { 'Content-Type': 'application/json' } },
  ))
}

async function reachPlanStepAndSubmit() {
  render(<RegisterPage />)
  fillAccount()
  fireEvent.click(choosePlanBtn())
  fireEvent.click(await screen.findByRole('button', { name: /select free/i }))
}

describe('RegisterPage — 409 resend verification', () => {
  beforeEach(() => { vi.restoreAllMocks(); resendMutate.mockReset() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('EMAIL_ALREADY_REGISTERED shows server message + resend button', async () => {
    vi.stubGlobal('fetch', mockRegisterResponse('EMAIL_ALREADY_REGISTERED', 'Email already registered — please sign in instead'))
    await reachPlanStepAndSubmit()

    expect(await screen.findByText(/please sign in instead/i)).toBeInTheDocument()
    expect(screen.getByTestId('register-resend-verification')).toBeInTheDocument()
  })

  it('clicking resend calls the mutation with the typed email; success message appears', async () => {
    vi.stubGlobal('fetch', mockRegisterResponse('EMAIL_ALREADY_REGISTERED', 'Email already registered — please sign in instead'))
    resendMutate.mockImplementation((_input, { onSuccess }: { onSuccess: () => void }) => onSuccess())
    await reachPlanStepAndSubmit()

    fireEvent.click(await screen.findByTestId('register-resend-verification'))

    expect(resendMutate).toHaveBeenCalledWith({ email: 'user@example.com' }, expect.anything())
    expect(await screen.findByText(/new verification link is on its way/i)).toBeInTheDocument()
  })

  it('CONFLICT replaces jargon with a plain-English message and still shows resend', async () => {
    vi.stubGlobal('fetch', mockRegisterResponse('CONFLICT', 'Tenant slug already taken'))
    await reachPlanStepAndSubmit()

    expect(await screen.findByText('An organization with this name already exists.')).toBeInTheDocument()
    expect(screen.queryByText(/slug already taken/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('register-resend-verification')).toBeInTheDocument()
  })

  it('429 on resend shows the wait message', async () => {
    vi.stubGlobal('fetch', mockRegisterResponse('EMAIL_ALREADY_REGISTERED', 'Email already registered — please sign in instead'))
    resendMutate.mockImplementation((_input, { onError }: { onError: (e: ApiError) => void }) =>
      onError(new ApiError(429, 'RATE_LIMITED', 'Too many requests')))
    await reachPlanStepAndSubmit()

    fireEvent.click(await screen.findByTestId('register-resend-verification'))

    expect(await screen.findByText(/wait a few minutes/i)).toBeInTheDocument()
  })

  it('other resend errors show the generic retry message', async () => {
    vi.stubGlobal('fetch', mockRegisterResponse('EMAIL_ALREADY_REGISTERED', 'Email already registered — please sign in instead'))
    resendMutate.mockImplementation((_input, { onError }: { onError: (e: ApiError) => void }) =>
      onError(new ApiError(500, 'UNKNOWN', 'boom')))
    await reachPlanStepAndSubmit()

    fireEvent.click(await screen.findByTestId('register-resend-verification'))

    await waitFor(() => expect(screen.getByText(/could not send the email/i)).toBeInTheDocument())
  })
})
