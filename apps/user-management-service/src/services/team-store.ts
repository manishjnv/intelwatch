import { AppError } from '@etip/shared-utils';
import { randomUUID } from 'crypto';
import type { InviteUserInput, TeamMember } from '../schemas/user-management.js';
import type { PermissionStore } from './permission-store.js';

/** Team member list query options. */
export interface TeamListOptions {
  page: number;
  limit: number;
  status: 'active' | 'inactive' | 'pending' | 'all';
  role?: string;
  search?: string;
}

/**
 * In-memory team management store.
 * Manages user invitations, role assignments, and activation states.
 */
export class TeamStore {
  private members = new Map<string, TeamMember>();
  private permissionStore: PermissionStore;

  constructor(permissionStore: PermissionStore) {
    this.permissionStore = permissionStore;
  }

  /** Invite a user by email. Creates a pending team member. */
  inviteUser(input: InviteUserInput, tenantId: string, invitedBy: string): TeamMember {
    const existing = this.findByEmail(input.email, tenantId);
    if (existing) {
      throw new AppError(409, `User '${input.email}' already exists in this tenant`, 'USER_EXISTS');
    }

    const role = this.permissionStore.getRoleByName(input.role, tenantId);
    if (!role) {
      throw new AppError(400, `Role '${input.role}' not found`, 'ROLE_NOT_FOUND');
    }

    const member: TeamMember = {
      id: randomUUID(),
      tenantId,
      email: input.email.toLowerCase(),
      name: input.name ?? input.email.split('@')[0] ?? 'User',
      role: input.role,
      status: 'pending',
      invitedBy,
      invitedAt: new Date().toISOString(),
      acceptedAt: null,
      lastActiveAt: null,
      mfaEnabled: false,
      ssoLinked: false,
    };
    this.members.set(member.id, member);
    return member;
  }

  /** Accept an invitation (transition from pending to active). */
  acceptInvite(memberId: string, tenantId: string): TeamMember {
    const member = this.getMember(memberId, tenantId);
    if (member.status !== 'pending') {
      throw new AppError(400, 'Invitation already accepted or user deactivated', 'INVALID_STATUS');
    }
    const updated: TeamMember = {
      ...member,
      status: 'active',
      acceptedAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
    this.members.set(memberId, updated);
    return updated;
  }

  /** Update a user's role. */
  updateRole(memberId: string, role: string, tenantId: string): TeamMember {
    const member = this.getMember(memberId, tenantId);
    const roleRecord = this.permissionStore.getRoleByName(role, tenantId);
    if (!roleRecord) {
      throw new AppError(400, `Role '${role}' not found`, 'ROLE_NOT_FOUND');
    }

    const updated: TeamMember = { ...member, role };
    this.members.set(memberId, updated);
    return updated;
  }

  /** Deactivate a team member. */
  deactivate(memberId: string, tenantId: string): TeamMember {
    const member = this.getMember(memberId, tenantId);
    if (member.status === 'inactive') {
      throw new AppError(400, 'User is already deactivated', 'ALREADY_DEACTIVATED');
    }
    const updated: TeamMember = { ...member, status: 'inactive' };
    this.members.set(memberId, updated);
    return updated;
  }

  /** Reactivate a deactivated team member. */
  reactivate(memberId: string, tenantId: string): TeamMember {
    const member = this.getMember(memberId, tenantId);
    if (member.status !== 'inactive') {
      throw new AppError(400, 'User is not deactivated', 'NOT_DEACTIVATED');
    }
    const updated: TeamMember = {
      ...member,
      status: 'active',
      lastActiveAt: new Date().toISOString(),
    };
    this.members.set(memberId, updated);
    return updated;
  }

  /** Remove a team member permanently. */
  removeMember(memberId: string, tenantId: string): void {
    this.getMember(memberId, tenantId);
    this.members.delete(memberId);
  }

  /** List team members with filtering and pagination. */
  listMembers(tenantId: string, opts: TeamListOptions): { data: TeamMember[]; total: number } {
    let members = Array.from(this.members.values()).filter((m) => m.tenantId === tenantId);

    if (opts.status !== 'all') {
      members = members.filter((m) => m.status === opts.status);
    }
    if (opts.role) {
      members = members.filter((m) => m.role === opts.role);
    }
    if (opts.search) {
      const q = opts.search.toLowerCase();
      members = members.filter(
        (m) => m.email.includes(q) || m.name.toLowerCase().includes(q),
      );
    }

    const total = members.length;
    const start = (opts.page - 1) * opts.limit;
    const data = members.slice(start, start + opts.limit);

    return { data, total };
  }

  /** Get a member by ID within a tenant. */
  getMember(memberId: string, tenantId: string): TeamMember {
    const member = this.members.get(memberId);
    if (!member || member.tenantId !== tenantId) {
      throw new AppError(404, 'Team member not found', 'MEMBER_NOT_FOUND');
    }
    return member;
  }

  /** Find a member by email within a tenant. */
  findByEmail(email: string, tenantId: string): TeamMember | null {
    const normalizedEmail = email.toLowerCase();
    for (const m of this.members.values()) {
      if (m.tenantId === tenantId && m.email === normalizedEmail) return m;
    }
    return null;
  }

  /** Update MFA status for a member. */
  setMfaStatus(memberId: string, tenantId: string, enabled: boolean): void {
    const member = this.getMember(memberId, tenantId);
    this.members.set(memberId, { ...member, mfaEnabled: enabled });
  }

  /** Update SSO linked status for a member. */
  setSsoLinked(memberId: string, tenantId: string, linked: boolean): void {
    const member = this.getMember(memberId, tenantId);
    this.members.set(memberId, { ...member, ssoLinked: linked });
  }

  /** Touch last active timestamp. */
  touchLastActive(memberId: string, tenantId: string): void {
    const member = this.members.get(memberId);
    if (member && member.tenantId === tenantId) {
      this.members.set(memberId, { ...member, lastActiveAt: new Date().toISOString() });
    }
  }

  /** Get count of members by status. */
  getStats(tenantId: string): { total: number; active: number; inactive: number; pending: number } {
    const all = Array.from(this.members.values()).filter((m) => m.tenantId === tenantId);
    return {
      total: all.length,
      active: all.filter((m) => m.status === 'active').length,
      inactive: all.filter((m) => m.status === 'inactive').length,
      pending: all.filter((m) => m.status === 'pending').length,
    };
  }
}
