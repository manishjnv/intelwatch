/**
 * @module SubscriptionRepository
 * @description Manages tenant subscriptions to global feeds (DECISION-029).
 */
import type { PrismaClient, TenantFeedSubscription } from '@prisma/client';

export class SubscriptionRepository {
  constructor(private prisma: PrismaClient) {}

  async subscribe(tenantId: string, globalFeedId: string): Promise<TenantFeedSubscription> {
    return this.prisma.tenantFeedSubscription.upsert({
      where: { tenantId_globalFeedId: { tenantId, globalFeedId } },
      update: { enabled: true },
      create: { tenantId, globalFeedId },
    });
  }

  async unsubscribe(tenantId: string, globalFeedId: string): Promise<void> {
    await this.prisma.tenantFeedSubscription.delete({
      where: { tenantId_globalFeedId: { tenantId, globalFeedId } },
    });
  }

  async getSubscriptions(tenantId: string): Promise<TenantFeedSubscription[]> {
    return this.prisma.tenantFeedSubscription.findMany({
      where: { tenantId },
      include: { globalFeed: true },
    });
  }

  async isSubscribed(tenantId: string, globalFeedId: string): Promise<boolean> {
    const count = await this.prisma.tenantFeedSubscription.count({
      where: { tenantId, globalFeedId },
    });
    return count > 0;
  }

  async getSubscriptionCount(tenantId: string): Promise<number> {
    return this.prisma.tenantFeedSubscription.count({ where: { tenantId } });
  }

  async getSubscribedTenants(globalFeedId: string): Promise<string[]> {
    const subs = await this.prisma.tenantFeedSubscription.findMany({
      where: { globalFeedId, enabled: true },
      select: { tenantId: true },
    });
    return subs.map((s) => s.tenantId);
  }
}
