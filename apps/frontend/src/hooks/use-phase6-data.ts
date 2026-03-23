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
  type BillingPlan, type UsageMeters, type CurrentSubscription,
  type PaymentRecord, type BillingStats,
  type ServiceHealth, type SystemHealthSummary,
  type MaintenanceWindow, type TenantRecord, type AdminAuditEntry, type AdminStats,
} from './phase6-demo-data'

// Re-export types for page consumption
export type {
  BillingPlan, UsageMeters, CurrentSubscription,
  PaymentRecord, BillingStats,
  ServiceHealth, SystemHealthSummary,
  MaintenanceWindow, TenantRecord, AdminAuditEntry, AdminStats,
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
  return withDemoFallback(result, DEMO_BILLING_PLANS, d => (d?.length ?? 0) > 0)
}

export function useUsageMeters() {
  const result = useQuery({
    queryKey: ['billing-usage'],
    queryFn: () => api<UsageMeters>('/billing/usage').catch(() => null as unknown as UsageMeters),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_USAGE_METERS, d => d != null)
}

export function useCurrentSubscription() {
  const result = useQuery({
    queryKey: ['billing-subscription'],
    queryFn: () => api<CurrentSubscription>('/billing/subscription').catch(() => null as unknown as CurrentSubscription),
    staleTime: 120_000,
  })
  return withDemoFallback(result, DEMO_CURRENT_SUBSCRIPTION, d => d != null)
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
  return withDemoFallback(result, DEMO_BILLING_STATS, d => d != null)
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
    d => d != null,
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
  return withDemoFallback(result, DEMO_ADMIN_STATS, d => d != null)
}
