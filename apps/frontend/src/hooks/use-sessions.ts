/**
 * @module hooks/use-sessions
 * @description React Query hooks for active session management.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { SessionInfo } from '@/types/auth-security'
import { DEMO_SESSIONS } from './security-demo-data'

// ─── Active Sessions List ─────────────────────────────────────

export function useSessions() {
  return useQuery<SessionInfo[], ApiError>({
    queryKey: ['active-sessions'],
    queryFn: () =>
      api<SessionInfo[]>('/auth/sessions').catch(() => DEMO_SESSIONS),
    staleTime: 60_000,
  })
}

// ─── Terminate Single Session ─────────────────────────────────

export function useTerminateSession() {
  const qc = useQueryClient()
  return useMutation<void, ApiError, string>({
    mutationFn: (sessionId) =>
      api<void>(`/auth/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active-sessions'] })
    },
  })
}

// ─── Terminate All Other Sessions ─────────────────────────────

export function useTerminateAllOtherSessions() {
  const qc = useQueryClient()
  return useMutation<void, ApiError>({
    mutationFn: () =>
      api<void>('/auth/sessions?exclude=current', { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active-sessions'] })
    },
  })
}
