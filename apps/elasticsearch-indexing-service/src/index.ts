import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  // 1. Config + Logger
  const env = process.env as unknown as Record<string, string | undefined>;
  const config = loadConfig(env);
  const logger = initLogger(config.TI_LOG_LEVEL);
  logger.info('Starting elasticsearch-indexing-service...');

  // 2. Auth secrets
  loadJwtConfig(env);
  loadServiceJwtSecret(env);

  // 3. Build Fastify app (wires ES client, BullMQ worker, routes)
  const app = await buildApp({ config });

  // 4. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down elasticsearch-indexing-service...');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

  // 5. Start listening
  await app.listen({ port: config.TI_ES_SERVICE_PORT, host: config.TI_ES_SERVICE_HOST });
  logger.info({ port: config.TI_ES_SERVICE_PORT }, 'Elasticsearch indexing service ready');
}

main().catch((err) => {
  console.error('Failed to start elasticsearch-indexing-service:', err);
  process.exit(1);
});
