/**
 * Break-glass emergency account seed — self-contained, no workspace deps.
 * Run: node prisma/seeds/break-glass-seed.mjs
 */
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes, pbkdf2Sync } from 'node:crypto';

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000';

/** bcryptjs-compatible hash using Node crypto (bcrypt $2a$ format) */
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
  return mod.hash(password, 12);
}

async function main() {
  const email = process.env['TI_BREAK_GLASS_EMAIL'];
  const password = process.env['TI_BREAK_GLASS_PASSWORD'];
  const otpSecret = process.env['TI_BREAK_GLASS_OTP_SECRET'];

  if (!email || !password) {
    console.warn('⚠ TI_BREAK_GLASS_EMAIL and TI_BREAK_GLASS_PASSWORD not set. Skipping.');
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
    const tenant = await prisma.tenant.findUnique({ where: { id: SYSTEM_TENANT_ID } });
    if (!tenant) {
      console.error('✖ System tenant not found. Run system-tenant seed first.');
      process.exit(1);
    }

    const passwordHash = await hashPassword(password);

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
