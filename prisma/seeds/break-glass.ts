/**
 * @module prisma/seeds/break-glass
 * @description Idempotent seed for the break-glass emergency account on the system tenant.
 * Break-glass accounts can ONLY be created via this seed script — never via API.
 *
 * Usage: TI_BREAK_GLASS_EMAIL=breakglass@intelwatch.in TI_BREAK_GLASS_PASSWORD=... npx tsx prisma/seeds/break-glass.ts
 *
 * Env vars:
 *   TI_DATABASE_URL              — Postgres connection string (required)
 *   TI_BREAK_GLASS_EMAIL         — Break-glass email (required)
 *   TI_BREAK_GLASS_PASSWORD      — Break-glass password, min 20 chars (required)
 *   TI_BREAK_GLASS_OTP_SECRET    — TOTP secret for OTP verification (env-only, never in DB)
 */
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { SYSTEM_TENANT_ID } from '@etip/shared-auth';

const BCRYPT_ROUNDS = 12;

async function main(): Promise<void> {
  const email = process.env['TI_BREAK_GLASS_EMAIL'];
  const password = process.env['TI_BREAK_GLASS_PASSWORD'];
  const otpSecret = process.env['TI_BREAK_GLASS_OTP_SECRET'];

  if (!email || !password) {
    console.warn('⚠ TI_BREAK_GLASS_EMAIL and TI_BREAK_GLASS_PASSWORD not set. Skipping break-glass account creation.');
    return;
  }

  if (password.length < 20) {
    console.error('✖ TI_BREAK_GLASS_PASSWORD must be at least 20 characters.');
    process.exit(1);
  }

  if (!otpSecret) {
    console.warn('⚠ TI_BREAK_GLASS_OTP_SECRET not set. Break-glass login will fail without it.');
  }

  const prisma = new PrismaClient();

  try {
    // Verify system tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id: SYSTEM_TENANT_ID } });
    if (!tenant) {
      console.error('✖ System tenant not found. Run system-tenant seed first.');
      process.exit(1);
    }

    const passwordHash = await hash(password, BCRYPT_ROUNDS);

    // Idempotent upsert — safe to run multiple times
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: SYSTEM_TENANT_ID, email } },
      update: {
        passwordHash,
        role: 'super_admin',
        active: true,
        isBreakGlass: true,
        mfaEnabled: false,
        emailVerified: true,
      },
      create: {
        tenantId: SYSTEM_TENANT_ID,
        email,
        displayName: 'Break-Glass Emergency',
        passwordHash,
        role: 'super_admin',
        authProvider: 'email',
        isBreakGlass: true,
        mfaEnabled: false,
        active: true,
        emailVerified: true,
      },
    });

    console.info(`✓ Break-glass account ready: ${user.id} (${user.email})`);
    console.info('  isBreakGlass: true, role: super_admin, mfaEnabled: false');

    // Audit log (never log the password)
    await prisma.auditLog.create({
      data: {
        tenantId: SYSTEM_TENANT_ID,
        action: 'BREAK_GLASS_SEED_EXECUTED',
        entityType: 'user',
        entityId: user.id,
        changes: {
          email,
          riskLevel: 'critical',
          timestamp: new Date().toISOString(),
          otpSecretConfigured: !!otpSecret,
        },
      },
    });
    console.info('✓ Break-glass seed audit log created.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('✖ Break-glass seed failed:', err);
  process.exit(1);
});
