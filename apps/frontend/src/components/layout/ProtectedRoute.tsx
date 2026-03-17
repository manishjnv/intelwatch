import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store';
export function ProtectedRoute() { const isAuth = useAuthStore((s) => s.isAuthenticated); if (!isAuth) return <Navigate to="/login" replace />; return <Outlet />; }
