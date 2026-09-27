/**
 * @module hooks/use-phase5-data
 * @description TanStack Query hooks for Phase 5 services:
 * Integration (:3015), User Management (:3016), Customization (:3017).
 * All queries go through nginx → backend services.
 */
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { apiList } from '@/lib/api-list'
import { notifyApiError } from './useApiError'
import type { SessionInfo } from '@/types/auth-security'
import {
  DEMO_SIEM_INTEGRATIONS, DEMO_WEBHOOKS, DEMO_TICKETING,
  DEMO_STIX_COLLECTIONS, DEMO_BULK_EXPORTS, DEMO_INTEGRATION_STATS,
  DEMO_MODULE_TOGGLES, DEMO_AI_CONFIGS, DEMO_RISK_WEIGHTS,
  DEMO_NOTIFICATION_CHANNELS, DEMO_CUSTOMIZATION_STATS,
  DEMO_PLAN_TIERS, DEMO_SUBTASK_MAPPINGS, DEMO_RECOMMENDED_MODELS, DEMO_COST_ESTIMATE,
  type SIEMIntegration, type WebhookConfig, type TicketingIntegration,
  type STIXCollection, type BulkExport, type IntegrationStats,
  type UserRecord, type RoleRecord,
  type SessionRecord, type AuditLogEntry, type UserManagementStats,
  type ModuleToggle, type AIModelConfig, type RiskWeight,
  type NotificationChannel, type CustomizationStats,
  type PlanTierMeta, type SubtaskMapping, type RecommendedSubtask, type CostEstimate,
} from './phase5-demo-data'

// Re-export types for page consumption
export type {
  SIEMIntegration, WebhookConfig, TicketingIntegration,
  STIXCollection, BulkExport, IntegrationStats,
  UserRecord, RoleRecord,
  SessionRecord, AuditLogEntry, UserManagementStats,
  ModuleToggle, AIModelConfig, RiskWeight,
  NotificationChannel, CustomizationStats,
  PlanTierMeta, SubtaskMapping, RecommendedSubtask, CostEstimate,
}

// ─── Generic helpers ────────────────────────────────────────────

interface ListResponse<T> {
  data: T[]; total: number; page: number; limit: number
}

interface QueryParams {
  page?: number; limit?: number; [key: string]: string | number | boolean | undefined
}

function buildQuery(params: QueryParams): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') parts.push(`${k}=${encodeURIComponent(String(v))}`)
  }
  return parts.length > 0 ? `?${parts.join('&')}` : ''
}

function withDemoFallback<T>(
  result: UseQueryResult<T>,
  demoData: T,
  hasData: (d: T | undefined) => boolean,
) {
  const isDemo = !result.isLoading && !hasData(result.data)
  return { ...result, data: isDemo ? demoData : result.data, isDemo }
}

// ─── Integration Hooks ──────────────────────────────────────────

export function useSIEMIntegrations() {
  const empty: ListResponse<SIEMIntegration> = { data: [], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['siem-integrations'],
    queryFn: () => apiList<SIEMIntegration>('/integrations/siem').catch(err => notifyApiError(err, 'SIEM integrations', empty)),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_SIEM_INTEGRATIONS, total: DEMO_SIEM_INTEGRATIONS.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useWebhooks() {
  const empty: ListResponse<WebhookConfig> = { data: [], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => apiList<WebhookConfig>('/integrations/webhooks').catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_WEBHOOKS, total: DEMO_WEBHOOKS.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useTicketingIntegrations() {
  const empty: ListResponse<TicketingIntegration> = { data: [], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['ticketing-integrations'],
    queryFn: () => apiList<TicketingIntegration>('/integrations?type=ticketing').catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_TICKETING, total: DEMO_TICKETING.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useSTIXCollections() {
  const empty: ListResponse<STIXCollection> = { data: [], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['stix-collections'],
    queryFn: () => apiList<STIXCollection>('/integrations/stix').catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_STIX_COLLECTIONS, total: DEMO_STIX_COLLECTIONS.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useBulkExports() {
  const empty: ListResponse<BulkExport> = { data: [], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['bulk-exports'],
    queryFn: () => apiList<BulkExport>('/integrations/exports').catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_BULK_EXPORTS, total: DEMO_BULK_EXPORTS.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useIntegrationStats() {
  const empty: IntegrationStats = { total: 0, active: 0, failing: 0, eventsPerHour: 0, lastSync: null }
  const result = useQuery({
    queryKey: ['integration-stats'],
    queryFn: () => api<IntegrationStats>('/integrations/stats').catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_INTEGRATION_STATS, d => (d?.total ?? 0) > 0)
}

export function useCreateSIEM() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; type: string; endpoint: string; apiKey: string }) =>
      api<SIEMIntegration>('/integrations/siem', { method: 'POST', body: input }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['siem-integrations'] }); qc.invalidateQueries({ queryKey: ['integration-stats'] }) },
  })
}

export function useCreateWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { url: string; secret: string; events: string[]; hmacEnabled: boolean }) =>
      api<WebhookConfig>('/integrations/webhooks', { method: 'POST', body: input }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webhooks'] }); qc.invalidateQueries({ queryKey: ['integration-stats'] }) },
  })
}

export function useCreateTicketing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; type: string; instanceUrl: string; credentials: string; defaultProject: string }) =>
      api<TicketingIntegration>('/integrations/ticketing', { method: 'POST', body: input }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticketing-integrations'] }); qc.invalidateQueries({ queryKey: ['integration-stats'] }) },
  })
}

