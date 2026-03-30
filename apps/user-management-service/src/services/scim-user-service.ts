import { AppError } from '@etip/shared-utils';
import {
  type ScimUserResource,
  type ScimUserBody,
  type ScimPatchOp,
  SCIM_SCHEMAS,
  SCIM_ERROR_TYPES,
  buildScimError,
  buildScimListResponse,
  type ScimListResponse,
} from '@etip/shared-types';
import { prisma } from '../prisma.js';
import type { SessionManager } from './session-manager.js';
import type { OwnershipTransferService } from './ownership-transfer-service.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaUser = any;

/** Map an ETIP User record to a SCIM User resource. */
function mapUserToScimResource(user: PrismaUser, baseUrl: string): ScimUserResource {
  return {
    schemas: [SCIM_SCHEMAS.USER],
    id: user.id,
    externalId: user.externalId ?? undefined,
    userName: user.email,
    displayName: user.displayName,
    name: {
      formatted: user.displayName,
    },
    title: user.designation ?? undefined,
    active: user.active,
    emails: [{ value: user.email, type: 'work', primary: true }],
    groups: [{ value: user.role, display: user.role }],
    meta: {
      resourceType: 'User',
      created: user.createdAt.toISOString(),
      lastModified: user.updatedAt.toISOString(),
      location: `${baseUrl}/scim/v2/Users/${user.id}`,
    },
  };
}

/** Parse a basic SCIM filter string. Supports: userName eq "x", externalId eq "x". */
function parseScimFilter(filter: string): { field: string; value: string } | null {
  const match = filter.match(/^(\w+)\s+eq\s+"([^"]+)"$/i);
  if (!match?.[1] || !match[2]) return null;

  const fieldMap: Record<string, string> = {
    username: 'email',
    externalid: 'externalId',
    displayname: 'displayName',
  };
  const mapped = fieldMap[match[1].toLowerCase()];
  if (!mapped) return null;

  return { field: mapped, value: match[2] };
}

/**
 * SCIM 2.0 User provisioning service.
 * Handles create, read, update, delete with ETIP field mapping.
 */
export class ScimUserService {
  private sessionManager: SessionManager;
  private ownershipTransfer?: OwnershipTransferService;

  constructor(sessionManager: SessionManager, ownershipTransfer?: OwnershipTransferService) {
    this.sessionManager = sessionManager;
    this.ownershipTransfer = ownershipTransfer;
  }

  /** GET /scim/v2/Users — list with optional filter and pagination. */
  async listUsers(
    tenantId: string,
    baseUrl: string,
    filter?: string,
    startIndex: number = 1,
    count: number = 100,
  ): Promise<ScimListResponse<ScimUserResource>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { tenantId };

