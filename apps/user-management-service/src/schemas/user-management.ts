import { z } from 'zod';

// ─── Permission & RBAC Schemas ──────────────────────────────────

/** All permission resources in the platform. */
export const PERMISSION_RESOURCES = [
  'ioc', 'threat_actor', 'malware', 'vuln', 'feed',
  'hunting', 'graph', 'alert', 'dashboard', 'report',
  'integration', 'drp', 'correlation', 'user', 'settings',
] as const;

/** All permission actions. */
export const PERMISSION_ACTIONS = ['read', 'create', 'update', 'delete'] as const;

/** Built-in role names. */
export const BUILT_IN_ROLES = ['super_admin', 'admin', 'analyst', 'hunter'] as const;

export const PermissionStringSchema = z.string().regex(
  /^(\*|[a-z_]+:\*|[a-z_]+:(read|create|update|delete))$/,
  'Permission must be resource:action, resource:*, or *',
);

export const CreateRoleSchema = z.object({
  name: z.string().min(2).max(64).regex(/^[a-z][a-z0-9_]*$/, 'Role name must be lowercase alphanumeric with underscores'),
  description: z.string().max(256).optional(),
  permissions: z.array(PermissionStringSchema).min(1).max(100),
  inheritsFrom: z.string().optional(),
});

export const UpdateRoleSchema = CreateRoleSchema.partial().refine(
  (d) => d.name || d.description !== undefined || d.permissions || d.inheritsFrom !== undefined,
  'At least one field must be provided',
);

export const CheckPermissionSchema = z.object({
  role: z.string().min(1),
  permission: PermissionStringSchema,
});

// ─── Team Management Schemas ────────────────────────────────────

export const InviteUserSchema = z.object({
  email: z.string().email().max(256),
  role: z.string().min(1).max(64),
  name: z.string().min(1).max(128).optional(),
});

export const UpdateUserRoleSchema = z.object({
  role: z.string().min(1).max(64),
});

export const TeamListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  status: z.enum(['active', 'inactive', 'pending', 'all']).default('all'),
  role: z.string().optional(),
  search: z.string().max(128).optional(),
});

// ─── SSO Configuration Schemas ──────────────────────────────────

export const SamlConfigSchema = z.object({
  enabled: z.boolean().default(false),
  entityId: z.string().min(1).max(512),
  ssoUrl: z.string().url().max(1024),
  certificate: z.string().min(1).max(8192),
  signatureAlgorithm: z.enum(['sha256', 'sha512']).default('sha256'),
  nameIdFormat: z.enum(['email', 'persistent', 'transient']).default('email'),
  allowedDomains: z.array(z.string().min(1).max(256)).min(1).max(20),
  jitProvisioning: z.boolean().default(true),
  defaultRole: z.string().default('analyst'),
});

export const OidcConfigSchema = z.object({
  enabled: z.boolean().default(false),
  issuerUrl: z.string().url().max(1024),
  clientId: z.string().min(1).max(256),
  clientSecret: z.string().min(1).max(512),
  scopes: z.array(z.string()).default(['openid', 'profile', 'email']),
  allowedDomains: z.array(z.string().min(1).max(256)).min(1).max(20),
  jitProvisioning: z.boolean().default(true),
  defaultRole: z.string().default('analyst'),
});

// ─── MFA Schemas ────────────────────────────────────────────────

export const MfaSetupResponseSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
  qrDataUrl: z.string(),
});

export const MfaVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'TOTP code must be 6 digits'),
});

export const MfaBackupCodeVerifySchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{8}$/, 'Backup code must be 8 alphanumeric characters'),
});

export const MfaPolicySchema = z.object({
  enforcement: z.enum(['required', 'optional', 'disabled']).default('optional'),
  gracePeriodDays: z.coerce.number().int().min(0).max(30).default(7),
});

// ─── Break-Glass Schemas ────────────────────────────────────────

export const BreakGlassSetupSchema = z.object({
  reason: z.string().min(10).max(512),
});

export const BreakGlassLoginSchema = z.object({
  code: z.string().min(1).max(64),
  reason: z.string().min(10).max(512),
});

// ─── Session Schemas ────────────────────────────────────────────

export const SessionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Password Policy Schema ────────────────────────────────────

export const PasswordPolicySchema = z.object({
  minLength: z.coerce.number().int().min(8).max(128).default(12),
  requireUppercase: z.boolean().default(true),
  requireLowercase: z.boolean().default(true),
  requireNumbers: z.boolean().default(true),
  requireSpecialChars: z.boolean().default(true),
  maxAgeDays: z.coerce.number().int().min(0).max(365).default(90),
  preventReuse: z.coerce.number().int().min(0).max(24).default(5),
});

export const ValidatePasswordSchema = z.object({
  password: z.string().min(1).max(256),
});

// ─── Audit Schemas ──────────────────────────────────────────────

export const AuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  action: z.string().optional(),
  userId: z.string().optional(),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

// ─── Shared Types ───────────────────────────────────────────────

export type Permission = z.infer<typeof PermissionStringSchema>;
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
export type InviteUserInput = z.infer<typeof InviteUserSchema>;
export type SamlConfig = z.infer<typeof SamlConfigSchema>;
export type OidcConfig = z.infer<typeof OidcConfigSchema>;
export type MfaPolicy = z.infer<typeof MfaPolicySchema>;
export type PasswordPolicy = z.infer<typeof PasswordPolicySchema>;

/** Standard user record in the team store. */
export interface TeamMember {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: string;
  status: 'active' | 'inactive' | 'pending';
  invitedBy: string | null;
  invitedAt: string;
  acceptedAt: string | null;
  lastActiveAt: string | null;
  mfaEnabled: boolean;
  ssoLinked: boolean;
}

/** Audit log entry. */
export interface AuditEntry {
  id: string;
  tenantId: string;
  userId: string | null;
  action: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  timestamp: string;
}

/** Active session record. */
export interface SessionRecord {
  id: string;
  userId: string;
  tenantId: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isBreakGlass: boolean;
}
