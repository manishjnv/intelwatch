/**
 * @module lib/api
 * @description HTTP client for ETIP API.
 * Handles token injection, refresh, and error normalization.
 */
import { useAuthStore } from '@/stores/auth-store';

const API_BASE = '/api/v1';

/**
 * In-flight GET request deduplication.
 * Same GET URL within 100ms returns the same Promise instead of a new fetch.
 * Prevents duplicate API calls from component re-renders.
 */
const inflightRequests = new Map<string, { promise: Promise<unknown>; ts: number }>();
const DEDUP_WINDOW_MS = 100;

function getInflightOrSet<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = inflightRequests.get(key);
  if (existing && now - existing.ts < DEDUP_WINDOW_MS) {
    return existing.promise as Promise<T>;
  }
  const promise = factory().finally(() => {
    // Clean up after settling (with small delay to allow same-tick dedup)
    setTimeout(() => inflightRequests.delete(key), DEDUP_WINDOW_MS);
  });
  inflightRequests.set(key, { promise, ts: now });
  return promise;
}

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

  // Deduplicate identical GET requests within 100ms window
  const fullUrl = `${API_BASE}${path}`;
  if (method === 'GET') {
    return getInflightOrSet<T>(fullUrl, () => doFetch<T>(fullUrl, method, finalHeaders, body, auth));
  }
  return doFetch<T>(fullUrl, method, finalHeaders, body, auth);
}

/** Internal fetch + response handling */
async function doFetch<T>(
  fullUrl: string, method: string, finalHeaders: Record<string, string>,
  body: unknown, auth: boolean,
): Promise<T> {
  const res = await fetch(fullUrl, {
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
      const retryRes = await fetch(fullUrl, {
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
    const err = new ApiError(
      res.status,
      json?.error?.code ?? 'UNKNOWN',
      json?.error?.message ?? 'Request failed',
      json?.error?.details,
    );

    // 429 QUOTA_EXCEEDED — trigger upgrade modal via global listener
    if (res.status === 429 && json?.error?.code === 'QUOTA_EXCEEDED') {
      _quotaExceededListener?.({
        feature: json.error.feature ?? '',
        limit: json.error.limit ?? 0,
        used: json.error.used ?? 0,
        period: json.error.period ?? 'monthly',
        resetsAt: json.error.resetsAt ?? '',
        currentPlan: json.error.currentPlan ?? '',
      });
    }

    throw err;
  }

  return json.data as T;
}

// ─── 429 Quota Exceeded Global Listener ──────────────────────

interface QuotaExceededInfo {
  feature: string; limit: number; used: number;
  period: string; resetsAt: string; currentPlan: string;
}

type QuotaListener = (info: QuotaExceededInfo) => void;
let _quotaExceededListener: QuotaListener | null = null;

/** Register a global listener for 429 QUOTA_EXCEEDED responses. */
export function onQuotaExceeded(listener: QuotaListener) {
  _quotaExceededListener = listener;
}

/**
 * Like api(), but returns the full JSON body (not just json.data).
 * Useful for list endpoints where pagination metadata lives outside .data.
 */
export async function apiRaw<T>(path: string): Promise<T | null> {
  const { accessToken, user } = useAuthStore.getState();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  if (user?.tenantId) {
    headers['x-tenant-id'] = user.tenantId;
    headers['x-user-id'] = user.id;
    headers['x-user-role'] = user.role;
  }

  try {
    const fullUrl = `${API_BASE}${path}`;
    let res = await fetch(fullUrl, { headers });
    if (res.status === 401) {
      const refreshed = await attemptRefresh();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${useAuthStore.getState().accessToken}`;
        res = await fetch(fullUrl, { headers });
      }
    }
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Uses a mutex so concurrent 401 handlers share one refresh call
 * instead of racing and invalidating each other's tokens.
 */
let _refreshPromise: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = doRefresh();
  try {
    return await _refreshPromise;
  } finally {
    _refreshPromise = null;
  }
}

async function doRefresh(): Promise<boolean> {
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
