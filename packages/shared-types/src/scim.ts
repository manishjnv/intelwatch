/**
 * @module @etip/shared-types/scim
 * @description SCIM 2.0 type definitions per RFC 7643/7644.
 * Used by user-management-service for IdP provisioning (Okta, Azure AD, etc.).
 */

import { z } from 'zod';

// ─── SCIM Constants ───────────────────────────────────────────────────────────

export const SCIM_SCHEMAS = {
  USER: 'urn:ietf:params:scim:schemas:core:2.0:User',
  GROUP: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  LIST_RESPONSE: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  PATCH_OP: 'urn:ietf:params:scim:api:messages:2.0:PatchOp',
  ERROR: 'urn:ietf:params:scim:api:messages:2.0:Error',
} as const;

export const SCIM_ERROR_TYPES = {
  UNIQUENESS: 'uniqueness',
  MUTABILITY: 'mutability',
  INVALID_VALUE: 'invalidValue',
  TOO_MANY: 'tooMany',
} as const;

// ─── SCIM Resource Types ──────────────────────────────────────────────────────

export interface ScimMeta {
  resourceType: 'User' | 'Group';
  created: string;
  lastModified: string;
  location: string;
}

export interface ScimName {
  givenName?: string;
  familyName?: string;
  formatted?: string;
}

export interface ScimEmail {
  value: string;
  type?: string;
  primary?: boolean;
}

export interface ScimGroupRef {
  value: string;
  display: string;
  $ref?: string;
}

export interface ScimUserResource {
  schemas: string[];
  id: string;
  externalId?: string;
  userName: string;
  displayName: string;
  name?: ScimName;
  title?: string | null;
  active: boolean;
  emails: ScimEmail[];
  groups: ScimGroupRef[];
  meta: ScimMeta;
}

export interface ScimGroupMember {
  value: string;
  display: string;
  $ref?: string;
}

export interface ScimGroupResource {
  schemas: string[];
  id: string;
  displayName: string;
  members: ScimGroupMember[];
  meta: ScimMeta;
}

export interface ScimListResponse<T> {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

export interface ScimErrorResponse {
  schemas: string[];
  detail: string;
  status: string;
  scimType?: string;
}

// ─── SCIM PATCH Operations ────────────────────────────────────────────────────

export const ScimPatchOpSchema = z.object({
  op: z.enum(['add', 'remove', 'replace']),
  path: z.string().optional(),
  value: z.unknown().optional(),
});
export type ScimPatchOp = z.infer<typeof ScimPatchOpSchema>;

export const ScimPatchBodySchema = z.object({
  schemas: z.array(z.string()).refine(
    (s) => s.includes(SCIM_SCHEMAS.PATCH_OP),
    'schemas must include PatchOp schema',
  ),
  Operations: z.array(ScimPatchOpSchema).min(1).max(50),
});
export type ScimPatchBody = z.infer<typeof ScimPatchBodySchema>;

// ─── SCIM User Create/Replace Body ───────────────────────────────────────────

export const ScimUserBodySchema = z.object({
  schemas: z.array(z.string()).refine(
    (s) => s.includes(SCIM_SCHEMAS.USER),
    'schemas must include User schema',
  ),
  userName: z.string().email().max(255),
  displayName: z.string().max(255).optional(),
  name: z.object({
    givenName: z.string().max(128).optional(),
    familyName: z.string().max(128).optional(),
  }).optional(),
  title: z.string().max(50).optional(),
  active: z.boolean().default(true),
  externalId: z.string().max(255).optional(),
  emails: z.array(z.object({
    value: z.string().email().max(255),
    type: z.string().optional(),
    primary: z.boolean().optional(),
  })).optional(),
});
export type ScimUserBody = z.infer<typeof ScimUserBodySchema>;

// ─── SCIM List Query ──────────────────────────────────────────────────────────

export const ScimListQuerySchema = z.object({
  filter: z.string().max(512).optional(),
  startIndex: z.coerce.number().int().min(1).default(1),
  count: z.coerce.number().int().min(1).max(200).default(100),
});
export type ScimListQuery = z.infer<typeof ScimListQuerySchema>;

// ─── SCIM Token Management ───────────────────────────────────────────────────

export const ScimTokenCreateSchema = z.object({
  description: z.string().min(1).max(255),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});
export type ScimTokenCreate = z.infer<typeof ScimTokenCreateSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a SCIM error response object. */
export function buildScimError(
  status: number,
  detail: string,
  scimType?: string,
): ScimErrorResponse {
  return {
    schemas: [SCIM_SCHEMAS.ERROR],
    detail,
    status: String(status),
    ...(scimType ? { scimType } : {}),
  };
}

/** Build a SCIM list response wrapper. */
export function buildScimListResponse<T>(
  resources: T[],
  totalResults: number,
  startIndex: number,
): ScimListResponse<T> {
  return {
    schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
    totalResults,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}
