/**
 * @module @etip/shared-types
 * @description Central type registry for the Enterprise Threat Intelligence Platform.
 * All services import types from this package — never define entity shapes locally.
 *
 * @example
 * ```typescript
 * import { CanonicalIOCSchema, type CanonicalIOC, CACHE_TTL } from '@etip/shared-types';
 * ```
 */

// ── IOC types & schemas ────────────────────────────────────────────
export {
  IOC_TYPES,
  IocTypeSchema,
  type IocType,
  TLP_LEVELS,
  TlpSchema,
  type Tlp,
  SEVERITY_LEVELS,
  SeveritySchema,
  type Severity,
  IOC_STATES,
  IocStateSchema,
  type IocState,
  IOC_TRANSITIONS,
  IOC_AUTO_TRANSITIONS,
  SourceRefSchema,
  type SourceRef,
  CanonicalIOCSchema,
  type CanonicalIOC,
  CreateIOCInputSchema,
  type CreateIOCInput,
  ConfidenceInputsSchema,
  type ConfidenceInputs,
} from './ioc.js';

// ── Intel entity types (actors, malware, vulns) ────────────────────
export {
  ACTOR_MOTIVATIONS,
  ACTOR_SOPHISTICATION,
  CanonicalThreatActorSchema,
  type CanonicalThreatActor,
  CanonicalMalwareSchema,
  type CanonicalMalware,
  CVSS_SEVERITY,
  CanonicalVulnerabilitySchema,
  type CanonicalVulnerability,
  ENTITY_TYPES,
  EntityTypeSchema,
  type EntityType,
  NormalizedIntelSchema,
  type NormalizedIntel,
} from './intel.js';

// ── API response & pagination types ────────────────────────────────
export {
  PaginatedResponseSchema,
  type PaginatedResponse,
  type SingleResponse,
  ErrorResponseSchema,
  type ErrorResponse,
  PaginationQuerySchema,
  type PaginationQuery,
  SortDirectionSchema,
  type SortDirection,
  SortedPaginationQuerySchema,
  type SortedPaginationQuery,
  DateRangeSchema,
  type DateRange,
  type RequestContext,
  HealthResponseSchema,
  type HealthResponse,
} from './api.js';

// ── BullMQ queue payload types ─────────────────────────────────────
export {
  FeedFetchPayloadSchema,
  type FeedFetchPayload,
  FeedParsePayloadSchema,
  type FeedParsePayload,
  NormalizePayloadSchema,
  type NormalizePayload,
  DeduplicatePayloadSchema,
  type DeduplicatePayload,
  EnrichRealtimePayloadSchema,
  type EnrichRealtimePayload,
  EnrichBatchPayloadSchema,
  type EnrichBatchPayload,
  GraphSyncPayloadSchema,
  type GraphSyncPayload,
  CorrelatePayloadSchema,
  type CorrelatePayload,
  AlertEvaluatePayloadSchema,
  type AlertEvaluatePayload,
  IntegrationPushPayloadSchema,
  type IntegrationPushPayload,
  ArchivePayloadSchema,
  type ArchivePayload,
  ReportGeneratePayloadSchema,
  type ReportGeneratePayload,
} from './queue.js';

// ── User, Tenant, Auth, Audit types ────────────────────────────────
export {
  ROLES,
  RoleSchema,
  type Role,
  AUTH_PROVIDERS,
  AuthProviderSchema,
  type AuthProvider,
  TenantSchema,
  type Tenant,
  CreateTenantInputSchema,
  type CreateTenantInput,
  UserSchema,
  type User,
  SafeUserSchema,
  type SafeUser,
  CreateUserInputSchema,
  type CreateUserInput,
  JwtPayloadSchema,
  type JwtPayload,
  AuditLogSchema,
  type AuditLog,
  CreateAuditLogInputSchema,
  type CreateAuditLogInput,
  FeatureFlagSchema,
  type FeatureFlag,
} from './user.js';

// ── STIX 2.1 mappings ─────────────────────────────────────────────
export {
  STIX_SDO_TYPES,
  StixSdoTypeSchema,
  type StixSdoType,
  STIX_SCO_TYPES,
  StixScoTypeSchema,
  type StixScoType,
  STIX_RELATIONSHIP_TYPES,
  StixRelationshipTypeSchema,
  type StixRelationshipType,
  IOC_TO_STIX_SCO,
  ENTITY_TO_STIX_SDO,
  STIX_SDO_TO_ENTITY,
  TLP_TO_STIX_MARKING,
  StixBundleSchema,
  type StixBundle,
  StixBaseObjectSchema,
  type StixBaseObject,
  StixSightingSchema,
  type StixSighting,
  buildStixSighting,
} from './stix.js';

// ── Plan Definition System ─────────────────────────────────────────
export {
  FEATURE_KEYS,
  FeatureKeySchema,
  type FeatureKey,
  PlanFeatureLimitSchema,
  type PlanFeatureLimit,
  PlanDefinitionCreateSchema,
  type PlanDefinitionCreate,
  PlanDefinitionUpdateSchema,
  type PlanDefinitionUpdate,
  TenantFeatureOverrideCreateSchema,
  type TenantFeatureOverrideCreate,
  TenantFeatureOverrideUpdateSchema,
  type TenantFeatureOverrideUpdate,
  type FeatureLimits,
  type QuotaCheckResult,
  type UsageSnapshot,
  type QuotaThresholdEvent,
} from './plan.js';

// ── SCIM 2.0 types (I-12) ─────────────────────────────────────────
export {
  SCIM_SCHEMAS,
  SCIM_ERROR_TYPES,
  type ScimMeta,
  type ScimName,
  type ScimEmail,
  type ScimGroupRef,
  type ScimUserResource,
  type ScimGroupMember,
  type ScimGroupResource,
  type ScimListResponse,
  type ScimErrorResponse,
  ScimPatchOpSchema,
  type ScimPatchOp,
  ScimPatchBodySchema,
  type ScimPatchBody,
  ScimUserBodySchema,
  type ScimUserBody,
  ScimListQuerySchema,
  type ScimListQuery,
  ScimTokenCreateSchema,
  type ScimTokenCreate,
  buildScimError,
  buildScimListResponse,
} from './scim.js';

// ── Config & constants ─────────────────────────────────────────────
export {
  AI_MODELS,
  ModelConfigSchema,
  type ModelConfig,
  CACHE_TTL,
  CacheTTLSchema,
  type CacheTTLConfig,
  PLATFORM_CONSTANTS,
  FeedConfigSchema,
  type FeedConfig,
  EnvConfigSchema,
  type EnvConfig,
} from './config.js';