export function useCreateSTIXCollection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; type: string; pollingInterval: number }) =>
      api<STIXCollection>('/integrations/stix', { method: 'POST', body: input }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stix-collections'] }); qc.invalidateQueries({ queryKey: ['integration-stats'] }) },
  })
}

export function useCreateBulkExport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; format: string; schedule: string; severityFilter?: string; dateRange?: string }) =>
      api<BulkExport>('/integrations/exports', { method: 'POST', body: input }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bulk-exports'] }); qc.invalidateQueries({ queryKey: ['integration-stats'] }) },
  })
}

export function useTestSIEMConnection() {
  return useMutation({
    mutationFn: (id: string) => api<{ success: boolean; latencyMs: number }>(`/integrations/siem/${id}/test`, { method: 'POST' }),
  })
}

// ─── User Management Hooks ──────────────────────────────────────

export function useUsers(params: QueryParams = {}) {
  const query = buildQuery({ page: 1, limit: 50, ...params })
  return useQuery<ListResponse<UserRecord>, ApiError>({
    queryKey: ['users', params],
    queryFn: () => apiList<UserRecord>(`/users${query}`),
    meta: { resource: 'users' },
    staleTime: 60_000,
  })
}

// Real RBAC is the 3-value Prisma Role enum (schema.prisma:102) + shared-auth's role→permission
// map (packages/shared-auth/src/permissions.ts:32) — not importable from the frontend workspace.
// No custom-role backend exists, so this is a static, read-only reference list: no network call,
// no "Create role" entry point. Permission counts mirror ROLE_PERMISSIONS exactly (super_admin:
// ['*'] = 1, tenant_admin = 14 resource grants, analyst = 10).
const REAL_ROLES: RoleRecord[] = [
  { id: 'super_admin', name: 'Super Admin', permissionCount: 1, userCount: 0, isSystem: true, createdAt: '',
    description: 'Full platform access across every tenant. The only role that can manage tenants, plans, and global settings.' },
  { id: 'tenant_admin', name: 'Tenant Admin', permissionCount: 14, userCount: 0, isSystem: true, createdAt: '',
    description: 'Full access within the tenant — IOCs, hunting, alerts, feeds, users, integrations, settings — plus read-only audit log.' },
  { id: 'analyst', name: 'Analyst', permissionCount: 10, userCount: 0, isSystem: true, createdAt: '',
    description: 'Day-to-day SOC work — IOCs, hunting, alerts, dashboards, reports. No user, integration, or settings management.' },
]

/** Static reference list — no backend, no loading/error states. */
export function useRoles() {
  return {
    data: { data: REAL_ROLES, total: REAL_ROLES.length, page: 1, limit: REAL_ROLES.length },
    isLoading: false, isError: false, error: null,
    refetch: () => undefined,
  }
}

/**
 * Real, Prisma-backed sessions: gateway GET /auth/sessions (api-gateway/src/routes/sessions.ts:9),
 * current user only. The in-memory `/users/sessions` UMS route (S162 route-inventory) is not used.
 */
