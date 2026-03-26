/**
 * @module hooks/use-phase6-data
 * @description TanStack Query hooks for Phase 6 services:
 * Billing (:3019) and Admin Ops (:3022).
 * All queries go through nginx → backend services.
 */
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  DEMO_BILLING_PLANS, DEMO_USAGE_METERS, DEMO_CURRENT_SUBSCRIPTION,
  DEMO_PAYMENT_HISTORY, DEMO_BILLING_STATS,
  DEMO_SERVICE_HEALTH, DEMO_SYSTEM_HEALTH_SUMMARY,
  DEMO_MAINTENANCE_WINDOWS, DEMO_TENANTS, DEMO_ADMIN_AUDIT, DEMO_ADMIN_STATS,
  DEMO_ONBOARDING_WIZARD, DEMO_PIPELINE_HEALTH, DEMO_MODULE_STATUS,
  DEMO_READINESS_RESULT, DEMO_WELCOME_DASHBOARD,
  type BillingPlan, type UsageMeters, type CurrentSubscription,
  type PaymentRecord, type BillingStats,
  type ServiceHealth, type SystemHealthSummary,
  type MaintenanceWindow, type TenantRecord, type AdminAuditEntry, type AdminStats,
  type OnboardingWizard, type PipelineHealth, type ModuleStatus,
  type ReadinessResult, type WelcomeDashboard,
} from './phase6-demo-data'

// Re-export types for page consumption
export type {
  BillingPlan, UsageMeters, CurrentSubscription,
  PaymentRecord, BillingStats,
  ServiceHealth, SystemHealthSummary,
  MaintenanceWindow, TenantRecord, AdminAuditEntry, AdminStats,
  OnboardingWizard, PipelineHealth, ModuleStatus,
  ReadinessResult, WelcomeDashboard,
}

/** Single BullMQ queue depth snapshot. */
export interface QueueDepth {
  name: string
  waiting: number
  active: number
  failed: number
  completed: number
}

/** Response shape from GET /api/v1/admin/queues */
interface QueueHealthResponse {
  queues: QueueDepth[]
  updatedAt: string
  redisUnavailable?: boolean
}

/** Single active queue alert (from GET /api/v1/admin/queues/alerts). */
export interface QueueAlert {
  queueName: string
  severity: 'critical'
  waitingCount: number
  failedCount: number
  firedAt: string
  threshold: { waitingMax: number; failedMax: number }
}

/** Response shape from GET /api/v1/admin/queues/alerts */
interface QueueAlertsResponse {
  alerts: QueueAlert[]
}

/** Realistic idle-state demo data — all queues at zero. */
const DEMO_QUEUE_HEALTH: QueueHealthResponse = {
  updatedAt: new Date().toISOString(),
  queues: [
    'etip-feed-fetch', 'etip-feed-parse', 'etip-normalize', 'etip-deduplicate',
    'etip-enrich-realtime', 'etip-enrich-batch', 'etip-graph-sync', 'etip-correlate',
    'etip-alert-evaluate', 'etip-integration-push', 'etip-archive',
    'etip-report-generate', 'etip-ioc-indexed', 'etip-cache-invalidate',
  ].map((name, i) => ({
    name,
    // Seed a few queues with demo non-zero values so the UI colour-coding is visible
    waiting:   i === 0 ? 3 : i === 4 ? 12 : 0,
    active:    i === 4 ? 2 : 0,
    failed:    i === 6 ? 1 : 0,
    completed: i < 5 ? Math.floor(Math.random() * 800) + 100 : 0,
  })),
}

// ─── Generic helpers ────────────────────────────────────────────

interface ListResponse<T> {
  data: T[]; total: number; page: number; limit: number
}

function withDemoFallback<T>(
  result: UseQueryResult<T>,
  demoData: T,
  hasData: (d: T | undefined) => boolean,
) {
  const isDemo = !result.isLoading && !hasData(result.data)
  return { ...result, data: isDemo ? demoData : result.data, isDemo }
}

// ─── Billing Hooks ───────────────────────────────────────────────

