/**
 * @module components/layout/ProtectedRoute
 * @description Route wrapper that redirects to /login if not authenticated.
 * When backend is unreachable, seeds a demo session so the UI is explorable.
 */
import { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';

export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setAuth = useAuthStore((s) => s.setAuth);
  const [checking, setChecking] = useState(!isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) { setChecking(false); return; }
    // Backend probe — if unreachable, seed demo session
    fetch('/api/v1/health')
      .then(r => { if (!r.ok) throw new Error(); setChecking(false); })
      .catch(() => {
        setAuth({
          accessToken: 'demo-token',
          refreshToken: 'demo-refresh',
          user: {
            id: 'demo-user',
            email: 'analyst@demo.local',
            displayName: 'Demo Analyst',
            role: 'analyst',
            tenantId: 'demo-tenant',
            avatarUrl: null,
          },
          tenant: { id: 'demo-tenant', name: 'Demo Organization', slug: 'demo', plan: 'free' },
        });
      });
  }, [isAuthenticated, setAuth]);

  // Wait for backend probe before deciding
  if (checking) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}
