// S177 VPS acceptance — runs INSIDE etip_alerting: `docker exec -i -e MODE=seed|check|cleanup etip_alerting node --input-type=module -`
// Exercises the real pipeline: BullMQ (bull prefix + password) → worker → rule engine → Postgres dedup/history/group.
import { createRequire } from 'node:module';
const require = createRequire('/app/apps/alerting-service/package.json');
const { PrismaClient } = require('@prisma/client');
const { Queue } = require('bullmq');

const T = '00000000-0000-4177-8177-000000000177'; // throwaway tenant, no real tenant uses it
const prisma = new PrismaClient();
const mode = process.env.MODE ?? 'check';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function counts() {
  const alerts = await prisma.alert.findMany({ where: { tenantId: T } });
  return {
    alerts: alerts.length,
    dedupCounts: alerts.map((a) => a.dedupCount),
    history: await prisma.alertHistoryEntry.count({ where: { tenantId: T } }),
    groups: await prisma.alertGroup.count({ where: { tenantId: T } }),
    rules: await prisma.alertRule.count({ where: { tenantId: T } }),
  };
}

if (mode === 'seed') {
  await prisma.alertRule.create({
    data: {
      tenantId: T, name: 'S177 acceptance - delete me', severity: 'low', enabled: true,
      condition: { type: 'threshold', threshold: { metric: 's177_accept', operator: 'gte', value: 1, windowMinutes: 60 } },
      channelIds: [], cooldownMinutes: 0, tags: ['s177-accept'],
    },
  });
  const u = new URL(process.env.TI_REDIS_URL);
  const connection = { host: u.hostname, port: Number(u.port) || 6379, password: u.password ? decodeURIComponent(u.password) : undefined, db: Number(u.pathname.slice(1)) || 0 };
  const q = new Queue('etip-alert-evaluate', { connection }); // default 'bull' prefix, like the real producers
  const job = { tenantId: T, eventType: 's177.accept', metric: 's177_accept', value: 1, source: { probe: 's177' } };
  await q.add('evaluate', job, { removeOnComplete: 100, removeOnFail: 50 });
  for (let i = 0; i < 20 && (await counts()).alerts === 0; i++) await sleep(1000);
  await q.add('evaluate', job, { removeOnComplete: 100, removeOnFail: 50 }); // same source → must dedup
  await sleep(5000);
  await q.close();
  console.log('SEED', JSON.stringify(await counts()));
} else if (mode === 'cleanup') {
  const r = await Promise.all([
    prisma.alertHistoryEntry.deleteMany({ where: { tenantId: T } }),
    prisma.alertGroup.deleteMany({ where: { tenantId: T } }),
    prisma.alert.deleteMany({ where: { tenantId: T } }),
    prisma.alertRule.deleteMany({ where: { tenantId: T } }),
  ]);
  console.log('CLEANUP', JSON.stringify(r.map((x) => x.count)), JSON.stringify(await counts()));
} else {
  console.log('CHECK', JSON.stringify(await counts()));
}
await prisma.$disconnect();
