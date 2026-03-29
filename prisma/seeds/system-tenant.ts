/**
 * @module prisma/seeds/system-tenant
 * @description Idempotent seed script for the IntelWatch system tenant and super_admin user.
 * Super admin accounts are provisioned here — never via the registration endpoint.
 *
 * Usage: TI_SUPER_ADMIN_EMAIL=admin@intelwatch.in TI_SUPER_ADMIN_PASSWORD=... npx tsx prisma/seeds/system-tenant.ts
 *
 * Env vars:
 *   TI_DATABASE_URL          — Postgres connection string (required)
 *   TI_SUPER_ADMIN_EMAIL     — Super admin email (required)
 *   TI_SUPER_ADMIN_PASSWORD  — Super admin password, min 12 chars (required)
 */
import { PrismaClient } from '@prisma/client';
import { createHmac, randomBytes } from 'crypto';
import { hash } from 'bcryptjs';

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const SYSTEM_TENANT_NAME = 'IntelWatch Platform';
const SYSTEM_TENANT_SLUG = 'intelwatch-system';
const BCRYPT_ROUNDS = 12;

async function main(): Promise<void> {
  const email = process.env['TI_SUPER_ADMIN_EMAIL'];
  const password = process.env['TI_SUPER_ADMIN_PASSWORD'];

  if (!email || !password) {
    console.warn('⚠ TI_SUPER_ADMIN_EMAIL and TI_SUPER_ADMIN_PASSWORD must be set. Skipping super_admin creation.');
    console.info('System tenant will still be created/verified.');
  }

  if (password && password.length < 12) {
    console.error('✖ TI_SUPER_ADMIN_PASSWORD must be at least 12 characters.');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    // 1. Upsert system tenant
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
    console.info(`✓ System tenant ready: ${tenant.id} (${tenant.name})`);

    // 2. Upsert super_admin user (if credentials provided)
    if (email && password) {
      const passwordHash = await hash(password, BCRYPT_ROUNDS);

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
      console.info(`✓ Super admin ready: ${user.id} (${user.email})`);
    }

    // 3. Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: SYSTEM_TENANT_ID,
        action: 'SYSTEM_SEED_EXECUTED',
        entityType: 'tenant',
        entityId: SYSTEM_TENANT_ID,
        changes: { email: email ?? 'none', timestamp: new Date().toISOString() },
      },
    });
    console.info('✓ Seed audit log created.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('✖ System tenant seed failed:', err);
  process.exit(1);
});
