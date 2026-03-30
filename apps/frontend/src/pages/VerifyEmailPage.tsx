/**
 * @module pages/VerifyEmailPage
 * @description Email verification landing page.
 * Public route: /auth/verify-email?token=xxx
 */
import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle, AlertTriangle, XCircle, Loader2, Mail } from 'lucide-react'
import { useVerifyEmail, useResendVerification } from '@/hooks/use-email-verification'
import { toast } from '@/components/ui/Toast'

type PageState = 'verifying' | 'success' | 'expired' | 'invalid' | 'no-token'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const emailParam = searchParams.get('email')

  const verify = useVerifyEmail()
  const resend = useResendVerification()
  const [pageState, setPageState] = useState<PageState>(token ? 'verifying' : 'no-token')
  const [email, setEmail] = useState(emailParam ?? '')
  const [resendSent, setResendSent] = useState(false)

  // Auto-verify on mount if token present
  useEffect(() => {
    if (!token) return
    verify.mutate({ token }, {
      onSuccess: () => setPageState('success'),
      onError: (err) => {
        if (err.status === 410) setPageState('expired')
        else setPageState('invalid')
      },
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handleResend = () => {
    if (!email) return
    resend.mutate({ email }, {
      onSuccess: () => {
        setResendSent(true)
        toast('Verification email sent', 'success')
      },
      onError: (err) => {
        if (err.status === 429) {
          toast('Please wait a few minutes before requesting another link', 'info')
        } else {
          setResendSent(true) // Don't leak whether email exists
        }
      },
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-bg-base">
      <div className="w-full max-w-sm">
        <div className="bg-bg-primary border border-border rounded-xl p-6 shadow-card">
          {/* Verifying */}
          {pageState === 'verifying' && (
            <div className="flex flex-col items-center py-4 gap-3" data-testid="state-verifying">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              <p className="text-sm text-text-primary">Verifying your email...</p>
            </div>
          )}

          {/* Success */}
          {pageState === 'success' && (
            <div className="flex flex-col items-center py-4 gap-3" data-testid="state-success">
              <div className="w-12 h-12 rounded-full bg-sev-low/20 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-sev-low" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">Email Verified!</h2>
              <p className="text-xs text-text-muted text-center">
                You can now log in to your account.
              </p>
              <Link
                to="/login"
                className="mt-2 w-full h-10 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center"
                data-testid="go-to-login"
              >
                Go to Login
              </Link>
            </div>
          )}

          {/* Expired */}
          {pageState === 'expired' && (
            <div className="flex flex-col items-center py-4 gap-3" data-testid="state-expired">
              <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">Link Expired</h2>
              <p className="text-xs text-text-muted text-center">
                This verification link has expired. Request a new one below.
              </p>
              <ResendForm
                email={email}
                setEmail={setEmail}
                onResend={handleResend}
                isPending={resend.isPending}
                sent={resendSent}
              />
            </div>
          )}

          {/* Invalid */}
          {pageState === 'invalid' && (
            <div className="flex flex-col items-center py-4 gap-3" data-testid="state-invalid">
              <div className="w-12 h-12 rounded-full bg-sev-critical/20 flex items-center justify-center">
                <XCircle className="w-6 h-6 text-sev-critical" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">Invalid Link</h2>
              <p className="text-xs text-text-muted text-center">
                This verification link is invalid. If you need a new link, enter your email below.
              </p>
              <ResendForm
                email={email}
                setEmail={setEmail}
                onResend={handleResend}
                isPending={resend.isPending}
                sent={resendSent}
              />
            </div>
          )}

          {/* No Token */}
          {pageState === 'no-token' && (
            <div className="flex flex-col items-center py-4 gap-3" data-testid="state-no-token">
              <div className="w-12 h-12 rounded-full bg-bg-hover flex items-center justify-center">
                <Mail className="w-6 h-6 text-text-muted" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">Verify Your Email</h2>
              <p className="text-xs text-text-muted text-center">
                Enter your email address to receive a verification link.
              </p>
              <ResendForm
                email={email}
                setEmail={setEmail}
                onResend={handleResend}
                isPending={resend.isPending}
                sent={resendSent}
              />
            </div>
          )}
        </div>

        <p className="text-center text-sm text-text-muted mt-4">
          <Link to="/login" className="text-text-link hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  )
}

// ─── Resend Form ──────────────────────────────────────────────

function ResendForm({ email, setEmail, onResend, isPending, sent }: {
  email: string; setEmail: (v: string) => void; onResend: () => void
  isPending: boolean; sent: boolean
}) {
  if (sent) {
    return (
      <div className="w-full px-3 py-2 bg-sev-low/10 border border-sev-low/20 rounded-lg text-center">
        <p className="text-xs text-sev-low">
          If this email is registered, a new verification link has been sent.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        className="w-full h-10 px-3 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors"
        data-testid="resend-email-input"
      />
      <button
        onClick={onResend}
        disabled={!email || isPending}
        className="w-full h-10 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        data-testid="resend-btn"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
        Resend Verification Email
      </button>
    </div>
  )
}
