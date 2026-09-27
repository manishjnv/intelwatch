/**
 * @module hooks/use-api-keys
 * @description TanStack Query hooks for tenant-scoped public API keys (S167).
 * Backend: apps/user-management-service/src/routes/api-keys.ts, registered at prefix
 * /api/v1/users (app.ts:111) -> POST/GET/DELETE /api-keys. Verified compatible with the
 * gateway's X-API-Key auth (apps/api-gateway/src/plugins/api-key-auth.ts): both use the
 * same PREFIX_DISPLAY_LENGTH (12), the same @etip/shared-auth hashApiKey/verifyApiKey
 * bcrypt pair, and the same scope check (ctx.scopes.includes(requiredScope)) — a key
 * created here authenticates at the gateway. api() already unwraps {data} — never
 * `.then(r => r.data)` (RCA #45).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { apiList, type ListEnvelope } from '@/lib/api-list'

/**
 * Scopes actually enforced by api-gateway route guards (grep of every apiKeyAuth(scope)
 * call site under apps/api-gateway/src/routes/public/*.ts). Only offer scopes the gateway
 * can act on — inventing one would create a key that looks fine but unlocks nothing.
 */
export const API_KEY_SCOPES = [
  { scope: 'ioc:read', label: 'ioc:read — TAXII feed, IOC search, export, and stats' },
  { scope: 'feed:read', label: 'feed:read — Feed subscription data' },
  { scope: 'webhook:manage', label: 'webhook:manage — Manage webhook integrations' },
] as const

/** GET /users/api-keys row shape (api-keys.ts:101) — note `lastUsed`, not `lastUsedAt`. */
export interface ApiKeySummary {
  id: string
  name: string
  prefix: string
  scopes: string[]
  lastUsed: string | null
  expiresAt: string | null
  createdAt: string
}

/** POST /users/api-keys response (api-keys.ts:90) — `key` is the raw secret, shown once. */
export interface CreatedApiKey {
  id: string
  name: string
  prefix: string
  scopes: string[]
  expiresAt: string | null
  createdAt: string
  key: string
}

export interface CreateApiKeyInput {
  name: string
  scopes: string[]
  expiresInDays?: number
}

const LIST_KEY = ['api-keys'] as const

/** GET /users/api-keys -> {data, total} (api-keys.ts:96-106). Empty list for non-enterprise. */
export function useApiKeys() {
  return useQuery<ListEnvelope<ApiKeySummary>, ApiError>({
    queryKey: LIST_KEY,
    queryFn: () => apiList<ApiKeySummary>('/users/api-keys'),
    meta: { resource: 'API keys' },
  })
}

/**
 * POST /users/api-keys -> 201 {data}. Throws ApiError with code FEATURE_NOT_AVAILABLE (403)
 * when the tenant's plan lacks api_access (api-keys.ts:51) — callers should render the
 * server message rather than assume the FeatureGate already caught it.
 */
export function useCreateApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateApiKeyInput) =>
      api<CreatedApiKey>('/users/api-keys', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  })
}

/** DELETE /users/api-keys/:id -> 204, soft delete (api-keys.ts:109-130). */
export function useRevokeApiKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/users/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LIST_KEY }),
  })
}
