// S177 VPS acceptance — runs INSIDE etip_integration: `docker exec -i -e MODE=seed|check|cleanup etip_integration node --input-type=module -`
// Real Postgres: RCA #68 regression (same id, two kinds), cross-tenant 409, records repo, real-IOC export (RCA #67).
import { createRequire } from 'node:module';
const require = createRequire('/app/apps/integration-service/package.json');
const { PrismaClient } = require('@prisma/client');
const { loadServiceJwtSecret } = require('@etip/shared-auth');
const { createPrismaDocRepo } = await import('/app/apps/integration-service/dist/services/doc-repo-prisma.js');
const { createPrismaRecordsRepo } = await import('/app/apps/integration-service/dist/services/records-repo-prisma.js');
const { createIocExportFetcher } = await import('/app/apps/integration-service/dist/services/ioc-client.js');

const T = '00000000-0000-4177-8177-000000000177';
const OTHER = '00000000-0000-4177-8177-000000000178';
const ID = '00000000-0000-4177-8177-0000000001aa';
const prisma = new PrismaClient();
const mode = process.env.MODE ?? 'check';
const collections = createPrismaDocRepo(prisma, 'taxii_collection');
const objects = createPrismaDocRepo(prisma, 'taxii_objects');
const records = createPrismaRecordsRepo(prisma);

async function state() {
  return {
    collection: await collections.get(ID, T),
    objects: await objects.get(ID, T),
    logs: (await records.listLogs(T, ID, 1, 10)).total,
  };
}

if (mode === 'seed') {
  await collections.save({ id: ID, tenantId: T, title: 'S177 acceptance', objectCount: 0 });
  await objects.save({ id: ID, tenantId: T, objects: [] }, ID); // same id, other kind — must NOT overwrite the collection
  let conflict = 'none';
  try { await collections.save({ id: ID, tenantId: OTHER, title: 'hijack' }); } catch (e) { conflict = `${e.statusCode ?? e.status}:${e.code}`; }
  await records.addLog({ id: '00000000-0000-4177-8177-0000000001ab', integrationId: ID, tenantId: T, event: 'alert.created', status: 'success', statusCode: 200, errorMessage: null, attempt: 1, payload: {}, responseBody: null, createdAt: new Date().toISOString() });
  const s = await state();
  console.log('SEED', JSON.stringify({ collectionTitle: s.collection?.title, objectsDoc: Array.isArray(s.objects?.objects), foreignTenantSave: conflict, logs: s.logs }));
} else if (mode === 'export') {
  loadServiceJwtSecret(process.env);
  const [row] = await prisma.$queryRawUnsafe('SELECT tenant_id::text AS t FROM iocs GROUP BY tenant_id ORDER BY count(*) DESC LIMIT 1');
  const fetch = createIocExportFetcher(process.env.TI_IOC_SERVICE_URL, { warn() {}, info() {}, error() {}, debug() {} });
  const recs = await fetch(row.t, 'iocs', {}, 25);
  const text = JSON.stringify(recs);
  console.log('EXPORT', JSON.stringify({ records: recs.length, demoValues: /example\.com|185\.220\.101\.34|10\.0\.0\.1|demo-/.test(text) }));
} else if (mode === 'cleanup') {
  const a = await prisma.integrationDoc.deleteMany({ where: { tenantId: { in: [T, OTHER] } } });
  const b = await prisma.integrationLog.deleteMany({ where: { tenantId: T } });
  console.log('CLEANUP', a.count, b.count);
} else {
  const s = await state();
  console.log('CHECK', JSON.stringify({ collectionTitle: s.collection?.title, objectsDoc: Array.isArray(s.objects?.objects), logs: s.logs }));
}
await prisma.$disconnect();