export function useBillingPlans() {
  const result = useQuery({
    queryKey: ['billing-plans'],
    queryFn: () => api<BillingPlan[]>('/billing/plans').catch(() => [] as BillingPlan[]),
    staleTime: 300_000,
  })
  return withDemoFallback(
    result,
    DEMO_BILLING_PLANS,
    d => Array.isArray(d) && d.length > 0 && typeof (d[0] as unknown as Record<string, unknown>)?.priceInr === 'number',
  )
}

export function useUsageMeters() {
  const result = useQuery({
    queryKey: ['billing-usage'],
    queryFn: () => api<UsageMeters>('/billing/usage').catch(() => null as unknown as UsageMeters),
    staleTime: 60_000,
  })
  // Validate shape: API returns flat {api_calls,iocs_ingested,...} not nested UsageMeters
  return withDemoFallback(result, DEMO_USAGE_METERS,
    d => d != null && typeof (d as unknown as Record<string, unknown>)?.apiCalls === 'object')
}

export function useCurrentSubscription() {
  const result = useQuery({
    queryKey: ['billing-subscription'],
    queryFn: () => api<CurrentSubscription>('/billing/subscription').catch(() => null as unknown as CurrentSubscription),
    staleTime: 120_000,
  })
  return withDemoFallback(result, DEMO_CURRENT_SUBSCRIPTION,
    d => d != null && typeof (d as unknown as Record<string, unknown>)?.planId === 'string')
}

export function usePaymentHistory(page = 1) {
  const empty: ListResponse<PaymentRecord> = { data: [], total: 0, page, limit: 20 }
  const result = useQuery({
    queryKey: ['billing-invoices', page],
    queryFn: () => api<ListResponse<PaymentRecord>>(`/billing/invoices?page=${page}&limit=20`).catch(() => empty),
    staleTime: 120_000,
  })
  return withDemoFallback(
    result,
    { data: DEMO_PAYMENT_HISTORY, total: DEMO_PAYMENT_HISTORY.length, page, limit: 20 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useBillingStats() {
  const result = useQuery({
    queryKey: ['billing-stats'],
    queryFn: () => api<BillingStats>('/billing/stats').catch(() => null as unknown as BillingStats),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_BILLING_STATS,
    d => d != null && typeof (d as unknown as Record<string, unknown>)?.currentPlan === 'string')
}

export function useApplyCoupon() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => api<{ discountPercent: number; message: string }>('/billing/coupons/apply', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-subscription'] })
      qc.invalidateQueries({ queryKey: ['billing-stats'] })
    },
  })
}

export function useUpgradePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ planId, billingCycle }: { planId: string; billingCycle: 'monthly' | 'annual' }) =>
      api<{ message: string; checkoutUrl?: string }>('/billing/subscriptions/upgrade', {
        method: 'POST',
        body: JSON.stringify({ planId, billingCycle }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing-subscription'] })
      qc.invalidateQueries({ queryKey: ['billing-stats'] })
    },
  })
}

export function useCancelSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ message: string }>('/billing/subscriptions/cancel', { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['billing-subscription'] }) },
  })
}

// ─── Admin Ops Hooks ─────────────────────────────────────────────

export function useSystemHealth() {
  const result = useQuery({
    queryKey: ['admin-system-health'],
    queryFn: () => api<{ services: ServiceHealth[]; summary: SystemHealthSummary }>('/admin/system/health').catch(() => null as any),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  return withDemoFallback(
    result,
    { services: DEMO_SERVICE_HEALTH, summary: DEMO_SYSTEM_HEALTH_SUMMARY },
    d => d != null && Array.isArray((d as unknown as Record<string, unknown>)?.services),
  )
}

export function useMaintenanceWindows() {
  const empty: ListResponse<MaintenanceWindow> = { data: [], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['admin-maintenance'],
    queryFn: () => api<ListResponse<MaintenanceWindow>>('/admin/maintenance').catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(
    result,
    { data: DEMO_MAINTENANCE_WINDOWS, total: DEMO_MAINTENANCE_WINDOWS.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useCreateMaintenanceWindow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { title: string; description: string; startsAt: string; endsAt: string; affectedServices: string[] }) =>
      api<MaintenanceWindow>('/admin/maintenance', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-maintenance'] }) },
  })
}

export function useActivateMaintenance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<MaintenanceWindow>(`/admin/maintenance/${id}/activate`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-maintenance'] }) },
  })
}

export function useDeactivateMaintenance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<MaintenanceWindow>(`/admin/maintenance/${id}/deactivate`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-maintenance'] }) },
  })
}

