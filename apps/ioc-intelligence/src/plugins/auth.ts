import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyAccessToken, verifyServiceToken, hasPermission } from '@etip/shared-auth';
import type { JwtPayload } from '@etip/shared-types';
import { AppError } from '@etip/shared-utils';
import { getConfig } from '../config.js';

export interface AuthenticatedRequest { user: JwtPayload; }

/** S171: a verified service-to-service caller (no user attached). */
export interface ServiceCaller { service: string; tenantId: string; }
export interface ServiceAuthenticatedRequest { serviceCaller: ServiceCaller; }

const SERVICE_AUDIENCE = 'ioc-intelligence';
const TenantHeaderSchema = z.string().uuid();

/** Single-value header lookup — rejects duplicate headers instead of guessing. */
function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? undefined : value;
}

function extractBearerToken(authHeader: string | undefined): string {
  if (!authHeader) throw new AppError(401, 'Missing Authorization header', 'UNAUTHORIZED');
  if (!authHeader.startsWith('Bearer ')) throw new AppError(401, 'Invalid Authorization format — expected Bearer token', 'UNAUTHORIZED');
  const token = authHeader.slice(7).trim();
  if (!token) throw new AppError(401, 'Empty Bearer token', 'UNAUTHORIZED');
  return token;
}

/** Fastify preHandler — verifies JWT and attaches user to request. */
export async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  const payload = verifyAccessToken(token);
  (req as FastifyRequest & AuthenticatedRequest).user = payload;
}

/** Extracts the authenticated user from request. Throws if not authenticated. */
export function getUser(req: FastifyRequest): JwtPayload {
  const user = (req as FastifyRequest & AuthenticatedRequest).user;
  if (!user) throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
  return user;
}

/** Returns a Fastify preHandler that checks RBAC permission after authentication. */
export function rbac(permission: string): (req: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const user = (req as FastifyRequest & AuthenticatedRequest).user;
    if (!user) throw new AppError(401, 'Authentication required before RBAC check', 'UNAUTHORIZED');
    if (!hasPermission(user.role, permission)) {
      throw new AppError(403, `Permission denied: requires ${permission}`, 'FORBIDDEN', { required: permission, role: user.role });
    }
  };
}

// ── S171: service-to-service auth (threat-graph reads IOCs) ────────

/**
 * Verifies the x-service-token header and attaches req.serviceCaller.
 * Never sets req.user — routes guarded by rbac()/getUser() stay unreachable.
 * @param requireTenant when true, also requires a valid x-tenant-id UUID header.
 */
async function verifyServiceCallerToken(req: FastifyRequest, requireTenant: boolean): Promise<void> {
  const token = singleHeader(req.headers['x-service-token']);
  if (!token) throw new AppError(401, 'Missing x-service-token header', 'UNAUTHORIZED');

  const decoded = verifyServiceToken(token); // maps expired/invalid tokens to 401 itself

  if (decoded.aud !== SERVICE_AUDIENCE) {
    throw new AppError(403, `Unexpected service audience: ${decoded.aud}`, 'SERVICE_AUTH_FAILED');
  }
  const allowedCallers = getConfig().TI_IOC_SERVICE_CALLERS.split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowedCallers.includes(decoded.iss)) {
    throw new AppError(403, `Service issuer not allowed: ${decoded.iss}`, 'SERVICE_AUTH_FAILED');
  }

  let tenantId = '';
  if (requireTenant) {
    const tenantHeader = TenantHeaderSchema.safeParse(singleHeader(req.headers['x-tenant-id']));
    if (!tenantHeader.success) {
      throw new AppError(400, 'Missing or invalid x-tenant-id header', 'INVALID_TENANT_HEADER');
    }
    tenantId = tenantHeader.data;
  }

  (req as FastifyRequest & ServiceAuthenticatedRequest).serviceCaller = { service: decoded.iss, tenantId };
}

/** Fastify preHandler — service auth for tenant-scoped routes (list/detail). */
export async function authenticateService(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  await verifyServiceCallerToken(req, true);
}

/** Fastify preHandler — service auth for cross-tenant routes (e.g. /internal/tenants). */
export async function authenticateServiceNoTenant(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  await verifyServiceCallerToken(req, false);
}

/**
 * Fastify preHandler — service token if present, else user auth.
 * Never falls back to user auth when a service token is present but invalid.
 */
export async function authenticateUserOrService(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (singleHeader(req.headers['x-service-token'])) {
    await authenticateService(req, reply);
    return;
  }
  await authenticate(req, reply);
}

/** Returns the tenantId from either an authenticated user or a service caller. Throws 401 if neither. */
export function getTenantId(req: FastifyRequest): string {
  const r = req as FastifyRequest & Partial<AuthenticatedRequest> & Partial<ServiceAuthenticatedRequest>;
  if (r.user) return r.user.tenantId;
  if (r.serviceCaller) return r.serviceCaller.tenantId;
  throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
}
