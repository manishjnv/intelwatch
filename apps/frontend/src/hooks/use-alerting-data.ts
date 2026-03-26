/**
 * @module hooks/use-alerting-data
 * @description TanStack Query hooks for Alerting Service (port 3023).
 * All queries go through nginx → /api/v1/alerts/*.
 * Demo fallback when backend is unreachable.
 */
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { api } from '@/lib/api'
import {
  DEMO_RULES, DEMO_ALERTS, DEMO_CHANNELS, DEMO_ESCALATIONS,
  DEMO_STATS, DEMO_TEMPLATES, DEMO_HISTORY,
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

// ─── Alert Queries ──────────────────────────────────────────────

/** Fetch paginated alerts with optional severity/status filters. */
export function useAlerts(page = 1, severity?: AlertSeverity, status?: AlertStatus) {
  const params = new URLSearchParams({ page: String(page), limit: '50' })
  if (severity) params.set('severity', severity)
  if (status) params.set('status', status)

  const empty: ListResponse<Alert> = { data: [], total: 0, page, limit: 50 }
  const result = useQuery({
    queryKey: ['alerts', page, severity, status],
    queryFn: () => api<Alert[] | ListResponse<Alert>>(`/alerts?${params}`)
      .then(raw => Array.isArray(raw) ? { data: raw, total: raw.length, page, limit: 50 } : raw)
      .catch(() => empty),
    staleTime: 15_000,
  })
  return withDemoFallback(
    result,
    { data: DEMO_ALERTS, total: DEMO_ALERTS.length, page, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

/** Fetch alert stats. */
export function useAlertStats() {
  const result = useQuery({
    queryKey: ['alert-stats'],
    queryFn: () => api<AlertStats>('/alerts/stats').catch(() => null as unknown as AlertStats),
    staleTime: 30_000,
  })
  return withDemoFallback(result, DEMO_STATS,
    d => typeof (d as unknown as Record<string, unknown>)?.total === 'number' && typeof (d as unknown as Record<string, unknown>)?.bySeverity === 'object')
}

/** Fetch alert history timeline. */
export function useAlertHistory(alertId?: string) {
  const result = useQuery({
    queryKey: ['alert-history', alertId],
    queryFn: () => api<AlertHistoryEntry[]>(`/alerts/${alertId}/history`).catch(() => [] as AlertHistoryEntry[]),
    enabled: !!alertId,
    staleTime: 30_000,
  })
  return withDemoFallback(result, DEMO_HISTORY,
    d => Array.isArray(d) && d.length > 0 && typeof d[0]?.action === 'string')
}

/** Search alerts by keyword. */
export function useAlertSearch(query: string) {
  const empty: ListResponse<Alert> = { data: [], total: 0, page: 1, limit: 50 }
  const result = useQuery({
    queryKey: ['alert-search', query],
    queryFn: () => api<Alert[] | ListResponse<Alert>>(`/alerts/search?q=${encodeURIComponent(query)}`)
      .then(raw => Array.isArray(raw) ? { data: raw, total: raw.length, page: 1, limit: 50 } : raw)
      .catch(() => empty),
    enabled: query.length >= 2,
    staleTime: 15_000,
  })
  return withDemoFallback(
    result,
    { data: DEMO_ALERTS.filter(a => a.title.toLowerCase().includes(query.toLowerCase())), total: 0, page: 1, limit: 50 },
    d => (d?.data?.length ?? 0) > 0,
  )
}

// ─── Rule Queries ───────────────────────────────────────────────

/** Fetch alert rules. */
export function useAlertRules() {
  const result = useQuery({
    queryKey: ['alert-rules'],
    queryFn: () => api<AlertRule[]>('/alerts/rules').catch(() => [] as AlertRule[]),
    staleTime: 30_000,
  })
  return withDemoFallback(result, DEMO_RULES,
    d => Array.isArray(d) && d.length > 0 && typeof d[0]?.condition === 'object')
}

/** Fetch rule templates. */
export function useAlertTemplates() {
  const result = useQuery({
    queryKey: ['alert-templates'],
    queryFn: () => api<AlertTemplate[]>('/alerts/templates').catch(() => [] as AlertTemplate[]),
    staleTime: 300_000,
  })
  return withDemoFallback(result, DEMO_TEMPLATES,
    d => Array.isArray(d) && d.length > 0 && typeof d[0]?.conditionType === 'string')
}

// ─── Channel Queries ────────────────────────────────────────────

/** Fetch notification channels. */
export function useNotificationChannels() {
  const result = useQuery({
    queryKey: ['notification-channels'],
    queryFn: () => api<NotificationChannel[]>('/alerts/channels').catch(() => [] as NotificationChannel[]),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_CHANNELS,
    d => Array.isArray(d) && d.length > 0 && typeof d[0]?.type === 'string')
}

// ─── Escalation Queries ─────────────────────────────────────────

/** Fetch escalation policies. */
export function useEscalationPolicies() {
  const result = useQuery({
    queryKey: ['escalation-policies'],
    queryFn: () => api<EscalationPolicy[]>('/alerts/escalations').catch(() => [] as EscalationPolicy[]),
    staleTime: 60_000,
  })
  return withDemoFallback(result, DEMO_ESCALATIONS,
    d => Array.isArray(d) && d.length > 0 && Array.isArray(d[0]?.steps))
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
