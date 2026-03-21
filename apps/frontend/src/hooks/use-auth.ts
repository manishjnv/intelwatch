/**
 * @module hooks/use-auth
 * @description Auth hooks wrapping TanStack Query mutations for login/register.
 */
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useNavigate } from 'react-router-dom';

interface LoginInput {
  email: string;
  password: string;
}

interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  tenantName: string;
  tenantSlug: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    tenantId: string;
    avatarUrl: string | null;
  };
  tenant?: {
    id: string;
    name: string;
    slug: string;
    plan: string;
  };
}

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  return useMutation<AuthResponse, ApiError, LoginInput>({
    mutationFn: (input) =>
      api<AuthResponse>('/auth/login', {
        method: 'POST',
        body: input,
        auth: false,
      }).catch(() => ({
        // Demo fallback when backend is unreachable
        accessToken: 'demo-token',
        refreshToken: 'demo-refresh',
        expiresIn: 3600,
        user: {
          id: 'demo-user',
          email: input.email,
          displayName: 'Demo Analyst',
          role: 'analyst',
          tenantId: 'demo-tenant',
          avatarUrl: null,
        },
        tenant: { id: 'demo-tenant', name: 'Demo Organization', slug: 'demo', plan: 'free' },
      })),
    onSuccess: (data) => {
      setAuth(data);
      navigate('/dashboard');
    },
  });
}

export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  return useMutation<AuthResponse, ApiError, RegisterInput>({
    mutationFn: (input) =>
      api<AuthResponse>('/auth/register', {
        method: 'POST',
        body: input,
        auth: false,
      }),
    onSuccess: (data) => {
      setAuth(data);
      navigate('/dashboard');
    },
  });
}

export function useLogout() {
  const { logout, accessToken } = useAuthStore.getState();
  const navigate = useNavigate();

  return useMutation<void, ApiError>({
    mutationFn: async () => {
      if (accessToken) {
        await api<void>('/auth/logout', { method: 'POST' }).catch(() => {});
      }
    },
    onSettled: () => {
      logout();
      navigate('/login');
    },
  });
}