export function useSessions() {
  return useQuery<ListResponse<SessionRecord>, ApiError>({
    queryKey: ['user-sessions'],
    queryFn: async () => {
      const sessions = await api<SessionInfo[]>('/auth/sessions')
      const data: SessionRecord[] = sessions.map(s => ({
        id: s.id,
        userId: '',
        userName: s.isCurrent ? 'You (this session)' : 'You (other device)',
        ip: s.ipAddress,
        device: s.userAgent,
        startedAt: s.createdAt,
        lastActivity: s.lastUsedAt,
        status: 'active',
      }))
      return { data, total: data.length, page: 1, limit: data.length || 50 }
    },
    meta: { resource: 'your active sessions' },
    staleTime: 30_000,
  })
}

export function useAuditLog(params: QueryParams = {}) {
  const query = buildQuery({ page: 1, limit: 50, ...params })
  return useQuery<ListResponse<AuditLogEntry>, ApiError>({
    queryKey: ['audit-log', params],
    queryFn: () => apiList<AuditLogEntry>(`/users/audit${query}`),
    meta: { resource: 'audit log' },
    staleTime: 30_000,
  })
}

export function useUserManagementStats() {
  return useQuery<UserManagementStats, ApiError>({
    queryKey: ['user-management-stats'],
    queryFn: () => api<UserManagementStats>('/users/stats'),
    meta: { resource: 'user stats' },
    staleTime: 60_000,
  })
}

// No DB-backed invite flow exists (S162 route-inventory) — no useInviteUser. The Invite button is
// hidden in UserManagementPage.

// No Team model in Prisma, only an in-memory TeamStore — no useCreateTeam. The Teams tab is
// hidden in UserManagementPage.

// Custom roles are never enforced (see useRoles above) — no useCreateRole. "Create Role" is
// hidden in UserManagementPage.

