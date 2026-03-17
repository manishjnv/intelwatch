import { useAuthStore } from '@/stores/auth-store';

const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) { super(message); this.name = 'ApiError'; }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string>; auth?: boolean } = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, auth = true } = opts;
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  if (auth) { const token = useAuthStore.getState().accessToken; if (token) h['Authorization'] = `Bearer ${token}`; }
  const res = await fetch(`${API_BASE}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && auth) {
    const refreshed = await attemptRefresh();
    if (refreshed) { h['Authorization'] = `Bearer ${useAuthStore.getState().accessToken}`; const retry = await fetch(`${API_BASE}${path}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); if (retry.status === 204) return undefined as T; if (!retry.ok) { const e = await retry.json().catch(() => ({})); throw new ApiError(retry.status, e?.error?.code ?? 'UNKNOWN', e?.error?.message ?? 'Failed'); } return (await retry.json()).data as T; }
    useAuthStore.getState().logout(); throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired');
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'UNKNOWN', json?.error?.message ?? 'Failed', json?.error?.details);
  return json.data as T;
}

async function attemptRefresh(): Promise<boolean> {
  const { refreshToken, setTokens } = useAuthStore.getState();
  if (!refreshToken) return false;
  try { const res = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) }); if (!res.ok) return false; const d = (await res.json()).data; setTokens(d.accessToken, d.refreshToken); return true; } catch { return false; }
}