    if (filter) {
      const parsed = parseScimFilter(filter);
      if (!parsed) {
        throw new AppError(400, `Unsupported filter: ${filter}. Supported: userName eq "x", externalId eq "x"`, 'INVALID_FILTER');
      }
      where[parsed.field] = parsed.value;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: startIndex - 1,
        take: count,
        orderBy: { createdAt: 'asc' },
      }),
      prisma.user.count({ where }),
    ]);

    const resources = users.map((u: PrismaUser) => mapUserToScimResource(u, baseUrl));
    return buildScimListResponse(resources, total, startIndex);
  }

  /** GET /scim/v2/Users/:id */
  async getUser(userId: string, tenantId: string, baseUrl: string): Promise<ScimUserResource> {
    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId },
    });
    if (!user) {
      throw new AppError(404, 'User not found', 'NOT_FOUND');
    }
    return mapUserToScimResource(user, baseUrl);
  }

  /** POST /scim/v2/Users — provision a new user. */
  async createUser(
    tenantId: string,
    body: ScimUserBody,
    baseUrl: string,
  ): Promise<ScimUserResource> {
    // Check tenant maxUsers limit
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new AppError(404, 'Tenant not found', 'TENANT_NOT_FOUND');
    }

    const activeUserCount = await prisma.user.count({
      where: { tenantId, active: true },
    });
    if (activeUserCount >= tenant.maxUsers) {
      const err = buildScimError(
        403,
        `Tenant user limit reached (${tenant.maxUsers}). Upgrade plan to add more users.`,
        SCIM_ERROR_TYPES.TOO_MANY,
      );
      throw new AppError(403, err.detail, 'PLAN_USER_LIMIT', err);
    }

    // Check duplicate email
    const existing = await prisma.user.findFirst({
      where: { tenantId, email: body.userName.toLowerCase() },
    });
    if (existing) {
      const err = buildScimError(409, 'User with this email already exists', SCIM_ERROR_TYPES.UNIQUENESS);
      throw new AppError(409, err.detail, 'CONFLICT', err);
    }

    // Check duplicate externalId
    if (body.externalId) {
      const extDup = await prisma.user.findFirst({
        where: { tenantId, externalId: body.externalId },
      });
      if (extDup) {
        const err = buildScimError(409, 'User with this externalId already exists', SCIM_ERROR_TYPES.UNIQUENESS);
        throw new AppError(409, err.detail, 'CONFLICT', err);
      }
    }

    const displayName = body.displayName
      ?? (body.name ? [body.name.givenName, body.name.familyName].filter(Boolean).join(' ') : null)
      ?? body.userName.split('@')[0]
      ?? 'User';

    const user = await prisma.user.create({
      data: {
        tenantId,
        email: body.userName.toLowerCase(),
        displayName,
        designation: body.title ?? null,
        externalId: body.externalId ?? null,
        active: body.active ?? true,
        emailVerified: true, // IdP is trusted
        authProvider: 'saml',
        role: 'analyst', // Default SCIM-provisioned role
      },
    });

    return mapUserToScimResource(user, baseUrl);
  }

  /** PUT /scim/v2/Users/:id — full replace. */
  async replaceUser(
    userId: string,
    tenantId: string,
    body: ScimUserBody,
    baseUrl: string,
  ): Promise<ScimUserResource> {
    const existing = await prisma.user.findFirst({
      where: { id: userId, tenantId },
    });
    if (!existing) {
      throw new AppError(404, 'User not found', 'NOT_FOUND');
    }

    // If setting active=false, check guards
    if (body.active === false && existing.active) {
      await this.enforceDeprovisionGuards(existing, tenantId);
    }

    const displayName = body.displayName
      ?? (body.name ? [body.name.givenName, body.name.familyName].filter(Boolean).join(' ') : null)
      ?? existing.displayName;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        email: body.userName.toLowerCase(),
        displayName,
        designation: body.title ?? null,
        externalId: body.externalId ?? null,
        active: body.active ?? true,
      },
    });

    // If deactivated, terminate sessions + revoke API keys
    if (body.active === false && existing.active) {
      await this.deprovisionUser(userId, tenantId);
    }

    return mapUserToScimResource(user, baseUrl);
  }

  /** PATCH /scim/v2/Users/:id — partial update per RFC 7644. */
  async patchUser(
    userId: string,
    tenantId: string,
    operations: ScimPatchOp[],
    baseUrl: string,
  ): Promise<ScimUserResource> {
    const existing = await prisma.user.findFirst({
      where: { id: userId, tenantId },
    });
    if (!existing) {
      throw new AppError(404, 'User not found', 'NOT_FOUND');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};
    let willDeactivate = false;

    for (const op of operations) {
      if (op.op === 'replace' || op.op === 'add') {
        switch (op.path) {
          case 'userName':
            updates.email = String(op.value).toLowerCase();
            break;
          case 'displayName':
            updates.displayName = String(op.value);
            break;
          case 'title':
            updates.designation = op.value != null ? String(op.value) : null;
            break;
          case 'externalId':
            updates.externalId = op.value != null ? String(op.value) : null;
            break;
          case 'active':
            updates.active = Boolean(op.value);
            if (op.value === false && existing.active) willDeactivate = true;
            break;
          default:
            // Ignore unknown paths per SCIM spec
            break;
        }
      }
      // 'remove' ops set field to null
      if (op.op === 'remove') {
        switch (op.path) {
          case 'title': updates.designation = null; break;
          case 'externalId': updates.externalId = null; break;
          default: break;
        }
      }
    }

    if (willDeactivate) {
      await this.enforceDeprovisionGuards(existing, tenantId);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updates,
    });

    if (willDeactivate) {
      await this.deprovisionUser(userId, tenantId);
    }

    return mapUserToScimResource(user, baseUrl);
  }

  /** DELETE /scim/v2/Users/:id — soft-delete (deactivate). */
  async deleteUser(userId: string, tenantId: string): Promise<void> {
    const existing = await prisma.user.findFirst({
      where: { id: userId, tenantId },
    });
    if (!existing) {
      throw new AppError(404, 'User not found', 'NOT_FOUND');
    }

    await this.enforceDeprovisionGuards(existing, tenantId);

    await prisma.user.update({
      where: { id: userId },
      data: { active: false },
    });

    await this.deprovisionUser(userId, tenantId);
  }

  /** Check I-04/I-05 guards before deprovisioning. */
  private async enforceDeprovisionGuards(
    user: PrismaUser,
    tenantId: string,
  ): Promise<void> {
    // I-04 + I-05 Guard C: cannot deactivate last active tenant_admin
    if (user.role === 'tenant_admin') {
      const otherAdmins = await prisma.user.count({
        where: {
          tenantId,
          role: 'tenant_admin',
          active: true,
          id: { not: user.id },
        },
      });
      if (otherAdmins === 0) {
        throw new AppError(
          403,
          'Cannot de-provision the last active tenant admin. Promote another user first.',
          'LAST_ADMIN_PROTECTED',
        );
      }
    }
  }

  /** Terminate sessions + revoke API keys + transfer ownership for a deprovisioned user. */
  private async deprovisionUser(userId: string, tenantId: string): Promise<void> {
    // Terminate all active sessions (in-memory)
    this.sessionManager.revokeAll(userId, tenantId);

    // Revoke all API keys (DB)
    await prisma.apiKey.updateMany({
      where: { userId, tenantId },
      data: { active: false },
    });

    // I-21: Transfer ownership on SCIM deprovision
    if (this.ownershipTransfer) {
      await this.ownershipTransfer.transferOnDisable(userId, tenantId, null, 'scim_deprovision');
    }
  }
}
