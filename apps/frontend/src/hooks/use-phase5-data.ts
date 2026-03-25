/**
 * @module hooks/use-phase5-data
 * @description TanStack Query hooks for Phase 5 services:
 * Integration (:3015), User Management (:3016), Customization (:3017).
 * All queries go through nginx → backend services.
 */
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  DEMO_SIEM_INTEGRATIONS, DEMO_WEBHOOKS, DEMO_TICKETING,
  DEMO_STIX_COLLECTIONS, DEMO_BULK_EXPORTS, DEMO_INTEGRATION_STATS,
  DEMO_USERS, DEMO_TEAMS, DEMO_ROLES, DEMO_SESSIONS,
  DEMO_AUDIT_LOG, DEMO_USER_MANAGEMENT_STATS,
  DEMO_MODULE_TOGGLES, DEMO_AI_CONFIGS, DEMO_RISK_WEIGHTS,
  DEMO_NOTIFICATION_CHANNELS, DEMO_CUSTOMIZATION_STATS,
  DEMO_PLAN_TIERS, DEMO_SUBTASK_MAPPINGS, DEMO_RECOMMENDED_MODELS, DEMO_COST_ESTIMATE,
  type SIEMIntegration, type WebhookConfig, type TicketingIntegration,
  type STIXCollection, type BulkExport, type IntegrationStats,
  type UserRecord, type TeamRecord, type RoleRecord,
  type SessionRecord, type AuditLogEntry, type UserManagementStats,
  type ModuleToggle, type AIModelConfig, type RiskWeight,
  type NotificationChannel, type CustomizationStats,
  type PlanTierMeta, type SubtaskMapping, type RecommendedSubtask, type CostEstimate,
} from './phase5-demo-data'

// Re-export types for page consumption
export type {
  SIEMIntegration, WebhookConfig, TicketingIntegration,
  STIXCollection, BulkExport, IntegrationStats,
  UserRecord, TeamRecord, RoleRecord,
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
    queryFn: () => api<ListResponse<SIEMIntegration>>('/integrations/siem').catch(() => empty),
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
    queryFn: () => api<ListResponse<WebhookConfig>>('/integrations/webhooks').catch(() => empty),
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
    queryFn: () => api<ListResponse<TicketingIntegration>>('/integrations/ticketing').catch(() => empty),
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
    queryFn: () => api<ListResponse<STIXCollection>>('/integrations/stix').catch(() => empty),
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
    queryFn: () => api<ListResponse<BulkExport>>('/integrations/exports').catch(() => empty),
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
  const empty: ListResponse<UserRecord> = { data: [], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['users', params],
    queryFn: () => api<ListResponse<UserRecord>>(`/users${query}`).catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_USERS, total: DEMO_USERS.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useTeams() {
  const empty: ListResponse<TeamRecord> = { data: [], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['teams'],
    queryFn: () => api<ListResponse<TeamRecord>>('/users/teams').catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_TEAMS, total: DEMO_TEAMS.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useRoles() {
  const empty: ListResponse<RoleRecord> = { data: [], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['roles'],
    queryFn: () => api<ListResponse<RoleRecord>>('/users/roles').catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_ROLES, total: DEMO_ROLES.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useSessions() {
  const empty: ListResponse<SessionRecord> = { data: [], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['user-sessions'],
    queryFn: () => api<ListResponse<SessionRecord>>('/users/sessions').catch(() => empty),
    staleTime: 30_000,
  })
  return withDemoFallback(result,
    { data: DEMO_SESSIONS, total: DEMO_SESSIONS.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useAuditLog(params: QueryParams = {}) {
  const query = buildQuery({ page: 1, limit: 50, ...params })
  const empty: ListResponse<AuditLogEntry> = { data: [], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['audit-log', params],
    queryFn: () => api<ListResponse<AuditLogEntry>>(`/users/audit${query}`).catch(() => empty),
    staleTime: 30_000,
  })
  return withDemoFallback(result,
    { data: DEMO_AUDIT_LOG, total: DEMO_AUDIT_LOG.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useUserManagementStats() {
  const empty: UserManagementStats = { totalUsers: 0, activeSessions: 0, teams: 0, roles: 0, mfaPercent: 0 }
  const result = useQuery({
    queryKey: ['user-management-stats'],
    queryFn: () => api<UserManagementStats>('/users/stats').catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_USER_MANAGEMENT_STATS, d => (d?.totalUsers ?? 0) > 0)
}

export function useInviteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { email: string; role: string; teamId?: string }) =>
      api<UserRecord>('/users/invite', { method: 'POST', body: input }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); qc.invalidateQueries({ queryKey: ['user-management-stats'] }) },
  })
}

export function useCreateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; description: string; leadId: string }) =>
      api<TeamRecord>('/users/teams', { method: 'POST', body: input }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); qc.invalidateQueries({ queryKey: ['user-management-stats'] }) },
  })
}

