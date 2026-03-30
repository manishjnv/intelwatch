/**
 * @module @etip/shared-types/break-glass
 * @description Zod schemas and types for Break-Glass Emergency Account (I-22).
 * SOC 2 CC6.1, NIST 800-53 AC-2(2) compliance.
 */
import { z } from 'zod';

// ── Login schemas ───────────────────────────────────────────────────

export const BreakGlassLoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  otp: z.string().min(6).max(8),
});
export type BreakGlassLoginBody = z.infer<typeof BreakGlassLoginBodySchema>;

export const BreakGlassLoginResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
  renewable: z.literal(false),
  warning: z.string(),
});
export type BreakGlassLoginResponse = z.infer<typeof BreakGlassLoginResponseSchema>;

// ── Management schemas ──────────────────────────────────────────────

export const BreakGlassStatusResponseSchema = z.object({
  configured: z.boolean(),
  lastUsed: z.string().nullable(),
  useCount: z.number(),
  activeSession: z.object({
    sessionId: z.string(),
    expiresAt: z.string(),
    ipAddress: z.string().nullable(),
    geoCountry: z.string().nullable(),
    geoCity: z.string().nullable(),
  }).nullable(),
});
export type BreakGlassStatusResponse = z.infer<typeof BreakGlassStatusResponseSchema>;

export const BreakGlassRotatePasswordBodySchema = z.object({
  newPassword: z.string().min(20, 'Break-glass password must be at least 20 characters'),
});
export type BreakGlassRotatePasswordBody = z.infer<typeof BreakGlassRotatePasswordBodySchema>;

// ── Alert payload ───────────────────────────────────────────────────

export const BreakGlassAlertPayloadSchema = z.object({
  type: z.enum(['break_glass_login', 'break_glass_failed_attempt', 'break_glass_locked_out']),
  severity: z.literal('critical'),
  breakGlassUserId: z.string().optional(),
  ipAddress: z.string(),
  geoCountry: z.string().nullable(),
  geoCity: z.string().nullable(),
  timestamp: z.string(),
  sessionExpiresAt: z.string().optional(),
  useCount: z.number().optional(),
});
export type BreakGlassAlertPayload = z.infer<typeof BreakGlassAlertPayloadSchema>;

// ── Audit event names ───────────────────────────────────────────────

export const BREAK_GLASS_AUDIT_EVENTS = {
  LOGIN_SUCCESS: 'break_glass.login.success',
  LOGIN_FAILED: 'break_glass.login.failed',
  LOGIN_LOCKED: 'break_glass.login.locked',
  SESSION_EXPIRED: 'break_glass.session_expired',
  SESSION_REPLACED: 'break_glass.session_replaced',
  PASSWORD_ROTATED: 'break_glass.password_rotated',
  SESSION_FORCE_TERMINATED: 'break_glass.session_force_terminated',
} as const;