export function useAdminTenants() {
  const empty: ListResponse<TenantRecord> = { data: [], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: () => api<ListResponse<TenantRecord>>('/admin/tenants').catch(() => empty),
    staleTime: 60_000,
  })
  return withDemoFallback(
    result,
    { data: DEMO_TENANTS, total: DEMO_TENANTS.length, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useSuspendTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api<TenantRecord>(`/admin/tenants/${id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tenants'] }) },
  })
}

export function useReinstateTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<TenantRecord>(`/admin/tenants/${id}/reinstate`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tenants'] }) },
  })
}

export function useChangeTenantPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: string }) =>
      api<TenantRecord>(`/admin/tenants/${id}/plan`, { method: 'PUT', body: JSON.stringify({ plan }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tenants'] }) },
  })
}

export function useAdminAuditLog(page = 1) {
  const empty: ListResponse<AdminAuditEntry> = { data: [], total: 0, page, limit: 50 }
  const result = useQuery({
    queryKey: ['admin-audit', page],
    queryFn: () => api<ListResponse<AdminAuditEntry>>(`/admin/audit?page=${page}&limit=50`).catch(() => empty),
    staleTime: 30_000,
  })
  return withDemoFallback(
    result,
    { data: DEMO_ADMIN_AUDIT, total: DEMO_ADMIN_AUDIT.length, page, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

export function useAdminStats() {
  const result = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api<AdminStats>('/admin/stats').catch(() => null as unknown as AdminStats),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_ADMIN_STATS,
    d => d != null && typeof (d as unknown as Record<string, unknown>)?.totalTenants === 'number')
}

// ─── DLQ types ────────────────────────────────────────────────────

/** Single queue's dead-letter count. */
export interface DlqQueueEntry {
  name: string
  failed: number
}

/** Response shape from GET /api/v1/admin/dlq */
interface DlqStatusResponse {
  queues: DlqQueueEntry[]
  totalFailed: number
  updatedAt: string
  redisUnavailable?: boolean
}

/** Demo DLQ data — a few queues with non-zero failed counts. */
const DEMO_DLQ_STATUS: DlqStatusResponse = {
  updatedAt: new Date().toISOString(),
  totalFailed: 3,
  queues: [
    'etip-feed-fetch', 'etip-feed-parse', 'etip-normalize', 'etip-deduplicate',
    'etip-enrich-realtime', 'etip-enrich-batch', 'etip-graph-sync', 'etip-correlate',
    'etip-alert-evaluate', 'etip-integration-push', 'etip-archive',
    'etip-report-generate', 'etip-ioc-indexed', 'etip-cache-invalidate',
  ].map((name, i) => ({ name, failed: i === 4 ? 2 : i === 6 ? 1 : 0 })),
}

/** Poll DLQ failed counts every 15 s. */
export function useDlqStatus() {
  const result = useQuery({
    queryKey: ['admin-dlq-status'],
    queryFn: () => api<DlqStatusResponse>('/admin/dlq').catch(() => null as unknown as DlqStatusResponse),
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
  return withDemoFallback(
    result,
    DEMO_DLQ_STATUS,
    d => d != null && Array.isArray((d as unknown as Record<string, unknown>)?.queues),
  )
}

/** Retry all failed jobs for a single queue. */
export function useRetryDlqQueue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (queue: string) =>
      api<{ retried: number; message: string }>(`/admin/dlq/${queue}/retry`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-dlq-status'] })
      qc.invalidateQueries({ queryKey: ['admin-queue-health'] })
    },
  })
}

/** Discard all failed jobs for a single queue. */
export function useDiscardDlqQueue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (queue: string) =>
      api<{ discarded: number; message: string }>(`/admin/dlq/${queue}/discard`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-dlq-status'] }) },
  })
}

/** Retry all queues that have >0 failed jobs. */
export function useRetryAllDlq() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<{ totalRetried: number; message: string }>('/admin/dlq/retry-all', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-dlq-status'] })
      qc.invalidateQueries({ queryKey: ['admin-queue-health'] })
    },
  })
}

/** Poll live BullMQ queue depths every 10 s. Falls back to demo data when admin-service is unreachable. */
export function useQueueHealth() {
  const result = useQuery({
    queryKey: ['admin-queue-health'],
    queryFn: () => api<QueueHealthResponse>('/admin/queues').catch(() => null as unknown as QueueHealthResponse),
    staleTime: 5_000,
    refetchInterval: 10_000,
  })
  return withDemoFallback(
    result,
    DEMO_QUEUE_HEALTH,
    d => d != null && Array.isArray((d as unknown as Record<string, unknown>)?.queues),
  )
}

/** Poll active queue alerts every 30 s. */
export function useQueueAlerts() {
  return useQuery<QueueAlertsResponse>({
    queryKey: ['admin-queue-alerts'],
    queryFn: () => api<QueueAlertsResponse>('/admin/queues/alerts').catch(() => ({ alerts: [] })),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

// ─── Onboarding Hooks ─────────────────────────────────────────────

export function useOnboardingWizard() {
  const result = useQuery({
    queryKey: ['onboarding-wizard'],
    queryFn: () => api<OnboardingWizard>('/onboarding/wizard/').catch(() => null as unknown as OnboardingWizard),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_ONBOARDING_WIZARD,
    d => d != null && typeof d?.completionPercent === 'number')
}

export function useWelcomeDashboard() {
  const result = useQuery({
    queryKey: ['onboarding-welcome'],
    queryFn: () => api<WelcomeDashboard>('/onboarding/welcome/').catch(() => null as unknown as WelcomeDashboard),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_WELCOME_DASHBOARD,
    d => d != null && typeof d?.completionPercent === 'number')
}

export function usePipelineHealth() {
  const result = useQuery({
    queryKey: ['onboarding-pipeline-health'],
    queryFn: () => api<PipelineHealth>('/onboarding/pipeline/health').catch(() => null as unknown as PipelineHealth),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  return withDemoFallback(result, DEMO_PIPELINE_HEALTH,
    d => d != null && typeof d?.overall === 'string')
}

export function useModuleReadiness() {
  const result = useQuery({
    queryKey: ['onboarding-modules'],
    queryFn: () => api<ModuleStatus[]>('/onboarding/modules/').catch(() => [] as ModuleStatus[]),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_MODULE_STATUS,
    d => Array.isArray(d) && d.length > 0 && d[0]?.module != null)
}

export function useReadinessCheck() {
  const result = useQuery({
    queryKey: ['onboarding-readiness'],
    queryFn: () => api<ReadinessResult>('/onboarding/pipeline/readiness').catch(() => null as unknown as ReadinessResult),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_READINESS_RESULT,
    d => d != null && typeof d?.score === 'number')
}

export function useCompleteStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { step: string; data?: Record<string, unknown> }) =>
      api<{ success: boolean }>('/onboarding/wizard/complete-step', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding-wizard'] })
      qc.invalidateQueries({ queryKey: ['onboarding-welcome'] })
    },
  })
}

export function useSkipStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { step: string; reason?: string }) =>
      api<{ success: boolean }>('/onboarding/wizard/skip-step', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding-wizard'] })
    },
  })
}

export function useSeedDemo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { categories?: string[] }) =>
      api<{ seeded: boolean; counts: Record<string, number> }>('/onboarding/welcome/seed-demo', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding-welcome'] })
      qc.invalidateQueries({ queryKey: ['onboarding-wizard'] })
    },
  })
}
