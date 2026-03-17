import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLogin } from '@/hooks/use-auth';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const login = useLogin();

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-bg-base">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-3 shadow-glow-blue">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          </div>
          <h1 className="text-xl font-semibold text-text-primary">IntelWatch ETIP</h1>
          <p className="text-sm text-text-muted mt-1">Sign in to your account</p>
        </div>
        <div className="bg-bg-primary border border-border rounded-xl p-6 shadow-card">
          <form onSubmit={(e) => { e.preventDefault(); login.mutate({ email, password }); }} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-text-secondary mb-1.5">Email address</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="analyst@company.com" required autoComplete="email" className="w-full h-10 px-3 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none" />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-text-secondary mb-1.5">Password</label>
              <div className="relative">
                <input id="password" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" required autoComplete="current-password" className="w-full h-10 px-3 pr-10 bg-bg-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-border-focus outline-none" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary text-xs" tabIndex={-1}>{showPw ? 'Hide' : 'Show'}</button>
              </div>
            </div>
            {login.error && <div className="p-3 bg-sev-critical/10 border border-sev-critical/20 rounded-lg text-xs text-sev-critical">{login.error.message}</div>}
            <button type="submit" disabled={login.isPending || !email || !password} className="w-full h-10 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
              {login.isPending ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
        <p className="text-center text-sm text-text-muted mt-4">No account? <Link to="/register" className="text-text-link hover:underline">Create one</Link></p>
      </div>
    </div>
  );
}
