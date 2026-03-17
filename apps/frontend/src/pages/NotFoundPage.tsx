import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
export function NotFoundPage() {
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  return (<div className="min-h-screen flex items-center justify-center px-4 bg-bg-base"><div className="text-center"><h1 className="text-4xl font-bold text-text-primary mb-2">404</h1><p className="text-text-secondary mb-6">Page not found.</p><Link to={isAuth ? '/dashboard' : '/login'} className="px-4 py-2 bg-accent text-white text-sm rounded-lg">{isAuth ? 'Dashboard' : 'Login'}</Link></div></div>);
}
