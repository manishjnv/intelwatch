import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useRegister } from '@/hooks/use-auth';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const register = useRegister();
  const tenantSlug = useMemo(() => tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 63), [tenantName]);
  const isValid = email && password.length >= 12 && displayName && tenantName && tenantSlug;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-bg-base">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-3 shadow-glow-blue">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          </div>
          <h1 className="text-xl font-semibold text-text-primary">Create your account</h1>
          <p className="text-sm text-text-muted mt-1">Start monitoring threats in minutes</p>
        </div>
        <div className="bg-bg-primary border border-border rounded-xl p-6 shadow-card">
          <form onSubmit={(e) => { e.preventDefault(); if (isValid) register.mutate({ email, password, displayName, tenantName, tenantSlug }); }} className="space-y-4">
            <div>
              <label htmlFor="displayName" className="block text-xs font-medium text-text-secondary mb-1.5">Your name</label>
              <input id="displayName" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane Analyst" required autoComplete="name" className="w-full h-10 px-3 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none" />
            </div>
            <div>
              <label htmlFor="reg-email" className="block text-xs font-medium text-text-secondary mb-1.5">Email address</label>
              <input id="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="analyst@company.com" required autoComplete="email" className="w-full h-10 px-3 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none" />
            </div>
            <div>
              <label htmlFor="reg-password" className="block text-xs font-medium text-text-secondary mb-1.5">Password <span className="text-text-muted">(min 12 characters)</span></label>
              <div className="relative">
                <input id="reg-password" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" required minLength={12} autoComplete="new-password" className="w-full h-10 px-3 pr-10 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-xs" tabIndex={-1}>{showPw ? 'Hide' : 'Show'}</button>
              </div>
              {password.length > 0 && password.length < 12 && <p className="text-[10px] text-sev-high mt-1">Password must be at least 12 characters</p>}
            </div>
            <div>
              <label htmlFor="tenantName" className="block text-xs font-medium text-text-secondary mb-1.5">Organization name</label>
              <input id="tenantName" type="text" value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="ACME Security" required className="w-full h-10 px-3 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none" />
              {tenantSlug && <p className="text-[10px] text-text-muted mt-1">Slug: <span className="font-mono text-text-secondary">{tenantSlug}</span></p>}
            </div>
            {register.error && <div className="p-3 bg-sev-critical/10 border border-sev-critical/20 rounded-lg text-xs text-sev-critical">{register.error.message}</div>}
            <button type="submit" disabled={register.isPending || !isValid} className="w-full h-10 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center">
              {register.isPending ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-text-muted mt-4">Already have an account? <Link to="/login" className="text-text-link hover:underline">Sign in</Link></p>
      </div>
    </div>
  );
}