export function useCreateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; description: string; permissions: string[] }) =>
      api<RoleRecord>('/users/roles', { method: 'POST', body: input }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); qc.invalidateQueries({ queryKey: ['user-management-stats'] }) },
  })
}

export function useRevokeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      api<void>(`/users/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['user-sessions'] }); qc.invalidateQueries({ queryKey: ['user-management-stats'] }) },
  })
}

export function useRevokeAllSessions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/users/sessions', { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['user-sessions'] }); qc.invalidateQueries({ queryKey: ['user-management-stats'] }) },
  })
}

// ─── Customization Hooks ────────────────────────────────────────

export function useModuleToggles() {
  const result = useQuery({
    queryKey: ['module-toggles'],
    queryFn: () => api<{ data: ModuleToggle[] }>('/customization/modules').catch(() => ({ data: [] })),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_MODULE_TOGGLES },
    d => (d?.data?.length ?? 0) > 0,
  )
}

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
    queryFn: () => api<CustomizationStats>('/customization/stats').catch(() => empty),
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
    queryFn: () => api<{ data: PlanTierMeta[] }>('/customization/ai/plans').catch(() => ({ data: [] })),
    staleTime: 300_000,
  })
  return withDemoFallback(result,
    { data: DEMO_PLAN_TIERS },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useSubtaskMappings() {
  const result = useQuery({
    queryKey: ['ai-subtask-mappings'],
    queryFn: () => api<{ data: SubtaskMapping[] }>('/customization/ai/subtasks').catch(() => ({ data: [] })),
    staleTime: 60_000,
  })
  return withDemoFallback(result,
    { data: DEMO_SUBTASK_MAPPINGS },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useRecommendedModels() {
  const result = useQuery({
    queryKey: ['ai-recommended-models'],
    queryFn: () => api<{ data: RecommendedSubtask[] }>('/customization/ai/recommended').catch(() => ({ data: [] })),
    staleTime: 300_000,
  })
  return withDemoFallback(result,
    { data: DEMO_RECOMMENDED_MODELS },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useCostEstimate(plan: string, articles: number) {
  const result = useQuery({
    queryKey: ['ai-cost-estimate', plan, articles],
    queryFn: () => api<{ data: CostEstimate }>(`/customization/ai/cost-estimate?plan=${encodeURIComponent(plan)}&articles=${articles}`).catch(() => ({ data: null as unknown as CostEstimate })),
    staleTime: 60_000,
    enabled: articles > 0,
  })
  return withDemoFallback(result,
    { data: DEMO_COST_ESTIMATE },
    d => d?.data?.totalMonthlyUsd != null,
  )
}

export function useApplyPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (plan: string) =>
      api<{ data: SubtaskMapping[]; plan: string; total: number }>(
        '/customization/ai/plans/apply', { method: 'POST', body: { plan } },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-subtask-mappings'] })
      qc.invalidateQueries({ queryKey: ['ai-cost-estimate'] })
    },
  })
}
