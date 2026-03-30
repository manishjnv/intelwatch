/**
 * System tenant + super admin seed — self-contained, no workspace deps.
 * Run: node prisma/seeds/system-tenant-seed.mjs
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const SYSTEM_TENANT_NAME = 'IntelWatch Platform';
const SYSTEM_TENANT_SLUG = 'intelwatch-system';
const BCRYPT_ROUNDS = 12;

async function hashPassword(password) {
  let bcryptjs;
  try {
    bcryptjs = await import('bcryptjs');
  } catch {
    try {
      bcryptjs = await import('/app/node_modules/.pnpm/bcryptjs@2.4.3/node_modules/bcryptjs/index.js');
    } catch {
      console.error('bcryptjs not found — cannot hash password.');
      process.exit(1);
    }
  }
  const mod = bcryptjs.default || bcryptjs;
  return mod.hash(password, BCRYPT_ROUNDS);
}

async function main() {
  const email = process.env['TI_SUPER_ADMIN_EMAIL'];
  const password = process.env['TI_SUPER_ADMIN_PASSWORD'];

  if (!email || !password) {
    console.warn('TI_SUPER_ADMIN_EMAIL and TI_SUPER_ADMIN_PASSWORD must be set. Skipping super_admin creation.');
    console.info('System tenant will still be created/verified.');
  }

  if (password && password.length < 12) {
    console.error('TI_SUPER_ADMIN_PASSWORD must be at least 12 characters.');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const tenant = await prisma.tenant.upsert({
      where: { id: SYSTEM_TENANT_ID },
      update: { name: SYSTEM_TENANT_NAME },
      create: {
        id: SYSTEM_TENANT_ID,
        name: SYSTEM_TENANT_NAME,
        slug: SYSTEM_TENANT_SLUG,
        plan: 'enterprise',
        maxUsers: 100,
        maxFeedsPerDay: 10000,
        maxIOCs: 1000000,
        aiCreditsMonthly: 100000,
      },
    });
    console.info(`System tenant ready: ${tenant.id} (${tenant.name})`);

    if (email && password) {
      const passwordHash = await hashPassword(password);

      const user = await prisma.user.upsert({
        where: { tenantId_email: { tenantId: SYSTEM_TENANT_ID, email } },
        update: { passwordHash, role: 'super_admin', active: true },
        create: {
          tenantId: SYSTEM_TENANT_ID,
          email,
          displayName: 'Super Admin',
          passwordHash,
          role: 'super_admin',
          authProvider: 'email',
        },
      });
      console.info(`Super admin ready: ${user.id} (${user.email})`);
    }

    await prisma.auditLog.create({
      data: {
        tenantId: SYSTEM_TENANT_ID,
        action: 'SYSTEM_SEED_EXECUTED',
        entityType: 'tenant',
        entityId: SYSTEM_TENANT_ID,
        changes: { email: email ?? 'none', timestamp: new Date().toISOString() },
      },
    });
    console.info('Seed audit log created.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('System tenant seed failed:', err);
  process.exit(1);
});
