import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useNavigate } from 'react-router-dom';

interface AuthResponse { accessToken: string; refreshToken: string; expiresIn: number; user: { id: string; email: string; displayName: string; role: string; tenantId: string; avatarUrl: string | null }; tenant?: { id: string; name: string; slug: string; plan: string }; }

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  return useMutation<AuthResponse, ApiError, { email: string; password: string }>({
    mutationFn: (input) => api<AuthResponse>('/auth/login', { method: 'POST', body: input, auth: false }),
    onSuccess: (data) => { setAuth(data); navigate('/dashboard'); },
  });
}

export function useRegister() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  return useMutation<AuthResponse, ApiError, { email: string; password: string; displayName: string; tenantName: string; tenantSlug: string }>({
    mutationFn: (input) => api<AuthResponse>('/auth/register', { method: 'POST', body: input, auth: false }),
    onSuccess: (data) => { setAuth(data); navigate('/dashboard'); },
  });
}

export function useLogout() {
  const navigate = useNavigate();
  return useMutation<void, ApiError>({
    mutationFn: async () => { await api<void>('/auth/logout', { method: 'POST' }).catch(() => {}); },
    onSettled: () => { useAuthStore.getState().logout(); navigate('/login'); },
  });
}
