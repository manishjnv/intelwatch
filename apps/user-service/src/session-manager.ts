/**
 * @module SessionManager (user-service)
 * @description Minimal session manager for gateway-instantiated offboarding.
 * Only exposes revokeAll() for offboarding — full session management is in user-management-service.
 */

export class SessionManager {
  /** Revoke all sessions for a user. Returns count. Gateway uses DB deletion instead. */
  revokeAll(_userId: string, _tenantId: string): number {
    // In gateway context, session termination is via Prisma session.deleteMany
    // This in-memory manager returns 0 — the offboarding service also does DB deletion
    return 0;
  }
}
