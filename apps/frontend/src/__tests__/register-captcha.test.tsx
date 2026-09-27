/**
 * RegisterPage with Cloudflare Turnstile enabled (RCA #50): the account step must not advance until
 * the check is done, and an expired/failed CAPTCHA must send the user back to redo it.
 * Backend bodies mirror apps/api-gateway/src/routes/auth.ts (AppError → { error: { code, message } }).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test/test-utils'
import { RegisterPage } from '@/pages/RegisterPage'

vi.mock('@/components/TurnstileWidget', () => ({
  CAPTCHA_ENABLED: true,
  TurnstileWidget: ({ onVerify }: { onVerify: (t: string) => void }) => (
    <button type="button" data-testid="fake-turnstile" onClick={() => onVerify('tok-123')}>verify</button>
  ),
}))

function fillAccount() {
  fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Test User' } })
  fireEvent.change(document.getElementById('reg-email')!, { target: { value: 'user@example.com' } })
  fireEvent.change(document.getElementById('reg-password')!, { target: { value: 'a-very-long-password-1' } })
  fireEvent.change(document.getElementById('tenantName')!, { target: { value: 'ABC Ltd' } })
}

const choosePlanBtn = () => screen.getByRole('button', { name: /choose plan/i })

describe('RegisterPage — CAPTCHA enabled', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  beforeEach(() => { vi.restoreAllMocks() })

  it('keeps "Choose Plan" disabled until the CAPTCHA is completed', () => {
    render(<RegisterPage />)
    fillAccount()
    expect(choosePlanBtn()).toBeDisabled()
    fireEvent.click(screen.getByTestId('fake-turnstile'))
    expect(choosePlanBtn()).not.toBeDisabled()
  })

  it('sends the token, and on CAPTCHA_FAILED returns to the account step with a clear message', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 'CAPTCHA_FAILED', message: 'CAPTCHA verification failed' } }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)

    render(<RegisterPage />)
    fillAccount()
    fireEvent.click(screen.getByTestId('fake-turnstile'))
    fireEvent.click(choosePlanBtn())
    fireEvent.click(await screen.findByRole('button', { name: /select free/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.cfTurnstileToken).toBe('tok-123')

    expect(await screen.findByTestId('register-account-error')).toHaveTextContent(/security check/i)
    // back on the account step, token cleared → must redo the check
    expect(choosePlanBtn()).toBeDisabled()
  })
})

describe('RegisterPage — Contact Sales', () => {
  it('shows the sales email with Copy instead of relying on a popup mailto', async () => {
    const hrefSetter = vi.fn()
    const loc = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...loc, set href(v: string) { hrefSetter(v) } } })
    try {
      render(<RegisterPage />)
      fillAccount()
      fireEvent.click(screen.getByTestId('fake-turnstile'))
      fireEvent.click(choosePlanBtn())
      fireEvent.click((await screen.findAllByRole('button', { name: /contact sales/i }))[0]!)
      expect(await screen.findByTestId('sales-contact-note')).toHaveTextContent('sales@intelwatch.in')
      expect(hrefSetter).toHaveBeenCalledWith(expect.stringContaining('mailto:sales@intelwatch.in'))
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: loc })
    }
  })
})
