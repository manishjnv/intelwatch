/**
 * @module hooks/use-integrations
 * @description TanStack Query hooks for the real integration-service connector API
 * (S166 Step 15 P1) — GET/POST/PUT/DELETE /integrations, /:id/test, /:id/logs, /stats,
 * /health/dashboard. Verified against apps/integration-service/src/routes/integrations.ts
 * and src/schemas/integration.ts. api() already unwraps {data} — never .then(r => r.data)
 * (RCA #45). This replaces the broken useSIEMIntegrations/useWebhooks/useCreateSIEM/
 * useCreateWebhook hooks in use-phase5-data.ts for the Command Center Integrations tab;
 * those hooks are left in place there because apps/frontend/src/pages/IntegrationPage.tsx
 * (a separate, out-of-scope legacy page) still imports them.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { apiList, type ListEnvelope } from '@/lib/api-list'

// ─── Types (mirror apps/integration-service/src/schemas/integration.ts) ─────

export type IntegrationType = 'splunk_hec' | 'sentinel' | 'elastic_siem' | 'servicenow' | 'jira' | 'webhook'

export type TriggerEvent =
  | 'alert.created' | 'alert.updated' | 'alert.closed'
  | 'ioc.created' | 'ioc.updated' | 'correlation.match'
  | 'drp.alert.created' | 'hunt.completed'

export interface FieldMapping { sourceField: string; targetField: string; transform: string }

export interface SplunkHecConfig { type: 'splunk_hec'; url: string; token: string; index?: string; sourcetype?: string; verifySsl?: boolean }
export interface SentinelConfig { type: 'sentinel'; workspaceId: string; sharedKey: string; logType?: string }
export interface ElasticSiemConfig { type: 'elastic_siem'; url: string; apiKey: string; indexPattern?: string; verifySsl?: boolean }
export type SiemConfig = SplunkHecConfig | SentinelConfig | ElasticSiemConfig

export interface WebhookConfig { url: string; secret?: string; headers?: Record<string, string>; method?: 'POST' | 'PUT' }

export interface ServiceNowConfig { type: 'servicenow'; instanceUrl: string; username: string; password: string; tableName?: string }
export interface JiraConfig { type: 'jira'; baseUrl: string; email: string; apiToken: string; projectKey: string; issueType?: string }
export type TicketingConfig = ServiceNowConfig | JiraConfig

export interface Integration {
  id: string
  tenantId: string
  name: string
  type: IntegrationType
  enabled: boolean
  triggers: TriggerEvent[]
  fieldMappings: FieldMapping[]
  credentials: Record<string, unknown>
  webhookConfig?: WebhookConfig
  siemConfig?: SiemConfig
  ticketingConfig?: TicketingConfig
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface IntegrationInput {
  name: string
  type: IntegrationType
  enabled?: boolean
  triggers: TriggerEvent[]
  webhookConfig?: WebhookConfig
  siemConfig?: SiemConfig
  ticketingConfig?: TicketingConfig
}

export interface IntegrationLog {
  id: string
  integrationId: string
  event: TriggerEvent
  status: 'success' | 'failure' | 'retrying' | 'dead_letter'
  statusCode: number | null
  errorMessage: string | null
  attempt: number
  createdAt: string
}

export interface IntegrationHealth {
  integrationId: string; name: string; type: string; enabled: boolean
  successCount: number; failureCount: number; totalCount: number
  successRate: number; lastError: string | null; lastUsedAt: string | null
  uptimePercent: number
}

export interface HealthSummary {
  totalIntegrations: number; enabledIntegrations: number
  overallSuccessRate: number; totalEvents: number; totalFailures: number
  dlqSize: number; integrations: IntegrationHealth[]
}

// ─── Hooks ────────────────────────────────────────────────────────

const LIST_KEY = ['integrations'] as const

/** GET /integrations — real connectors, {data, total, page, limit} (integrations.ts:66). */
export function useIntegrations() {
  return useQuery<ListEnvelope<Integration>, ApiError>({
    queryKey: LIST_KEY,
    queryFn: () => apiList<Integration>('/integrations'),
    meta: { resource: 'connections' },
    staleTime: 30_000,
  })
}

/** POST /integrations — 201 {data: integration} (integrations.ts:59). */
export function useCreateIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: IntegrationInput) => api<Integration>('/integrations', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY })
      qc.invalidateQueries({ queryKey: ['integration-stats'] })
    },
  })
}

/** PUT /integrations/:id — {data: integration} (integrations.ts:85). Also used for the enable/disable toggle. */
export function useUpdateIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<IntegrationInput> }) =>
      api<Integration>(`/integrations/${id}`, { method: 'PUT', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY })
      qc.invalidateQueries({ queryKey: ['integration-stats'] })
    },
  })
}

/** DELETE /integrations/:id — 204 (integrations.ts:93). */
export function useDeleteIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/integrations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY })
      qc.invalidateQueries({ queryKey: ['integration-stats'] })
    },
  })
}

/** POST /integrations/:id/test — {data: {success, message}} (integrations.ts:113). Requires a saved id. */
export function useTestIntegration() {
  return useMutation({
    mutationFn: (id: string) => api<{ success: boolean; message: string }>(`/integrations/${id}/test`, { method: 'POST' }),
  })
}

/** GET /integrations/:id/logs — {data, total, page, limit} (integrations.ts:126). */
export function useIntegrationLogs(id: string) {
  return useQuery<ListEnvelope<IntegrationLog>, ApiError>({
    queryKey: ['integration-logs', id],
    queryFn: () => apiList<IntegrationLog>(`/integrations/${id}/logs`),
    meta: { resource: 'connection activity' },
    enabled: !!id,
  })
}

/**
 * GET /integrations/health/dashboard — one cheap call covering every connector's health
 * (integrations.ts:166), used instead of N per-connector /:id/health calls in the list.
 * Best-effort: health is a supplementary badge, so a failure here never blocks the
 * primary connections list (that list has its own QueryStateView error state).
 */
export function useIntegrationsHealth() {
  return useQuery<HealthSummary | null>({
    queryKey: ['integrations-health'],
    queryFn: () => api<HealthSummary>('/integrations/health/dashboard').catch(() => null),
    staleTime: 30_000,
  })
}

/**
 * Pulls one field's message out of a VALIDATION_ERROR ApiError's `details` array
 * (error-handler.ts ZodError branch: `{path, message, code}[]`) — used to surface the
 * SSRF "Destination must be a publicly reachable address" 400 inline on the URL field
 * instead of as a generic toast.
 */
export function fieldError(error: unknown, pathSuffix: string): string | null {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return null
  const details = error.details as Array<{ path: string; message: string }> | undefined
  return details?.find(d => d.path.endsWith(pathSuffix))?.message ?? null
}

/** Real shape of GET /integrations/stats (integration-store getStats). */
export interface IntegrationStatsSummary {
  totalIntegrations: number
  enabledIntegrations: number
  totalLogs: number
  failedLogs: number
  dlqSize: number
  totalTickets: number
}

export function useIntegrationStats() {
  return useQuery<IntegrationStatsSummary, ApiError>({
    queryKey: ['integration-stats'],
    queryFn: () => api<IntegrationStatsSummary>('/integrations/stats'),
    meta: { resource: 'connection stats' },
    staleTime: 60_000,
  })
}
