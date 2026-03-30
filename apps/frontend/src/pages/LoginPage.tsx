/**
 * @module pages/LoginPage
 * @description Email + password login form.
 * Dark mode, centered card layout, responsive at 375px.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLogin } from '@/hooks/use-auth';
import { useResendVerification } from '@/hooks/use-email-verification';
import { Shield, Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import { toast } from '@/components/ui/Toast';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const login = useLogin();
  const resend = useResendVerification();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEmailNotVerified(false);
    login.mutate({ email, password }, {
      onError: (err) => {
        if (err.status === 403 && err.code === 'EMAIL_NOT_VERIFIED') {
          setEmailNotVerified(true);
        }
      },
    });
  };

  const handleResendVerification = () => {
    resend.mutate({ email }, {
      onSuccess: () => toast('Verification email sent. Check your inbox.', 'success'),
      onError: (err) => {
        if (err.status === 429) toast('Please wait before requesting another link.', 'info');
        else toast('Verification email sent. Check your inbox.', 'success');
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-bg-base">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-3 shadow-glow-blue">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary">IntelWatch ETIP</h1>
          <p className="text-sm text-text-muted mt-1">Sign in to your account</p>
        </div>

        {/* Form card */}
        <div className="bg-bg-primary border border-border rounded-xl p-6 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-text-secondary mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@company.com"
                required
                autoComplete="email"
                className="w-full h-10 px-3 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-text-secondary mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full h-10 px-3 pr-10 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Email not verified */}
            {emailNotVerified && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs" data-testid="email-not-verified">
                <p className="text-amber-400">Please verify your email before logging in.</p>
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resend.isPending}
                  className="mt-1.5 inline-flex items-center gap-1 text-text-link hover:underline text-xs"
                  data-testid="resend-verification-link"
                >
                  <Mail className="w-3 h-3" />
                  {resend.isPending ? 'Sending...' : 'Resend verification email'}
                </button>
              </div>
            )}

            {/* Error */}
            {login.error && !emailNotVerified && (
              <div className="p-3 bg-sev-critical/10 border border-sev-critical/20 rounded-lg text-xs text-sev-critical">
                {login.error.message}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={login.isPending || !email || !password}
              className="w-full h-10 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {login.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        {/* Register link */}
        <p className="text-center text-sm text-text-muted mt-4">
          Don't have an account?{' '}
          <Link to="/register" className="text-text-link hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
