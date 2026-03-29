import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { PermissionStore } from './services/permission-store.js';
import { TeamStore } from './services/team-store.js';
import { SsoService } from './services/sso-service.js';
import { MfaService } from './services/mfa-service.js';
import { AuditLogger } from './services/audit-logger.js';
import { BreakGlassService } from './services/break-glass-service.js';
import { SessionManager } from './services/session-manager.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  // 1. Config + Logger
  const env = process.env as unknown as Record<string, string | undefined>;
  const config = loadConfig(env);
  const logger = initLogger(config.TI_LOG_LEVEL);

  logger.info('Starting user-management-service...');

  // 2. Auth secrets
  loadJwtConfig(env);
  loadServiceJwtSecret(env);

  // 3. In-memory services
  const auditLogger = new AuditLogger();
  const permissionStore = new PermissionStore();
  const teamStore = new TeamStore(permissionStore);
  const ssoService = new SsoService();
  const mfaService = new MfaService(config.TI_MFA_ISSUER, config.TI_MFA_BACKUP_CODE_COUNT);
  const breakGlassService = new BreakGlassService(auditLogger, config.TI_BREAK_GLASS_SESSION_TTL_MIN);
  const sessionManager = new SessionManager();

  // 4. Build Fastify app
  const app = await buildApp({
    config,
    permissionDeps: { permissionStore, auditLogger },
    teamDeps: { teamStore, auditLogger },
    ssoDeps: { ssoService, auditLogger },
    mfaDeps: { mfaService, auditLogger, teamStore },
    breakGlassDeps: { breakGlassService },
    sessionDeps: { sessionManager, auditLogger },
    apiKeyDeps: { auditLogger },
  });

  // 5. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down user-management-service...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 6. Start listening
  await app.listen({ port: config.TI_USER_MANAGEMENT_PORT, host: config.TI_USER_MANAGEMENT_HOST });
  logger.info({ port: config.TI_USER_MANAGEMENT_PORT }, 'User management service ready');
}

main().catch((err) => {
  console.error('Failed to start user-management-service:', err);
  process.exit(1);
});
