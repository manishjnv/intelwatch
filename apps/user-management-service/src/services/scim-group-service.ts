import {
  type ScimGroupResource,
  type ScimListResponse,
  SCIM_SCHEMAS,
  buildScimListResponse,
} from '@etip/shared-types';
import { AppError } from '@etip/shared-utils';
import { prisma } from '../prisma.js';

/** The roles that map to SCIM groups. */
const SCIM_GROUP_ROLES = ['tenant_admin', 'analyst'] as const;

/**
 * SCIM 2.0 Groups service — read-only virtual groups derived from roles.
 * Groups cannot be created/modified via SCIM; role changes go through the management API.
 */
export class ScimGroupService {
  /** GET /scim/v2/Groups — list virtual groups for a tenant. */
  async listGroups(
    tenantId: string,
    baseUrl: string,
  ): Promise<ScimListResponse<ScimGroupResource>> {
    const groups: ScimGroupResource[] = [];

    for (const role of SCIM_GROUP_ROLES) {
      const members = await prisma.user.findMany({
        where: { tenantId, role: role as never, active: true },
        select: { id: true, displayName: true },
      });

      groups.push({
        schemas: [SCIM_SCHEMAS.GROUP],
        id: role,
        displayName: role,
        members: members.map((m) => ({
          value: m.id,
          display: m.displayName,
          $ref: `${baseUrl}/scim/v2/Users/${m.id}`,
        })),
        meta: {
          resourceType: 'Group',
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          location: `${baseUrl}/scim/v2/Groups/${role}`,
        },
      });
    }

    return buildScimListResponse(groups, groups.length, 1);
  }

  /** GET /scim/v2/Groups/:id — get a single virtual group. */
  async getGroup(
    groupId: string,
    tenantId: string,
    baseUrl: string,
  ): Promise<ScimGroupResource> {
    if (!SCIM_GROUP_ROLES.includes(groupId as typeof SCIM_GROUP_ROLES[number])) {
      throw new AppError(404, `Group '${groupId}' not found`, 'GROUP_NOT_FOUND');
    }

    const members = await prisma.user.findMany({
      where: { tenantId, role: groupId as never, active: true },
      select: { id: true, displayName: true },
    });

    return {
      schemas: [SCIM_SCHEMAS.GROUP],
      id: groupId,
      displayName: groupId,
      members: members.map((m) => ({
        value: m.id,
        display: m.displayName,
        $ref: `${baseUrl}/scim/v2/Users/${m.id}`,
      })),
      meta: {
        resourceType: 'Group',
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        location: `${baseUrl}/scim/v2/Groups/${groupId}`,
      },
    };
  }
}
