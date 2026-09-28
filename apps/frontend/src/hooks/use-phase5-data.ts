/**
 * @module hooks/use-phase5-data
 * @description TanStack Query hooks for Phase 5 services:
 * Integration (:3015), User Management (:3016), Customization (:3017).
 * All queries go through nginx → backend services.
 * Real data or honest empty/error states only — no demo fallback (DECISION-048).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { apiList } from '@/lib/api-list'
import type { SessionInfo } from '@/types/auth-security'
import {
  type UserRecord, type RoleRecord,
  type SessionRecord, type AuditLogEntry, type UserManagementStats,
} from './phase5-demo-data'

// ─── Re-exported page types (real-shape, defined here now) ──────

export interface SIEMIntegration {
  id: string; name: string; type: 'splunk' | 'sentinel' | 'elastic'
  status: 'active' | 'disabled'; endpoint: string
  eventsForwarded: number; lastSync: string | null; latencyMs: number
  createdAt: string
}

export interface WebhookConfig {
  id: string; url: string; events: string[]; status: 'active' | 'disabled'
  deliveryRate: number; lastTriggered: string | null; secret: string
  hmacEnabled: boolean; retryCount: number; dlqCount: number; createdAt: string
}

export interface TicketingIntegration {
  id: string; name: string; type: 'servicenow' | 'jira'
  project: string; autoCreateRules: number; status: 'active' | 'disabled'
  recentTickets: number; createdAt: string
}

export interface STIXCollection {
  id: string; name: string; type: 'publish' | 'subscribe'
  objectCount: number; lastPollOrPush: string | null; status: 'active' | 'paused'
  pollingInterval: number; createdAt: string
}

export interface BulkExport {
  id: string; name: string; format: 'stix' | 'csv' | 'json'
  schedule: string; lastRun: string | null; nextRun: string | null
  status: 'active' | 'paused' | 'error'; recordCount: number; createdAt: string
}

export interface IntegrationStats {
  total: number; active: number; failing: number
  eventsPerHour: number; lastSync: string | null
}

export interface ModuleToggle {
  id: string; name: string; description: string; enabled: boolean
  icon: string; dependencies: string[]; category: string
}

export interface AIModelConfig {
  id: string; task: string; model: string; maxTokens: number
  monthlyBudget: number; spent: number; confidenceThreshold: number
  enabled: boolean
}

export interface RiskWeight {
  id: string; factor: string; weight: number; description: string
  min: number; max: number; default: number
}

export interface NotificationChannel {
  id: string; type: 'email' | 'slack' | 'webhook' | 'in_app'
  name: string; enabled: boolean; severities: string[]
  quietHoursStart: string | null; quietHoursEnd: string | null
}

export interface CustomizationStats {
  modulesEnabled: number; customRules: number
  aiBudgetUsed: number; theme: string
}

export interface PlanTierMeta {
  plan: 'starter' | 'professional' | 'enterprise' | 'custom'
  displayName: string; description: string; stageModel: string
  costPer1KArticlesUsd: string; accuracyPct: string; isRecommended: boolean
}

export interface SubtaskMapping {
  id: string; tenantId: string; subtask: string; stage: 1 | 2 | 3
  model: 'haiku' | 'sonnet' | 'opus'; fallbackModel: 'haiku' | 'sonnet' | 'opus'
  isRecommended: boolean; updatedAt: string
}

export interface RecommendedSubtask {
  subtask: string; stage: 1 | 2 | 3
  recommendedModel: 'haiku' | 'sonnet' | 'opus'; fallbackModel: 'haiku' | 'sonnet' | 'opus'
  description: string
}

interface StageEstimate {
  stage: 1 | 2 | 3; model: 'haiku' | 'sonnet' | 'opus'
  articles: number; subtasks: number; costUsd: number
}

export interface CostEstimate {
  perStage: StageEstimate[]
  totalMonthlyUsd: number
  comparedTo: { starter: number; professional: number; enterprise: number }
}

// Re-export user-management types (untouched hooks below still use these)
export type { UserRecord, RoleRecord, SessionRecord, AuditLogEntry, UserManagementStats }

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

// ─── Integration Hooks ──────────────────────────────────────────
// apps/integration-service's real Integration entity (integrations.ts GET /) has no
// eventsForwarded/latencyMs/deliveryRate/dlqCount/status-detail fields — those live only on
// per-item /:id/health (not fetched in a list). Adapters below map what's real and leave the
// rest at a documented zero (ponytail: wire /:id/health per-row if per-integration metrics
// become a real requirement).

interface IntegrationApi {
  id: string; name: string; type: string; enabled: boolean
  triggers: string[]
  webhookConfig?: { url: string; secret?: string }
  siemConfig?: { type: string; url?: string }
  ticketingConfig?: { type: string; projectKey?: string; tableName?: string }
  lastUsedAt: string | null; createdAt: string
}

const SIEM_TYPE_MAP: Record<string, SIEMIntegration['type']> = {
  splunk_hec: 'splunk', sentinel: 'sentinel', elastic_siem: 'elastic',
}
const SIEM_TYPE_MAP_REV: Record<SIEMIntegration['type'], string> = {
  splunk: 'splunk_hec', sentinel: 'sentinel', elastic: 'elastic_siem',
}

function toSIEMIntegration(i: IntegrationApi): SIEMIntegration {
  return {
    id: i.id, name: i.name, type: SIEM_TYPE_MAP[i.type] ?? 'splunk',
    status: i.enabled ? 'active' : 'disabled',
    endpoint: i.siemConfig?.url ?? '',
    // ponytail: no per-item event/latency counters on the list endpoint; 0 until wired
    eventsForwarded: 0, lastSync: i.lastUsedAt, latencyMs: 0,
    createdAt: i.createdAt,
  }
}

function toWebhookConfig(i: IntegrationApi): WebhookConfig {
  return {
    id: i.id, url: i.webhookConfig?.url ?? '', events: i.triggers,
    status: i.enabled ? 'active' : 'disabled',
    // ponytail: delivery rate / retry / DLQ counts live in webhook-service, not this list
    deliveryRate: 0, lastTriggered: i.lastUsedAt, secret: '',
    hmacEnabled: !!i.webhookConfig?.secret, retryCount: 0, dlqCount: 0,
    createdAt: i.createdAt,
  }
}

function toTicketingIntegration(i: IntegrationApi): TicketingIntegration {
  return {
    id: i.id, name: i.name,
    type: i.ticketingConfig?.type === 'servicenow' ? 'servicenow' : 'jira',
    project: i.ticketingConfig?.projectKey ?? i.ticketingConfig?.tableName ?? '',
    autoCreateRules: 0, status: i.enabled ? 'active' : 'disabled',
    // ponytail: recent-ticket count needs a per-integration ticket query, not on this list
    recentTickets: 0, createdAt: i.createdAt,
  }
}

export function useSIEMIntegrations() {
  return useQuery({
    queryKey: ['siem-integrations'],
    queryFn: async () => {
      const r = await apiList<IntegrationApi>('/integrations')
      const data = r.data.filter(i => ['splunk_hec', 'sentinel', 'elastic_siem'].includes(i.type)).map(toSIEMIntegration)
      return { data, total: data.length, page: 1, limit: 50 } satisfies ListResponse<SIEMIntegration>
    },
    meta: { resource: 'SIEM integrations' },
    staleTime: 60_000,
  })
}

export function useWebhooks() {
  return useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => {
      const r = await apiList<IntegrationApi>('/integrations?type=webhook')
      const data = r.data.map(toWebhookConfig)
      return { ...r, data } satisfies ListResponse<WebhookConfig>
    },
    meta: { resource: 'webhooks' },
    staleTime: 60_000,
  })
}

export function useTicketingIntegrations() {
  return useQuery({
    queryKey: ['ticketing-integrations'],
    queryFn: async () => {
      const r = await apiList<IntegrationApi>('/integrations')
      const data = r.data.filter(i => ['servicenow', 'jira'].includes(i.type)).map(toTicketingIntegration)
      return { data, total: data.length, page: 1, limit: 50 } satisfies ListResponse<TicketingIntegration>
    },
    meta: { resource: 'ticketing integrations' },
    staleTime: 60_000,
  })
}

// BLOCKED: advancedRoutes only exposes POST/PUT/DELETE + GET /:id/manifest for managed TAXII
// collections (advanced.ts) — there is no GET list route for ManagedTaxiiCollection. The GET
// /taxii/collections route that does exist (export.ts) returns a different, hardcoded
// TaxiiCollection[] (2 fixed feed descriptors, no name/objectCount/pollingInterval fields) that
// has nothing to do with tenant-created collections — using it would show fabricated-looking
// data, worse than an honest error. Left calling the (still-missing) list path so the page shows
// a real error card, not invented rows. Needs a real GET /taxii/collections (managed) route.
export function useSTIXCollections() {
  return useQuery({
    queryKey: ['stix-collections'],
    queryFn: () => apiList<STIXCollection>('/integrations/taxii/managed-collections'),
    meta: { resource: 'STIX/TAXII collections' },
    staleTime: 60_000,
  })
}

interface ExportScheduleApi {
  id: string; name: string; cronExpression: string; format: BulkExport['format']
  enabled: boolean; lastRunAt: string | null; lastRunStatus: 'success' | 'failure' | null
  nextRunAt: string | null; createdAt: string
}
function toBulkExport(s: ExportScheduleApi): BulkExport {
  return {
    id: s.id, name: s.name, format: s.format, schedule: s.cronExpression,
    lastRun: s.lastRunAt, nextRun: s.nextRunAt,
    status: !s.enabled ? 'paused' : s.lastRunStatus === 'failure' ? 'error' : 'active',
    // ponytail: schedule doesn't carry an aggregate record count; only per-run history does
    recordCount: 0, createdAt: s.createdAt,
  }
}

export function useBulkExports() {
  return useQuery({
    queryKey: ['bulk-exports'],
    queryFn: async () => {
      const r = await apiList<ExportScheduleApi>('/integrations/export/schedules')
      return { ...r, data: r.data.map(toBulkExport) }
    },
    meta: { resource: 'bulk exports' },
    staleTime: 60_000,
  })
}

interface IntegrationStatsApi {
  totalIntegrations: number; enabledIntegrations: number
  totalLogs: number; failedLogs: number; dlqSize: number; totalTickets: number
}
function toIntegrationStats(s: IntegrationStatsApi): IntegrationStats {
  return {
    total: s.totalIntegrations, active: s.enabledIntegrations, failing: s.failedLogs,
    // ponytail: no events/hr or last-sync-across-all-integrations aggregate on this endpoint
    eventsPerHour: 0, lastSync: null,
  }
}

export function useIntegrationStats() {
  return useQuery({
    queryKey: ['integration-stats'],
    queryFn: () => api<IntegrationStatsApi>('/integrations/stats').then(toIntegrationStats),
    meta: { resource: 'integration stats' },
    staleTime: 60_000,
  })
}

export function useCreateSIEM() {
  const qc = useQueryClient()
  return useMutation({
    // ponytail: one generic endpoint+apiKey form covers 3 real config shapes (splunk_hec:
    // url+token, sentinel: workspaceId+sharedKey, elastic_siem: url+apiKey) — best-effort map;
    // sentinel needs its own form fields (workspaceId/sharedKey) to be fully correct.
    mutationFn: (input: { name: string; type: string; endpoint: string; apiKey: string }) => {
      const siemType = SIEM_TYPE_MAP_REV[input.type as SIEMIntegration['type']] ?? 'splunk_hec'
      const siemConfig = siemType === 'sentinel'
        ? { type: siemType, workspaceId: input.endpoint, sharedKey: input.apiKey }
        : siemType === 'elastic_siem'
          ? { type: siemType, url: input.endpoint, apiKey: input.apiKey }
          : { type: siemType, url: input.endpoint, token: input.apiKey }
      return api<IntegrationApi>('/integrations', {
        method: 'POST',
        body: { name: input.name, type: siemType, enabled: true, triggers: ['alert.created'], siemConfig },
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['siem-integrations'] }); qc.invalidateQueries({ queryKey: ['integration-stats'] }) },
  })
}

export function useCreateWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { url: string; secret: string; events: string[]; hmacEnabled: boolean }) =>
      api<IntegrationApi>('/integrations', {
        method: 'POST',
        body: {
          name: `Webhook — ${input.url}`, type: 'webhook', enabled: true,
          triggers: input.events.length > 0 ? input.events : ['alert.created'],
          webhookConfig: { url: input.url, secret: input.secret || undefined, headers: {}, method: 'POST' },
        },
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webhooks'] }); qc.invalidateQueries({ queryKey: ['integration-stats'] }) },
  })
}

export function useCreateTicketing() {
  const qc = useQueryClient()
  return useMutation({
    // ponytail: form has no `email` field, required by JiraConfigSchema — jira creates will 400
    // until the modal collects it; out of scope for this pass (form change, not hook change).
    mutationFn: (input: { name: string; type: string; instanceUrl: string; credentials: string; defaultProject: string }) => {
      const ticketingConfig = input.type === 'jira'
        ? { type: 'jira', baseUrl: input.instanceUrl, email: '', apiToken: input.credentials, projectKey: input.defaultProject, issueType: 'Task' }
        : { type: 'servicenow', instanceUrl: input.instanceUrl, username: '', password: input.credentials, tableName: input.defaultProject || 'incident' }
      return api<IntegrationApi>('/integrations', {
        method: 'POST',
        body: { name: input.name, type: input.type, enabled: true, triggers: ['alert.created'], ticketingConfig },
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ticketing-integrations'] }); qc.invalidateQueries({ queryKey: ['integration-stats'] }) },
  })
}

export function useCreateSTIXCollection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; type: string; pollingInterval: number }) =>
      api<STIXCollection>('/integrations/taxii/collections', {
        method: 'POST',
        body: {
          title: input.name, description: '',
          canRead: input.type === 'subscribe', canWrite: input.type === 'publish',
          mediaTypes: ['application/stix+json;version=2.1'],
          pollingIntervalMinutes: Math.max(1, Math.round(input.pollingInterval / 60)),
        },
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stix-collections'] }); qc.invalidateQueries({ queryKey: ['integration-stats'] }) },
  })
}

export function useCreateBulkExport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; format: string; schedule: string; severityFilter?: string; dateRange?: string }) =>
      api<ExportScheduleApi>('/integrations/export/schedules', {
        method: 'POST',
        body: {
          name: input.name, cronExpression: input.schedule, format: input.format,
          entityType: 'iocs', filters: input.severityFilter ? { severity: input.severityFilter } : {}, enabled: true,
        },
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bulk-exports'] }); qc.invalidateQueries({ queryKey: ['integration-stats'] }) },
  })
}

export function useTestSIEMConnection() {
  return useMutation({
    mutationFn: (id: string) => api<{ success: boolean; message: string }>(`/integrations/${id}/test`, { method: 'POST' }),
  })
}

// ─── User Management Hooks (unchanged — S162 already honest) ────

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

interface ModuleToggleApi {
  id: string; tenantId: string; module: string; enabled: boolean
  featureFlags: Record<string, boolean>; updatedAt: string; updatedBy: string
}
// ponytail: real ModuleToggle (module-toggle-store.ts) carries no description/icon/dependencies/
// category — CustomizationPage's card UI for those fields has nothing real to show until the
// store grows them. name falls back to the raw module id (e.g. "hunting").
function toModuleToggle(t: ModuleToggleApi): ModuleToggle {
  // id = module name: the backend keys toggles by module (PUT /customization/modules/:module), not the row UUID.
  return { id: t.module, name: t.module, description: '', enabled: t.enabled, icon: '', dependencies: [], category: '' }
}

export function useModuleToggles() {
  return useQuery({
    queryKey: ['module-toggles'],
    // Backend (module-toggles.ts GET /) sends { data: toggles, total } single-wrapped;
    // apiList() normalizes it (api() alone would drop total — RCA #45).
    queryFn: async () => {
      const r = await apiList<ModuleToggleApi>('/customization/modules')
      return { ...r, data: r.data.map(toModuleToggle) }
    },
    meta: { resource: 'module toggles' },
    staleTime: 60_000,
  })
}

// BLOCKED: frontend calls GET /customization/risk-weights, but riskWeightRoutes is registered
// at prefix /customization/risk with routes under /profiles, /presets, /validate — there is no
// /customization/risk-weights path at all (404). The real list endpoint is
// GET /customization/risk/profiles. Fixing the path is a route-repair change, not a response-
// unwrap fix, and is outside this pass's scope. Left as-is: honest 404 error card.
export function useRiskWeights() {
  return useQuery({
    queryKey: ['risk-weights'],
    queryFn: () => api<{ data: RiskWeight[] }>('/customization/risk-weights'),
    meta: { resource: 'risk weights' },
    staleTime: 60_000,
  })
}

// BLOCKED: GET /customization/notifications exists and resolves (notifications.ts GET /), but
// it returns a single per-user NotificationPreferences object — { channels: Record<string,
// {enabled, threshold, config}> } — not a NotificationChannel[] list with id/type/name/
// severities/quietHours-per-channel. The backend has no concept of named, individually
// addressable channels; quiet hours are also global (PUT /quiet-hours), not per-channel. This
// needs a real shape reconciliation (backend or frontend model change), not a response-unwrap
// fix. Left as-is: the current `.data` read on a non-array object yields undefined → QueryStateView
// shows an honest empty state (no crash, no regression, no fabricated rows).
export function useNotificationChannels() {
  return useQuery({
    queryKey: ['notification-channels'],
    queryFn: () => api<{ data: NotificationChannel[] }>('/customization/notifications'),
    meta: { resource: 'notification channels' },
    staleTime: 60_000,
  })
}

// BLOCKED: no /customization/stats route exists anywhere in the service (dashboard.ts has
// /layout, /filters, /preferences; command-center.ts has /queue-stats and period-scoped
// analytics, neither named /stats). Honest 404 error card until a real aggregate route is added.
export function useCustomizationStats() {
  return useQuery({
    queryKey: ['customization-stats'],
    queryFn: () => api<CustomizationStats>('/customization/stats'),
    meta: { resource: 'customization stats' },
    staleTime: 60_000,
  })
}

export function useToggleModule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api<ModuleToggleApi>(`/customization/modules/${id}`, { method: 'PUT', body: { enabled } }),
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
// These 4 endpoints' real shapes (plan-tiers.ts PlanTierMeta, ai-model-store.ts SubtaskMapping /
// RecommendedSubtask, cost-estimator.ts CostEstimate) match the frontend types field-for-field —
// no adapter needed.

export function usePlanTiers() {
  return useQuery({
    queryKey: ['ai-plan-tiers'],
    // Backend (ai-models.ts GET /plans) sends { data: plans, total } single-wrapped;
    // apiList() normalizes it (api() alone would drop total — RCA #45).
    queryFn: () => apiList<PlanTierMeta>('/customization/ai/plans'),
    meta: { resource: 'AI plan tiers' },
    staleTime: 300_000,
  })
}

export function useSubtaskMappings() {
  return useQuery({
    queryKey: ['ai-subtask-mappings'],
    // Backend (ai-models.ts GET /subtasks) sends { data: mappings, total } single-wrapped.
    queryFn: () => apiList<SubtaskMapping>('/customization/ai/subtasks'),
    meta: { resource: 'AI subtask mappings' },
    staleTime: 60_000,
  })
}

export function useRecommendedModels() {
  return useQuery({
    queryKey: ['ai-recommended-models'],
    // Backend (ai-models.ts GET /recommended) sends { data: recommended, total } single-wrapped.
    queryFn: () => apiList<RecommendedSubtask>('/customization/ai/recommended'),
    meta: { resource: 'recommended AI models' },
    staleTime: 300_000,
  })
}

export function useCostEstimate(plan: string, articles: number) {
  return useQuery({
    queryKey: ['ai-cost-estimate', plan, articles],
    // Backend (ai-models.ts GET /cost-estimate) sends { data: estimate } single-wrapped;
    // api() already unwraps it — the CostEstimate fields are top-level, not nested under .data.
    queryFn: () => api<CostEstimate>(`/customization/ai/cost-estimate?plan=${encodeURIComponent(plan)}&articles=${articles}`),
    meta: { resource: 'AI cost estimate' },
    staleTime: 60_000,
    enabled: articles > 0,
  })
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
  return useQuery({
    queryKey: ['anthropic-key-status'],
    // Backend (api-keys.ts) sends { data: status } single-wrapped; api() already unwraps it.
    // Real shape matches AnthropicKeyStatus field-for-field — no adapter needed.
    queryFn: () => api<AnthropicKeyStatus>('/customization/api-keys/anthropic'),
    meta: { resource: 'Anthropic API key status' },
    staleTime: 30_000,
  })
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
