import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { PlanStore } from './services/plan-store.js';
import { UsageStore } from './services/usage-store.js';
import { RazorpayClient } from './services/razorpay-client.js';
import { InvoiceStore } from './services/invoice-store.js';
import { UpgradeFlow } from './services/upgrade-flow.js';
import { CouponStore } from './services/coupon-store.js';
import { prisma, disconnectPrisma } from './prisma.js';
import { SubscriptionRepo } from './repository.js';

async function main(): Promise<void> {
  // 1. Config + Logger
  const env = process.env as unknown as Record<string, string | undefined>;
  const config = loadConfig(env);
  const logger = initLogger(config.TI_LOG_LEVEL);
  logger.info('Starting billing-service...');

  // 2. Auth secrets
  loadJwtConfig(env);
  loadServiceJwtSecret(env);

  // 3. Core services — PlanStore Prisma-backed; others in-memory (DECISION-013)
  const subscriptionRepo = new SubscriptionRepo(prisma);
  const planStore = new PlanStore(subscriptionRepo);
  const usageStore = new UsageStore();
  const invoiceStore = new InvoiceStore();
  const couponStore = new CouponStore();

  // 4. Razorpay client
  const razorpayClient = new RazorpayClient({
    keyId: config.TI_RAZORPAY_KEY_ID,
    keySecret: config.TI_RAZORPAY_KEY_SECRET,
    webhookSecret: config.TI_RAZORPAY_WEBHOOK_SECRET,
  });

  // 5. Business flows
  const upgradeFlow = new UpgradeFlow(planStore, invoiceStore);

  // 6. Build Fastify app with DI
  const app = await buildApp({
    config,
    planDeps: { planStore },
    usageDeps: { usageStore, planStore },
    subscriptionDeps: { razorpayClient, planStore },
    invoiceDeps: { invoiceStore },
    upgradeDeps: { upgradeFlow },
    webhookDeps: { razorpayClient, invoiceStore, planStore },
    p0Deps: { couponStore, planStore, usageStore },
    adminDeps: { invoiceStore, planStore, usageStore },
  });

  // 7. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down billing-service...');
    await app.close();
    await disconnectPrisma();
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

  // 8. Start listening
  await app.listen({ port: config.TI_BILLING_PORT, host: config.TI_BILLING_HOST });
  logger.info({ port: config.TI_BILLING_PORT }, 'Billing service ready');
}

main().catch((err) => {
  console.error('Failed to start billing-service:', err);
  process.exit(1);
});
