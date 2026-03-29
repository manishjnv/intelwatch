/**
 * @module @etip/shared-types/user
 * @description Schemas for User, Tenant, Role, AuditLog, and FeatureFlag entities.
 * Multi-tenant RBAC model with immutable audit logging.
 */
import { z } from 'zod';

/** Platform-wide role definitions */
export const ROLES = [
  'super_admin',     // Platform operator (IntelWatch team)
  'tenant_admin',    // Customer org admin
  'analyst',         // Full TI access, can create/edit/delete
] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

/** Authentication provider types */
export const AUTH_PROVIDERS = ['email', 'google', 'saml', 'oidc'] as const;
export const AuthProviderSchema = z.enum(AUTH_PROVIDERS);
export type AuthProvider = z.infer<typeof AuthProviderSchema>;

/** Tenant (organization) schema */
export const TenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(63).regex(/^[a-z0-9-]+$/),
  plan: z.enum(['free', 'pro', 'enterprise']).default('free'),
  maxUsers: z.number().int().min(1).default(5),
  maxFeedsPerDay: z.number().int().min(0).default(10),
  maxIOCs: z.number().int().min(0).default(10000),
  aiCreditsMonthly: z.number().int().min(0).default(100),
  aiCreditsUsed: z.number().int().min(0).default(0),
  settings: z.record(z.string(), z.unknown()).default({}),
  active: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Tenant = z.infer<typeof TenantSchema>;

/** Create tenant input */
export const CreateTenantInputSchema = TenantSchema.pick({
  name: true,
  slug: true,
  plan: true,
});
export type CreateTenantInput = z.infer<typeof CreateTenantInputSchema>;

/** User schema */
export const UserSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1).max(255),
  avatarUrl: z.string().url().optional(),
  role: RoleSchema,
  designation: z.string().max(50).nullable().optional(),
  authProvider: AuthProviderSchema,
  authProviderId: z.string().optional(),
  passwordHash: z.string().optional(),
  mfaEnabled: z.boolean().default(false),
  mfaSecret: z.string().optional(),
  mfaBackupCodes: z.array(z.string()).default([]),
  mfaVerifiedAt: z.string().datetime().optional(),
  lastLoginAt: z.string().datetime().optional(),
  loginCount: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

/** Safe user projection (no secrets) */
export const SafeUserSchema = UserSchema.omit({
  passwordHash: true,
  mfaSecret: true,
  mfaBackupCodes: true,
});
export type SafeUser = z.infer<typeof SafeUserSchema>;

/** Create user input */
export const CreateUserInputSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(255),
  role: RoleSchema.default('analyst'),
  authProvider: AuthProviderSchema.default('email'),
  password: z.string().min(12).max(128).optional(),
});
export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

/** JWT token payload */
export const JwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  tenantId: z.string().uuid(),
  email: z.string().email(),
  role: RoleSchema,
  sessionId: z.string().uuid(),
  iat: z.number(),
  exp: z.number(),
});
export type JwtPayload = z.infer<typeof JwtPayloadSchema>;

/** Audit log — immutable record of all mutations (SOC 2 compliant) */
export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string(),
  changes: z.unknown().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

/** Create audit log input (id + timestamp auto-generated) */
export const CreateAuditLogInputSchema = AuditLogSchema.omit({
  id: true,
  timestamp: true,
});
export type CreateAuditLogInput = z.infer<typeof CreateAuditLogInputSchema>;

/** Feature flag for tenant-level feature gating */
export const FeatureFlagSchema = z.object({
  id: z.string().uuid(),
  key: z.string().min(1).max(100).regex(/^[a-z0-9_.]+$/),
  name: z.string().min(1).max(255),
  description: z.string().default(''),
  enabled: z.boolean().default(false),
  enabledForTenants: z.array(z.string().uuid()).default([]),
  enabledForPlans: z.array(z.enum(['free', 'pro', 'enterprise'])).default([]),
  rolloutPercentage: z.number().min(0).max(100).default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;