/** DELETE /auth/sessions/:sessionId — the only real revoke route (api-gateway sessions.ts:16). */
export function useRevokeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      api<void>(`/auth/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['user-sessions'] }); qc.invalidateQueries({ queryKey: ['user-management-stats'] }) },
  })
}

// No bulk "revoke all" route exists on the gateway (only GET / and DELETE /:sessionId) — no
// useRevokeAllSessions. The Revoke All button is hidden in UserManagementPage.

// ─── Customization Hooks ────────────────────────────────────────

export function useModuleToggles() {
  const result = useQuery({
    queryKey: ['module-toggles'],
    // Backend (module-toggles.ts GET /) sends { data: toggles, total } single-wrapped;
    // apiList() normalizes it (api() alone would drop total — RCA #45).
    queryFn: () => apiList<ModuleToggle>('/customization/modules').catch(() => ({ data: [], total: 0, page: 1, limit: 50 })),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_MODULE_TOGGLES, total: DEMO_MODULE_TOGGLES.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

// BLOCKED: frontend calls GET /customization/ai, but aiModelRoutes (registered at prefix
// /customization/ai) has no handler for the bare path — only /models, /tasks, /budget, /usage,
// /recommended, /subtasks, /plans, /cost-estimate. The closest analog, GET /ai/tasks, returns
// TaskMapping[] { id, tenantId, task, model, temperature?, maxTokens?, updatedAt } — it has none
// of AIModelConfig's monthlyBudget/spent/confidenceThreshold/enabled fields. There is no backend
// shape today that satisfies this hook's contract; needs a new endpoint, not a response-unwrap
// fix. Left as a 404 → always-demo fallback (no regression vs. current behavior).
export function useAIConfigs() {
  const result = useQuery({
    queryKey: ['ai-configs'],
    queryFn: () => api<{ data: AIModelConfig[] }>('/customization/ai').catch(() => ({ data: [] })),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_AI_CONFIGS },
    d => (d?.data?.length ?? 0) > 0,
  )
}

// BLOCKED: frontend calls GET /customization/risk-weights, but riskWeightRoutes is registered
// at prefix /customization/risk with routes under /profiles, /presets, /validate — there is no
// /customization/risk-weights path at all (404). The real list endpoint is
// GET /customization/risk/profiles. Fixing the path is a route-repair change, not a response-
// unwrap fix, and is outside this pass's scope. Left as-is (404 → always-demo, no regression).
export function useRiskWeights() {
  const result = useQuery({
    queryKey: ['risk-weights'],
    queryFn: () => api<{ data: RiskWeight[] }>('/customization/risk-weights').catch(() => ({ data: [] })),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_RISK_WEIGHTS },
    d => (d?.data?.length ?? 0) > 0,
  )
}

// BLOCKED: GET /customization/notifications exists and resolves (notifications.ts GET /), but
// it returns a single per-user NotificationPreferences object — { channels: Record<string,
// {enabled, threshold, config}> } — not a NotificationChannel[] list with id/type/name/
// severities/quietHours-per-channel. The backend has no concept of named, individually
// addressable channels; quiet hours are also global (PUT /quiet-hours), not per-channel. This
// needs a real shape reconciliation (backend or frontend model change), not a response-unwrap
// fix. Left as-is: the current `.data` read on a non-array object yields undefined → always
// falls back to demo, same as before this pass (no regression, no crash).
export function useNotificationChannels() {
  const result = useQuery({
    queryKey: ['notification-channels'],
    queryFn: () => api<{ data: NotificationChannel[] }>('/customization/notifications').catch(() => ({ data: [] })),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_NOTIFICATION_CHANNELS },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useCustomizationStats() {
  const empty: CustomizationStats = { modulesEnabled: 0, customRules: 0, aiBudgetUsed: 0, theme: 'dark' }
  const result = useQuery({
    queryKey: ['customization-stats'],
    queryFn: () => api<CustomizationStats>('/customization/stats').catch(err => notifyApiError(err, 'customization stats', empty)),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_CUSTOMIZATION_STATS, d => (d?.modulesEnabled ?? 0) > 0)
}

export function useToggleModule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api<ModuleToggle>(`/customization/modules/${id}`, { method: 'PATCH', body: { enabled } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['module-toggles'] }); qc.invalidateQueries({ queryKey: ['customization-stats'] }) },
  })
}

export function useUpdateAIConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...update }: { id: string; monthlyBudget?: number; confidenceThreshold?: number; enabled?: boolean; model?: string }) =>
      api<AIModelConfig>(`/customization/ai/${id}`, { method: 'PATCH', body: update }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai-configs'] }); qc.invalidateQueries({ queryKey: ['customization-stats'] }) },
  })
}

export function useUpdateRiskWeight() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, weight }: { id: string; weight: number }) =>
      api<RiskWeight>(`/customization/risk-weights/${id}`, { method: 'PATCH', body: { weight } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['risk-weights'] }) },
  })
}

export function useResetRiskWeights() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/customization/risk-weights/reset', { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['risk-weights'] }) },
  })
}

export function useUpdateNotificationChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...update }: { id: string; enabled?: boolean; severities?: string[]; quietHoursStart?: string | null; quietHoursEnd?: string | null }) =>
      api<NotificationChannel>(`/customization/notifications/${id}`, { method: 'PATCH', body: update }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notification-channels'] }) },
  })
}

export function useTestNotification() {
  return useMutation({
    mutationFn: (channelId: string) =>
      api<{ success: boolean }>(`/customization/notifications/${channelId}/test`, { method: 'POST' }),
  })
}

// ─── AI Plan & Subtask Hooks (F2/F3) ────────────────────────────

export function usePlanTiers() {
  const result = useQuery({
    queryKey: ['ai-plan-tiers'],
    // Backend (ai-models.ts GET /plans) sends { data: plans, total } single-wrapped;
    // apiList() normalizes it (api() alone would drop total — RCA #45).
    queryFn: () => apiList<PlanTierMeta>('/customization/ai/plans').catch(() => ({ data: [], total: 0, page: 1, limit: 50 })),
    staleTime: 300_000,
  })
  return withDemoFallback(result,
    { data: DEMO_PLAN_TIERS, total: DEMO_PLAN_TIERS.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useSubtaskMappings() {
  const result = useQuery({
    queryKey: ['ai-subtask-mappings'],
    // Backend (ai-models.ts GET /subtasks) sends { data: mappings, total } single-wrapped.
    queryFn: () => apiList<SubtaskMapping>('/customization/ai/subtasks').catch(() => ({ data: [], total: 0, page: 1, limit: 50 })),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_SUBTASK_MAPPINGS, total: DEMO_SUBTASK_MAPPINGS.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useRecommendedModels() {
  const result = useQuery({
    queryKey: ['ai-recommended-models'],
    // Backend (ai-models.ts GET /recommended) sends { data: recommended, total } single-wrapped.
    queryFn: () => apiList<RecommendedSubtask>('/customization/ai/recommended').catch(() => ({ data: [], total: 0, page: 1, limit: 50 })),
    staleTime: 300_000,
  })
  return withDemoFallback(result,
    { data: DEMO_RECOMMENDED_MODELS, total: DEMO_RECOMMENDED_MODELS.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useCostEstimate(plan: string, articles: number) {
  const result = useQuery({
    queryKey: ['ai-cost-estimate', plan, articles],
    // Backend (ai-models.ts GET /cost-estimate) sends { data: estimate } single-wrapped;
    // api() already unwraps it — the CostEstimate fields are top-level, not nested under .data.
    queryFn: () => api<CostEstimate>(`/customization/ai/cost-estimate?plan=${encodeURIComponent(plan)}&articles=${articles}`).catch(() => null as unknown as CostEstimate),
    staleTime: 60_000,
    enabled: articles > 0,
  })
  return withDemoFallback(result,
    DEMO_COST_ESTIMATE,
    d => d?.totalMonthlyUsd != null,
  )
}

export function useApplyPlan() {
  const qc = useQueryClient()
  return useMutation({
    // Backend (ai-models.ts POST /plans/apply) sends { data: mappings, plan, total }
    // single-wrapped; api() unwraps to `mappings` directly — `plan`/`total` are not recoverable
    // from this call (dropped by the single unwrap). No consumer reads them off the mutation
    // result today (CustomizationPage just invalidates queries on success).
    mutationFn: (plan: string) =>
      api<SubtaskMapping[]>(
        '/customization/ai/plans/apply', { method: 'POST', body: { plan } },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-subtask-mappings'] })
      qc.invalidateQueries({ queryKey: ['ai-cost-estimate'] })
    },
  })
}

export function useSetSubtaskModel() {
  const qc = useQueryClient()
  return useMutation({
    // Backend (ai-models.ts PUT /subtasks/:subtask) sends { data: mapping } single-wrapped.
    mutationFn: ({ subtask, model, fallbackModel }: { subtask: string; model: string; fallbackModel?: string }) =>
      api<SubtaskMapping>(
        `/customization/ai/subtasks/${encodeURIComponent(subtask)}`,
        { method: 'PUT', body: fallbackModel ? { model, fallbackModel } : { model } },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-subtask-mappings'] })
      qc.invalidateQueries({ queryKey: ['ai-cost-estimate'] })
    },
  })
}

// ─── BYOK: Provider API Keys ─────────────────────────────────────

export interface AnthropicKeyStatus {
  tenantId: string
  hasKey: boolean
  maskedKey: string | null
}

/** GET /customization/api-keys/anthropic — BYOK key status. Never returns the raw key. */
export function useAnthropicKeyStatus() {
  const fallback: AnthropicKeyStatus = { tenantId: 'default', hasKey: false, maskedKey: null }
  const result = useQuery({
    queryKey: ['anthropic-key-status'],
    // Backend (api-keys.ts) sends { data: status } single-wrapped; api() already unwraps it.
    queryFn: () =>
      api<AnthropicKeyStatus>('/customization/api-keys/anthropic')
        .catch(() => fallback),
    staleTime: 30_000,
  })
  return withDemoFallback(result, fallback, d => d != null)
}

/** PUT /customization/api-keys/anthropic — Store tenant Anthropic API key. */
export function useSaveAnthropicKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (apiKey: string) =>
      api<AnthropicKeyStatus>('/customization/api-keys/anthropic', { method: 'PUT', body: { apiKey } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['anthropic-key-status'] }) },
  })
}

/** DELETE /customization/api-keys/anthropic — Remove tenant Anthropic API key. */
export function useDeleteAnthropicKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<AnthropicKeyStatus>('/customization/api-keys/anthropic', { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['anthropic-key-status'] }) },
  })
}
