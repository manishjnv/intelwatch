/**
 * @module hooks/use-phase6-data
 * @description TanStack Query hooks for Phase 6 services:
 * Billing (:3019) and Admin Ops (:3022).
 * All queries go through nginx → backend services.
 * S161a: Billing/Admin/Ops hooks are honest — no demo-data fallback on failure
 * or empty response (same pattern as hooks/use-sessions.ts).
 * Onboarding hooks still use the demo fallback (converted in a later session).
 */
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { apiList } from '@/lib/api-list'
import {
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

// ─── Generic helpers ────────────────────────────────────────────

interface ListResponse<T> {
  data: T[]; total: number; page: number; limit: number
}

/** Onboarding hooks only (not yet converted to honest UI — see S161b). */
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
  return useQuery<BillingPlan[]>({
    queryKey: ['billing-plans'],
    queryFn: () => api<BillingPlan[]>('/billing/plans').then(d => {
      if (Array.isArray(d) && d.length > 0 && typeof d[0]?.price !== 'number') {
        throw new Error('Unexpected response from /billing/plans')
      }
      return d
    }),
    meta: { resource: 'billing plans' },
    staleTime: 300_000,
  })
}

export function useUsageMeters() {
  return useQuery<UsageMeters>({
    queryKey: ['billing-usage'],
    queryFn: () => api<UsageMeters>('/billing/usage').then(d => {
      if (d == null || typeof (d as unknown as Record<string, unknown>)?.apiCalls !== 'object') {
        throw new Error('Unexpected response from /billing/usage')
      }
      return d
    }),
    meta: { resource: 'usage meters' },
    staleTime: 60_000,
  })
}

export function useCurrentSubscription() {
  return useQuery<CurrentSubscription>({
    queryKey: ['billing-subscription'],
    queryFn: () => api<CurrentSubscription>('/billing/subscription').then(d => {
      // null = no subscription (free tier); callers read it with ?. — unlike the other guards, not an error
      if (d != null &&typeof (d as unknown as Record<string, unknown>)?.planId !== 'string') {
        throw new Error('Unexpected response from /billing/subscription')
      }
      return d
    }),
    meta: { resource: 'subscription' },
    staleTime: 120_000,
  })
}

export function usePaymentHistory(page = 1) {
  return useQuery<ListResponse<PaymentRecord>>({
    queryKey: ['billing-invoices', page],
    queryFn: () => apiList<PaymentRecord>(`/billing/invoices?page=${page}&limit=20`),
    meta: { resource: 'payment history' },
    staleTime: 120_000,
  })
}

export function useBillingStats() {
  return useQuery<BillingStats>({
    queryKey: ['billing-stats'],
    queryFn: () => api<BillingStats>('/billing/stats').then(d => {
      if (d == null || typeof (d as unknown as Record<string, unknown>)?.currentPlan !== 'string') {
        throw new Error('Unexpected response from /billing/stats')
      }
      return d
    }),
    meta: { resource: 'billing stats' },
    staleTime: 60_000,
  })
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
  return useQuery<{ services: ServiceHealth[]; summary: SystemHealthSummary }>({
    queryKey: ['admin-system-health'],
    queryFn: () => api<{ services: ServiceHealth[]; summary: SystemHealthSummary }>('/admin/system/health').then(d => {
      if (d == null || !Array.isArray((d as unknown as Record<string, unknown>)?.services)) {
        throw new Error('Unexpected response from /admin/system/health')
      }
      return d
    }),
    meta: { resource: 'system health' },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function useMaintenanceWindows() {
  return useQuery<ListResponse<MaintenanceWindow>>({
    queryKey: ['admin-maintenance'],
    queryFn: () => apiList<MaintenanceWindow>('/admin/maintenance'),
    meta: { resource: 'maintenance windows' },
    staleTime: 60_000,
  })
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
  return useQuery<ListResponse<TenantRecord>>({
    queryKey: ['admin-tenants'],
    queryFn: () => apiList<TenantRecord>('/admin/tenants'),
    meta: { resource: 'tenants' },
    staleTime: 60_000,
  })
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
  return useQuery<ListResponse<AdminAuditEntry>>({
    queryKey: ['admin-audit', page],
    queryFn: () => apiList<AdminAuditEntry>(`/admin/audit?page=${page}&limit=50`),
    meta: { resource: 'audit log' },
    staleTime: 30_000,
  })
}

export function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: () => api<AdminStats>('/admin/stats').then(d => {
      if (d == null || typeof (d as unknown as Record<string, unknown>)?.totalTenants !== 'number') {
        throw new Error('Unexpected response from /admin/stats')
      }
      return d
    }),
    meta: { resource: 'admin stats' },
    staleTime: 60_000,
  })
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

/** Poll DLQ failed counts every 15 s. */
export function useDlqStatus() {
  return useQuery<DlqStatusResponse>({
    queryKey: ['admin-dlq-status'],
    queryFn: () => api<DlqStatusResponse>('/admin/dlq').then(d => {
      if (d == null || !Array.isArray((d as unknown as Record<string, unknown>)?.queues)) {
        throw new Error('Unexpected response from /admin/dlq')
      }
      return d
    }),
    meta: { resource: 'dead-letter queue status' },
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
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

/** Poll live BullMQ queue depths every 10 s. */
export function useQueueHealth() {
  return useQuery<QueueHealthResponse>({
    queryKey: ['admin-queue-health'],
    queryFn: () => api<QueueHealthResponse>('/admin/queues').then(d => {
      if (d == null || !Array.isArray((d as unknown as Record<string, unknown>)?.queues)) {
        throw new Error('Unexpected response from /admin/queues')
      }
      return d
    }),
    meta: { resource: 'queue health' },
    staleTime: 5_000,
    refetchInterval: 10_000,
  })
}

/** Poll active queue alerts every 30 s. */
export function useQueueAlerts() {
  return useQuery<QueueAlertsResponse>({
    queryKey: ['admin-queue-alerts'],
    queryFn: () => api<QueueAlertsResponse>('/admin/queues/alerts'),
    meta: { resource: 'queue alerts' },
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

// ─── Onboarding Hooks (still demo-fallback — S161b) ────────────────

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
