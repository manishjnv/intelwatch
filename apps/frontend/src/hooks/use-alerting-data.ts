/**
 * @module hooks/use-alerting-data
 * @description TanStack Query hooks for Alerting Service (port 3023).
 * All queries go through nginx → /api/v1/alerts/*.
 * Real data or honest empty/error states only — no demo fallback (DECISION-048).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { apiList } from '@/lib/api-list'
import {
  type AlertRule, type Alert, type NotificationChannel, type EscalationPolicy,
  type AlertStats, type AlertTemplate, type AlertHistoryEntry,
  type AlertSeverity, type AlertStatus, type ChannelType, type RuleConditionType,
} from './alerting-demo-data'

// Re-export types for page consumption
export type {
  AlertRule, Alert, NotificationChannel, EscalationPolicy,
  AlertStats, AlertTemplate, AlertHistoryEntry,
  AlertSeverity, AlertStatus, ChannelType, RuleConditionType,
}

// ─── Alert Queries ──────────────────────────────────────────────

/** Fetch paginated alerts with optional severity/status filters. */
export function useAlerts(page = 1, severity?: AlertSeverity, status?: AlertStatus) {
  const params = new URLSearchParams({ page: String(page), limit: '50' })
  if (severity) params.set('severity', severity)
  if (status) params.set('status', status)

  return useQuery({
    queryKey: ['alerts', page, severity, status],
    queryFn: () => apiList<Alert>(`/alerts?${params}`),
    meta: { resource: 'alerts' },
    staleTime: 15_000,
  })
}

/** Fetch alert stats. */
export function useAlertStats() {
  return useQuery({
    queryKey: ['alert-stats'],
    queryFn: () => api<AlertStats>('/alerts/stats'),
    meta: { resource: 'alert stats' },
    staleTime: 30_000,
  })
}

/** Fetch alert history timeline. */
export function useAlertHistory(alertId?: string) {
  return useQuery({
    queryKey: ['alert-history', alertId],
    queryFn: () => api<AlertHistoryEntry[]>(`/alerts/${alertId}/history`),
    meta: { resource: 'alert history' },
    enabled: !!alertId,
    staleTime: 30_000,
  })
}

/** Search alerts by keyword. */
export function useAlertSearch(query: string) {
  return useQuery({
    queryKey: ['alert-search', query],
    queryFn: () => apiList<Alert>(`/alerts/search?q=${encodeURIComponent(query)}`),
    meta: { resource: 'alert search' },
    enabled: query.length >= 2,
    staleTime: 15_000,
  })
}

// ─── Rule Queries ───────────────────────────────────────────────

/** Fetch alert rules. */
export function useAlertRules() {
  return useQuery({
    queryKey: ['alert-rules'],
    queryFn: () => apiList<AlertRule>('/alerts/rules'),
    meta: { resource: 'alert rules' },
    staleTime: 30_000,
  })
}

/** Fetch rule templates. */
export function useAlertTemplates() {
  return useQuery({
    queryKey: ['alert-templates'],
    queryFn: () => api<AlertTemplate[]>('/alerts/templates'),
    meta: { resource: 'alert templates' },
    staleTime: 300_000,
  })
}

// ─── Channel Queries ────────────────────────────────────────────

/** Fetch notification channels. */
export function useNotificationChannels() {
  return useQuery({
    queryKey: ['notification-channels'],
    queryFn: () => apiList<NotificationChannel>('/alerts/channels'),
    meta: { resource: 'notification channels' },
    staleTime: 60_000,
  })
}

// ─── Escalation Queries ─────────────────────────────────────────

/** Fetch escalation policies. */
export function useEscalationPolicies() {
  return useQuery({
    queryKey: ['escalation-policies'],
    queryFn: () => apiList<EscalationPolicy>('/alerts/escalations'),
    meta: { resource: 'escalation policies' },
    staleTime: 60_000,
  })
}

// ─── Alert Mutations ────────────────────────────────────────────

/** Acknowledge an alert. */
export function useAcknowledgeAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<Alert>(`/alerts/${id}/acknowledge`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['alert-stats'] })
    },
  })
}

/** Resolve an alert. */
export function useResolveAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<Alert>(`/alerts/${id}/resolve`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['alert-stats'] })
    },
  })
}

/** Suppress an alert. */
export function useSuppressAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, durationMinutes, reason }: { id: string; durationMinutes: number; reason: string }) =>
      api<Alert>(`/alerts/${id}/suppress`, { method: 'POST', body: { durationMinutes, reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['alert-stats'] })
    },
  })
}

/** Escalate an alert. */
export function useEscalateAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<Alert>(`/alerts/${id}/escalate`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['alert-stats'] })
    },
  })
}

/** Bulk acknowledge alerts. */
export function useBulkAcknowledge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<{ acknowledged: number }>('/alerts/bulk-acknowledge', { method: 'POST', body: { ids } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['alert-stats'] })
    },
  })
}

/** Bulk resolve alerts. */
export function useBulkResolve() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<{ resolved: number }>('/alerts/bulk-resolve', { method: 'POST', body: { ids } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: ['alert-stats'] })
    },
  })
}

// ─── Rule Mutations ─────────────────────────────────────────────

/** Create an alert rule. */
export function useCreateRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<AlertRule>) =>
      api<AlertRule>('/alerts/rules', { method: 'POST', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alert-rules'] }) },
  })
}

/** Toggle a rule's enabled status. */
export function useToggleRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<AlertRule>(`/alerts/rules/${id}/toggle`, { method: 'PUT' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alert-rules'] }) },
  })
}

/** Delete a rule. */
export function useDeleteRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/alerts/rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alert-rules'] }) },
  })
}

/** Apply a rule template (create rule from template). */
export function useApplyTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string) =>
      api<AlertRule>(`/alerts/templates/${templateId}/apply`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alert-rules'] }) },
  })
}

// ─── Channel Mutations ──────────────────────────────────────────

/** Create a notification channel. */
export function useCreateChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<NotificationChannel>) =>
      api<NotificationChannel>('/alerts/channels', { method: 'POST', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notification-channels'] }) },
  })
}

/** Delete a notification channel. */
export function useDeleteChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/alerts/channels/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notification-channels'] }) },
  })
}

/** Test a notification channel. */
export function useTestChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<{ success: boolean }>(`/alerts/channels/${id}/test`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notification-channels'] }) },
  })
}

// ─── Escalation Mutations ───────────────────────────────────────

/** Create an escalation policy. */
export function useCreateEscalation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<EscalationPolicy>) =>
      api<EscalationPolicy>('/alerts/escalations', { method: 'POST', body }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['escalation-policies'] }) },
  })
}

/** Delete an escalation policy. */
export function useDeleteEscalation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/alerts/escalations/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['escalation-policies'] }) },
  })
}
