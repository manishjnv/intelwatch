/**
 * @module pages/NotFoundPage
 * @description 404 page with navigation back to dashboard or login.
 */
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
import { Shield, ArrowLeft } from 'lucide-react';

export function NotFoundPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg-base">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-bg-elevated flex items-center justify-center mx-auto mb-6">
          <Shield className="w-8 h-8 text-text-muted" />
        </div>
        <h1 className="text-4xl font-bold text-text-primary mb-2">404</h1>
        <p className="text-text-secondary mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to={isAuthenticated ? '/dashboard' : '/login'}
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {isAuthenticated ? 'Back to Dashboard' : 'Go to Login'}
        </Link>
      </div>
    </div>
  );
}
