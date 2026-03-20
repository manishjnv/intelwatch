/**
 * @module pages/RegisterPage
 * @description Registration form: email, password, display name, org name/slug.
 * Dark mode, centered card layout, responsive at 375px.
 */
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useRegister } from '@/hooks/use-auth';
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const register = useRegister();

  const tenantSlug = useMemo(
    () =>
      tenantName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 63),
    [tenantName],
  );

  const isValid = email && password.length >= 12 && displayName && tenantName && tenantSlug;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    register.mutate({ email, password, displayName, tenantName, tenantSlug });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-bg-base">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-3 shadow-glow-blue">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-text-primary">Create your account</h1>
          <p className="text-sm text-text-muted mt-1">Start monitoring threats in minutes</p>
        </div>

        {/* Form card */}
        <div className="bg-bg-primary border border-border rounded-xl p-6 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Display name */}
            <div>
              <label htmlFor="displayName" className="block text-xs font-medium text-text-secondary mb-1.5">
                Your name
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Analyst"
                required
                autoComplete="name"
                className="w-full h-10 px-3 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="reg-email" className="block text-xs font-medium text-text-secondary mb-1.5">
                Email address
              </label>
              <input
                id="reg-email"
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
              <label htmlFor="reg-password" className="block text-xs font-medium text-text-secondary mb-1.5">
                Password <span className="text-text-muted">(min 12 characters)</span>
              </label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  minLength={12}
                  autoComplete="new-password"
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
              {password.length > 0 && password.length < 12 && (
                <p className="text-[10px] text-sev-high mt-1">Password must be at least 12 characters</p>
              )}
            </div>

            {/* Organization name */}
            <div>
              <label htmlFor="tenantName" className="block text-xs font-medium text-text-secondary mb-1.5">
                Organization name
              </label>
              <input
                id="tenantName"
                type="text"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="ACME Security"
                required
                className="w-full h-10 px-3 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none transition-colors"
              />
              {tenantSlug && (
                <p className="text-[10px] text-text-muted mt-1">
                  Slug: <span className="font-mono text-text-secondary">{tenantSlug}</span>
                </p>
              )}
            </div>

            {/* Error */}
            {register.error && (
              <div className="p-3 bg-sev-critical/10 border border-sev-critical/20 rounded-lg text-xs text-sev-critical">
                {register.error.message}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={register.isPending || !isValid}
              className="w-full h-10 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {register.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>
        </div>

        {/* Login link */}
        <p className="text-center text-sm text-text-muted mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-text-link hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
