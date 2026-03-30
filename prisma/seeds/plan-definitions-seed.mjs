/**
 * Plan definitions seed — self-contained, no workspace deps.
 * Run: node prisma/seeds/plan-definitions-seed.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const U = -1; // unlimited

function feat(featureKey, enabled, daily, weekly, monthly, total) {
  return { featureKey, enabled, limitDaily: daily, limitWeekly: weekly, limitMonthly: monthly, limitTotal: total };
}

const PLANS = [
  {
    planId: 'free', name: 'Free',
    description: 'Get started with basic threat intelligence capabilities. Ideal for individual researchers.',
    priceMonthlyInr: 0, priceAnnualInr: 0, isPublic: true, isDefault: true, sortOrder: 0,
    features: [
      feat('ioc_management', true, 100, U, U, U),
      feat('threat_actors', true, 50, U, U, U),
      feat('malware_intel', true, 50, U, U, U),
      feat('vulnerability_intel', true, 100, U, U, U),
      feat('threat_hunting', true, U, U, 5, U),
      feat('graph_exploration', true, 20, U, U, U),
      feat('digital_risk_protection', false, 0, 0, 0, 0),
      feat('correlation_engine', true, 5, U, U, U),
      feat('reports', true, U, U, 5, U),
      feat('ai_enrichment', true, U, U, 10000, U),
      feat('feed_subscriptions', true, U, U, U, 3),
      feat('users', true, U, U, U, 1),
      feat('data_retention', true, U, U, U, 30),
      feat('api_access', false, 0, 0, 0, 0),
      feat('ioc_storage', true, U, U, U, 10000),
      feat('alerts', true, U, U, U, 5),
    ],
  },
  {
    planId: 'starter', name: 'Starter',
    description: 'For small security teams getting serious about threat intelligence. 10 users included.',
    priceMonthlyInr: 9999, priceAnnualInr: 95988, isPublic: true, isDefault: false, sortOrder: 1,
    features: [
      feat('ioc_management', true, 5000, U, U, U),
      feat('threat_actors', true, 2000, U, U, U),
      feat('malware_intel', true, 2000, U, U, U),
      feat('vulnerability_intel', true, 5000, U, U, U),
      feat('threat_hunting', true, U, U, 50, U),
      feat('graph_exploration', true, 500, U, U, U),
      feat('digital_risk_protection', true, U, U, U, 10),
      feat('correlation_engine', true, 50, U, U, U),
      feat('reports', true, U, U, 50, U),
      feat('ai_enrichment', true, U, U, 100000, U),
      feat('feed_subscriptions', true, U, U, U, 20),
      feat('users', true, U, U, U, 10),
      feat('data_retention', true, U, U, U, 90),
      feat('api_access', false, 0, 0, 0, 0),
      feat('ioc_storage', true, U, U, U, 500000),
      feat('alerts', true, U, U, U, 50),
    ],
  },
  {
    planId: 'pro', name: 'Pro',
    description: 'Full-featured threat intelligence for growing SOC teams. 50 users, advanced analytics.',
    priceMonthlyInr: 18999, priceAnnualInr: 179988, isPublic: true, isDefault: false, sortOrder: 2,
    features: [
      feat('ioc_management', true, 50000, U, U, U),
      feat('threat_actors', true, 20000, U, U, U),
      feat('malware_intel', true, 20000, U, U, U),
      feat('vulnerability_intel', true, 50000, U, U, U),
      feat('threat_hunting', true, U, U, 500, U),
      feat('graph_exploration', true, 5000, U, U, U),
      feat('digital_risk_protection', true, U, U, U, 100),
      feat('correlation_engine', true, 500, U, U, U),
      feat('reports', true, U, U, 500, U),
      feat('ai_enrichment', true, U, U, 1000000, U),
      feat('feed_subscriptions', true, U, U, U, 100),
      feat('users', true, U, U, U, 50),
      feat('data_retention', true, U, U, U, 180),
      feat('api_access', false, 0, 0, 0, 0),
      feat('ioc_storage', true, U, U, U, 5000000),
      feat('alerts', true, U, U, U, 500),
    ],
  },
  {
    planId: 'enterprise', name: 'Enterprise',
    description: 'Unlimited threat intelligence for large organizations. Full API access, custom retention, unlimited users.',
    priceMonthlyInr: 49999, priceAnnualInr: 479988, isPublic: true, isDefault: false, sortOrder: 3,
    features: [
      feat('ioc_management', true, U, U, U, U),
      feat('threat_actors', true, U, U, U, U),
      feat('malware_intel', true, U, U, U, U),
      feat('vulnerability_intel', true, U, U, U, U),
      feat('threat_hunting', true, U, U, U, U),
      feat('graph_exploration', true, U, U, U, U),
      feat('digital_risk_protection', true, U, U, U, U),
      feat('correlation_engine', true, U, U, U, U),
      feat('reports', true, U, U, U, U),
      feat('ai_enrichment', true, U, U, U, U),
      feat('feed_subscriptions', true, U, U, U, U),
      feat('users', true, U, U, U, U),
      feat('data_retention', true, U, U, U, U),
      feat('api_access', true, U, U, U, U),
      feat('ioc_storage', true, U, U, U, U),
      feat('alerts', true, U, U, U, U),
    ],
  },
];

async function main() {
  console.log('Seeding subscription plan definitions...');

  for (const plan of PLANS) {
    const existing = await prisma.subscriptionPlanDefinition.findUnique({
      where: { planId: plan.planId },
    });

    if (existing) {
      await prisma.subscriptionPlanDefinition.update({
        where: { planId: plan.planId },
        data: {
          name: plan.name, description: plan.description,
          priceMonthlyInr: plan.priceMonthlyInr, priceAnnualInr: plan.priceAnnualInr,
          isPublic: plan.isPublic, isDefault: plan.isDefault, sortOrder: plan.sortOrder,
        },
      });
      for (const f of plan.features) {
        await prisma.planFeatureLimit.upsert({
          where: { planDefId_featureKey: { planDefId: existing.id, featureKey: f.featureKey } },
          create: { planDefId: existing.id, ...f },
          update: { enabled: f.enabled, limitDaily: f.limitDaily, limitWeekly: f.limitWeekly, limitMonthly: f.limitMonthly, limitTotal: f.limitTotal },
        });
      }
      console.log(`  Updated: ${plan.name} (${plan.planId})`);
    } else {
      await prisma.subscriptionPlanDefinition.create({
        data: {
          planId: plan.planId, name: plan.name, description: plan.description,
          priceMonthlyInr: plan.priceMonthlyInr, priceAnnualInr: plan.priceAnnualInr,
          isPublic: plan.isPublic, isDefault: plan.isDefault, sortOrder: plan.sortOrder,
          features: { create: plan.features },
        },
      });
      console.log(`  Created: ${plan.name} (${plan.planId})`);
    }
  }

  const count = await prisma.subscriptionPlanDefinition.count();
  console.log(`Done. ${count} plan definitions in database.`);
}

main()
  .catch((err) => { console.error('Seed failed:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
