/**
 * @module lib/api
 * @description HTTP client for ETIP API.
 * Handles token injection, refresh, and error normalization.
 */
import { useAuthStore } from '@/stores/auth-store';

const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
}

/**
 * Typed fetch wrapper. Injects auth token, handles 401 refresh.
 */
export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, auth = true } = opts;

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (auth) {
    const { accessToken, user } = useAuthStore.getState();
    if (accessToken) {
      finalHeaders['Authorization'] = `Bearer ${accessToken}`;
    }
    if (user?.tenantId) {
      finalHeaders['x-tenant-id'] = user.tenantId;
      finalHeaders['x-user-id'] = user.id;
      finalHeaders['x-user-role'] = user.role;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Handle 401 — attempt token refresh once
  if (res.status === 401 && auth) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      // Retry original request with new token
      const newToken = useAuthStore.getState().accessToken;
      finalHeaders['Authorization'] = `Bearer ${newToken}`;
      const retryRes = await fetch(`${API_BASE}${path}`, {
        method,
        headers: finalHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (retryRes.status === 204) return undefined as T;
      if (!retryRes.ok) {
        const errBody = await retryRes.json().catch(() => ({}));
        throw new ApiError(
          retryRes.status,
          errBody?.error?.code ?? 'UNKNOWN',
          errBody?.error?.message ?? 'Request failed',
          errBody?.error?.details,
        );
      }
      return (await retryRes.json()).data as T;
    }
    // Refresh failed — force logout
    useAuthStore.getState().logout();
    throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired, please login again');
  }

  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(
      res.status,
      json?.error?.code ?? 'UNKNOWN',
      json?.error?.message ?? 'Request failed',
      json?.error?.details,
    );
  }

  return json.data as T;
}

/**
 * Attempt to refresh the access token using the stored refresh token.
 */
async function attemptRefresh(): Promise<boolean> {
  const { refreshToken, setTokens } = useAuthStore.getState();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return false;

    const json = await res.json();
    const data = json.data as { accessToken: string; refreshToken: string; expiresIn: number };
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}
