// S177 VPS acceptance (S159) — runs INSIDE etip_hunting: `docker exec -i -e MODE=seed|check|cleanup etip_hunting node --input-type=module -`
// Real Postgres: session + playbook execution share an id (composite key), foreign-tenant save → 409, restart survival.
import { createRequire } from 'node:module';
const require = createRequire('/app/apps/hunting-service/package.json');
const { PrismaClient } = require('@prisma/client');
const { createPrismaDocRepo } = await import('/app/apps/hunting-service/dist/doc-repo-prisma.js');

const T = '00000000-0000-4177-8177-000000000177';
const OTHER = '00000000-0000-4177-8177-000000000178';
const HUNT = '00000000-0000-4177-8177-0000000001cc';
const prisma = new PrismaClient();
const sessions = createPrismaDocRepo(prisma, 'hunt_session');
const executions = createPrismaDocRepo(prisma, 'playbook_execution');
const evidence = createPrismaDocRepo(prisma, 'hunt_evidence');
const mode = process.env.MODE ?? 'check';

async function state() {
  return {
    session: (await sessions.get(HUNT, T))?.name,
    execution: (await executions.get(HUNT, T))?.playbookId,
    evidence: (await evidence.list(T, HUNT)).length,
    foreignRead: await sessions.get(HUNT, OTHER),
  };
}

if (mode === 'seed') {
  await sessions.save({ id: HUNT, tenantId: T, name: 'S177 acceptance hunt', status: 'draft' });
  await executions.save({ id: HUNT, tenantId: T, playbookId: 'playbook-phishing', steps: [] }); // same id, other kind
  await evidence.save({ id: '00000000-0000-4177-8177-0000000001cd', tenantId: T, huntId: HUNT, type: 'note' }, HUNT);
  let conflict = 'none';
  try { await sessions.save({ id: HUNT, tenantId: OTHER, name: 'hijack' }); } catch (e) { conflict = `${e.statusCode ?? e.status}:${e.code}`; }
  console.log('SEED', JSON.stringify({ ...(await state()), foreignTenantSave: conflict }));
} else if (mode === 'cleanup') {
  const r = await prisma.huntingDoc.deleteMany({ where: { tenantId: { in: [T, OTHER] } } });
  console.log('CLEANUP', r.count);
} else {
  console.log('CHECK', JSON.stringify(await state()));
}
await prisma.$disconnect();
