import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FeedQuotaStore, type TenantPlanAssignment } from '../src/services/feed-quota-store.js';
import type { FeedQuotaRepo } from '../src/repository.js';

const TENANT_A = '10c895c3-80ba-4f8d-b48d-9e90d26b781b';
const ADMIN = 'admin-user-1';

function createMockRepo(overrides: Partial<FeedQuotaRepo> = {}): FeedQuotaRepo {
  return {
    getTenantPlan: vi.fn().mockResolvedValue(null),
    upsertTenantPlan: vi.fn().mockImplementation(async (a: TenantPlanAssignment) => a),
    getAllAssignments: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as FeedQuotaRepo;
}

describe('FeedQuotaStore (dual-mode with repo)', () => {
  describe('getTenantPlan', () => {
    it('returns DB result when repo has data', async () => {
      const dbAssignment: TenantPlanAssignment = {
        tenantId: TENANT_A,
        planId: 'teams',
        assignedBy: 'system',
        assignedAt: new Date('2026-01-01'),
      };
      const repo = createMockRepo({
        getTenantPlan: vi.fn().mockResolvedValue(dbAssignment),
      });
      const store = new FeedQuotaStore(repo);

      const result = await store.getTenantPlan(TENANT_A);
      expect(result.planId).toBe('teams');
      expect(repo.getTenantPlan).toHaveBeenCalledWith(TENANT_A);
    });

    it('falls back to in-memory when repo returns null', async () => {
      const repo = createMockRepo();
      const store = new FeedQuotaStore(repo);

      const result = await store.getTenantPlan(TENANT_A);
      expect(result.planId).toBe('free');
    });

    it('falls back to in-memory when repo throws', async () => {
      const repo = createMockRepo({
        getTenantPlan: vi.fn().mockRejectedValue(new Error('DB down')),
      });
      const store = new FeedQuotaStore(repo);

      const result = await store.getTenantPlan(TENANT_A);
      expect(result.planId).toBe('free');
    });
  });

  describe('assignPlan', () => {
    it('calls repo.upsertTenantPlan on assign', async () => {
      const repo = createMockRepo();
      const store = new FeedQuotaStore(repo);

      await store.assignPlan(TENANT_A, 'starter', ADMIN);
      expect(repo.upsertTenantPlan).toHaveBeenCalledTimes(1);
      const call = (repo.upsertTenantPlan as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.tenantId).toBe(TENANT_A);
      expect(call.planId).toBe('starter');
    });

    it('still updates in-memory Map even when repo throws', async () => {
      const repo = createMockRepo({
        upsertTenantPlan: vi.fn().mockRejectedValue(new Error('DB down')),
      });
      const store = new FeedQuotaStore(repo);

      await store.assignPlan(TENANT_A, 'enterprise', ADMIN);
      // In-memory should still have the assignment
      const plan = await store.getTenantPlan(TENANT_A);
      // repo.getTenantPlan returns null, so falls through to in-memory
      expect(plan.planId).toBe('enterprise');
    });
  });

  describe('listAllAssignments', () => {
    it('returns DB results when repo succeeds', async () => {
      const dbList: TenantPlanAssignment[] = [
        { tenantId: TENANT_A, planId: 'starter', assignedBy: ADMIN, assignedAt: new Date() },
      ];
      const repo = createMockRepo({
        getAllAssignments: vi.fn().mockResolvedValue(dbList),
      });
      const store = new FeedQuotaStore(repo);

      const result = await store.listAllAssignments();
      expect(result).toHaveLength(1);
      expect(result[0].planId).toBe('starter');
    });

    it('falls back to in-memory when repo throws', async () => {
      const repo = createMockRepo({
        getAllAssignments: vi.fn().mockRejectedValue(new Error('DB down')),
      });
      const store = new FeedQuotaStore(repo);

      await store.assignPlan(TENANT_A, 'teams', ADMIN);
      const result = await store.listAllAssignments();
      expect(result).toHaveLength(1);
      expect(result[0].planId).toBe('teams');
    });
  });

  describe('getTenantFeedQuota', () => {
    it('returns quota based on DB plan assignment', async () => {
      const dbAssignment: TenantPlanAssignment = {
        tenantId: TENANT_A,
        planId: 'enterprise',
        assignedBy: ADMIN,
        assignedAt: new Date(),
      };
      const repo = createMockRepo({
        getTenantPlan: vi.fn().mockResolvedValue(dbAssignment),
      });
      const store = new FeedQuotaStore(repo);

      const quota = await store.getTenantFeedQuota(TENANT_A);
      expect(quota.planId).toBe('enterprise');
      expect(quota.maxFeeds).toBe(-1);
    });
  });
});
