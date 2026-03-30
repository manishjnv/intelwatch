/**
 * @module hooks/use-email-verification
 * @description React Query hooks for email verification and resend.
 */
import { useMutation } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { VerifyEmailInput, ResendVerificationInput } from '@/types/auth-security'

// ─── Verify Email Token ───────────────────────────────────────

export function useVerifyEmail() {
  return useMutation<void, ApiError, VerifyEmailInput>({
    mutationFn: (input) =>
      api<void>('/auth/verify-email', { method: 'POST', body: input, auth: false }),
  })
}

// ─── Resend Verification Email ────────────────────────────────

export function useResendVerification() {
  return useMutation<void, ApiError, ResendVerificationInput>({
    mutationFn: (input) =>
      api<void>('/auth/resend-verification', { method: 'POST', body: input, auth: false }),
  })
}
