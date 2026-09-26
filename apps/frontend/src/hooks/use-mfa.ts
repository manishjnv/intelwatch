/**
 * @module hooks/use-mfa
 * @description React Query hooks for MFA setup, verification, disable, challenge, and enforcement.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useNavigate } from 'react-router-dom'
import type {
  MfaSetupResponse, MfaVerifySetupInput, MfaDisableInput,
  MfaChallengeInput, MfaChallengeResponse, BackupCodesResponse,
  MfaEnforcement,
} from '@/types/auth-security'

// Gateway registers mfaRoutes under /api/v1/auth (apps/api-gateway/src/app.ts) —
// api() already prepends /api/v1, so the path needs the /auth segment.
function mfaEnforcementPath(scope: 'tenant' | 'platform'): string {
  return scope === 'platform' ? '/auth/admin/mfa/enforcement' : '/auth/settings/mfa/enforcement'
}

// ─── MFA Setup (generate secret + QR) ─────────────────────────

export function useMfaSetup() {
  return useMutation<MfaSetupResponse, ApiError>({
    // No demo fallback: a fake secret/QR can never verify (roadmap STEP_00B U12).
    // MfaSetupWizard shows its error state instead.
    mutationFn: () => api<MfaSetupResponse>('/auth/mfa/setup', { method: 'POST' }),
  })
}

// ─── MFA Verify Setup (confirm TOTP code) ─────────────────────

export function useMfaVerifySetup() {
  const qc = useQueryClient()
  return useMutation<void, ApiError, MfaVerifySetupInput>({
    mutationFn: (input) =>
      api<void>('/auth/mfa/verify-setup', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-profile'] })
    },
  })
}

// ─── MFA Disable ──────────────────────────────────────────────

export function useMfaDisable() {
  const qc = useQueryClient()
  return useMutation<void, ApiError, MfaDisableInput>({
    mutationFn: (input) =>
      api<void>('/auth/mfa/disable', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-profile'] })
    },
  })
}

// ─── MFA Challenge (login flow) ───────────────────────────────

export function useMfaChallenge() {
  const setAuth = useAuthStore((s) => s.setAuth)
  const setMfaToken = useAuthStore((s) => s.setMfaToken)
  const navigate = useNavigate()

  return useMutation<MfaChallengeResponse, ApiError, MfaChallengeInput>({
    mutationFn: (input) =>
      api<MfaChallengeResponse>('/auth/mfa/challenge', {
        method: 'POST',
        body: input,
        auth: false,
      }),
    onSuccess: (data) => {
      setMfaToken(null)
      setAuth(data)
      navigate('/dashboard')
    },
  })
}

// ─── Regenerate Backup Codes ──────────────────────────────────

export function useRegenerateBackupCodes() {
  return useMutation<BackupCodesResponse, ApiError, MfaDisableInput>({
    mutationFn: (input) =>
      api<BackupCodesResponse>('/auth/mfa/backup-codes/regenerate', {
        method: 'POST',
        body: input,
      }),
  })
}

// ─── MFA Enforcement (query + update) ─────────────────────────

export function useMfaEnforcement(scope: 'tenant' | 'platform') {
  const path = mfaEnforcementPath(scope)
  return useQuery<MfaEnforcement, ApiError>({
    queryKey: ['mfa-enforcement', scope],
    queryFn: () => api<MfaEnforcement>(path),
    meta: { resource: 'MFA enforcement' },
    staleTime: 5 * 60_000,
  })
}

export function useUpdateMfaEnforcement(scope: 'tenant' | 'platform') {
  const path = mfaEnforcementPath(scope)
  const qc = useQueryClient()
  return useMutation<void, ApiError, Partial<MfaEnforcement>>({
    mutationFn: (input) =>
      api<void>(path, { method: 'PUT', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mfa-enforcement', scope] })
    },
  })
}
