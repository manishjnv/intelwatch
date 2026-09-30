// S177 VPS acceptance (S159d) — runs INSIDE etip_onboarding: `docker exec -i -e MODE=seed|check|cleanup etip_onboarding node --input-type=module -`
// Module readiness state lives in Redis `etip:{tenantId}:modules` and survives a new instance / container restart.
import { createRequire } from 'node:module';
const require = createRequire('/app/apps/onboarding/package.json');
const Redis = require('ioredis');
const { ModuleReadinessChecker } = await import('/app/apps/onboarding/dist/services/module-readiness.js');

const T = '00000000-0000-4177-8177-000000000177';
const redis = new Redis(process.env.TI_REDIS_URL, { maxRetriesPerRequest: 3 });
const mode = process.env.MODE ?? 'check';

if (mode === 'seed') {
  await new ModuleReadinessChecker(redis).enableModule(T, 'ioc-intelligence');
  console.log('SEED', await redis.get(`etip:${T}:modules`));
} else if (mode === 'cleanup') {
  console.log('CLEANUP', await redis.del(`etip:${T}:modules`, `etip:${T}:checklist`, `etip:${T}:demo-seeded`, `etip:${T}:tour-completed`));
} else {
  const all = await new ModuleReadinessChecker(redis).checkAll(T); // fresh instance → must read Redis
  const m = all.find((x) => x.module === 'ioc-intelligence');
  console.log('CHECK', JSON.stringify({ iocIntelligenceEnabled: m?.enabled ?? m?.status, key: await redis.exists(`etip:${T}:modules`) }));
}
redis.disconnect();
