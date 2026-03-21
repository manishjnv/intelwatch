import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { prisma, disconnectPrisma } from './prisma.js';
import { ActorRepository } from './repository.js';
import { ActorService } from './service.js';
import { ActorServiceP2 } from './service-p2.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const logger = initLogger(config.TI_LOG_LEVEL);

  loadJwtConfig({
    TI_JWT_SECRET: config.TI_JWT_SECRET,
    TI_JWT_ISSUER: config.TI_JWT_ISSUER,
    TI_JWT_ACCESS_EXPIRY: String(config.TI_JWT_ACCESS_EXPIRY),
    TI_JWT_REFRESH_EXPIRY: String(config.TI_JWT_REFRESH_EXPIRY),
  });
  loadServiceJwtSecret({ TI_SERVICE_JWT_SECRET: config.TI_SERVICE_JWT_SECRET });

  const repo = new ActorRepository(prisma);
  const service = new ActorService(repo, prisma);
  const serviceP2 = new ActorServiceP2(service, repo, prisma);
  const app = await buildApp({ config, service, serviceP2 });

  app.addHook('onClose', async () => {
    await disconnectPrisma();
  });

  try {
    const address = await app.listen({ port: config.TI_THREAT_ACTOR_INTEL_PORT, host: config.TI_THREAT_ACTOR_INTEL_HOST });
    logger.info(`ETIP Threat Actor Intel Service listening at ${address}`);
  } catch (err) {
    logger.fatal({ err }, 'Failed to start Threat Actor Intel Service');
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal} — shutting down gracefully`);
    try { await app.close(); logger.info('Server closed'); process.exit(0); }
    catch (err) { logger.error({ err }, 'Error during shutdown'); process.exit(1); }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => { console.error('Fatal startup error:', err); process.exit(1); });
