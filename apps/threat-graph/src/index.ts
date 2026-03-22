import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { disconnectPrisma } from './prisma.js';
import { initNeo4jDriver, closeNeo4jDriver } from './driver.js';
import { GraphRepository } from './repository.js';
import { GraphService } from './service.js';
import { RiskPropagationEngine } from './propagation.js';
import { createGraphSyncQueue, closeGraphSyncQueue } from './queue.js';
import { createGraphSyncWorker } from './queue.js';

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

  // Initialize Neo4j driver
  initNeo4jDriver(config.TI_NEO4J_URL);

  // Create service layer
  const repo = new GraphRepository();
  const propagation = new RiskPropagationEngine(repo, config.TI_GRAPH_PROPAGATION_DECAY, logger);
  const service = new GraphService(repo, propagation, logger);

  // Create BullMQ queue (producer side)
  createGraphSyncQueue();

  // Build Fastify app
  const app = await buildApp({ config, service });

  // Start BullMQ worker (consumer side)
  const worker = createGraphSyncWorker({ service, logger });

  // Graceful shutdown
  app.addHook('onClose', async () => {
    await worker.close();
    await closeGraphSyncQueue();
    await closeNeo4jDriver();
    await disconnectPrisma();
  });

  try {
    const address = await app.listen({ port: config.TI_THREAT_GRAPH_PORT, host: config.TI_THREAT_GRAPH_HOST });
    logger.info(`ETIP Threat Graph Service listening at ${address}`);
  } catch (err) {
    logger.fatal({ err }, 'Failed to start Threat Graph Service');
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
