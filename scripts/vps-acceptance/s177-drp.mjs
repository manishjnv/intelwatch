// S177 VPS acceptance — runs INSIDE etip_drp: `docker exec -i -e MODE=seed|check|cleanup etip_drp node --input-type=module -`
import { createRequire } from 'node:module';
const require = createRequire('/app/apps/drp-service/package.json');
const { PrismaClient } = require('@prisma/client');
const { createPrismaDrpRepo } = await import('/app/apps/drp-service/dist/repository-prisma-alerts.js');

const T = '00000000-0000-4177-8177-000000000177';
const OTHER = '00000000-0000-4177-8177-000000000178';
const ID = '00000000-0000-4177-8177-0000000001bb';
const prisma = new PrismaClient();
const repo = createPrismaDrpRepo(prisma);
const mode = process.env.MODE ?? 'check';
const now = new Date().toISOString();

if (mode === 'seed') {
  await repo.upsertAsset({
    id: ID, tenantId: T, type: 'domain', value: 's177-acceptance.invalid', displayName: 'S177 acceptance',
    enabled: false, scanFrequencyHours: 24, lastScannedAt: null, alertCount: 0, criticality: 0.5, tags: ['s177-accept'],
    createdBy: 's177', createdAt: now, updatedAt: now,
  });
  let conflict = 'none';
  try { await repo.upsertAsset({ ...(await repo.getAsset(T, ID)), tenantId: OTHER }); } catch (e) { conflict = `${e.statusCode ?? e.status}:${e.code}`; }
  console.log('SEED', JSON.stringify({ asset: (await repo.getAsset(T, ID))?.value, foreignTenantRead: await repo.getAsset(OTHER, ID), foreignTenantSave: conflict }));
} else if (mode === 'cleanup') {
  const r = await prisma.drpAsset.deleteMany({ where: { tenantId: { in: [T, OTHER] } } });
  console.log('CLEANUP', r.count);
} else {
  console.log('CHECK', JSON.stringify({ asset: (await repo.getAsset(T, ID))?.value, count: await repo.countAssets(T) }));
}
await prisma.$disconnect();
