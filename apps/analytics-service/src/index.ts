import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { AnalyticsStore } from './services/analytics-store.js';
import { TrendCalculator } from './services/trend-calculator.js';
import { Aggregator } from './services/aggregator.js';

async function main(): Promise<void> {
  // 1. Config + Logger
  const env = process.env as unknown as Record<string, string | undefined>;
  const config = loadConfig(env);
  const logger = initLogger(config.TI_LOG_LEVEL);
  logger.info('Starting analytics-service...');

  // 2. Auth secrets
  loadJwtConfig(env);
  loadServiceJwtSecret(env);

  // 3. Core services (in-memory — DECISION-013)
  const store = new AnalyticsStore();
  const trends = new TrendCalculator(90);
  const aggregator = new Aggregator(store, trends);

  // 4. Seed demo trend data for immediate visualization
  trends.seedDemo('ioc.total', 1200, 200, 30);
  trends.seedDemo('ioc.critical', 45, 15, 30);
  trends.seedDemo('alert.open', 35, 12, 30);
  trends.seedDemo('alert.total', 240, 40, 30);
  trends.seedDemo('feed.active', 8, 2, 30);
  trends.seedDemo('enrichment.rate', 85, 8, 30);
  trends.seedDemo('actor.active', 12, 4, 30);
  trends.seedDemo('malware.families', 28, 8, 30);
  trends.seedDemo('vuln.critical', 15, 5, 30);
  trends.seedDemo('correlation.matches', 65, 20, 30);
  trends.seedDemo('processing.rate', 150, 40, 30);
  logger.info({ metrics: trends.getMetrics().length }, 'Seeded demo trend data');

  // 5. Periodic: purge old cache + trend data
  const maintenanceInterval = setInterval(() => {
    const purgedCache = store.purgeExpired();
    const purgedTrends = trends.purgeOld();
    if (purgedCache > 0 || purgedTrends > 0) {
      logger.debug({ purgedCache, purgedTrends }, 'Maintenance: purged expired data');
    }
  }, 300_000); // every 5 min

  // 6. Build Fastify app with DI
  const app = await buildApp({
    config,
    dashboardDeps: { aggregator },
    trendDeps: { trends },
    executiveDeps: { aggregator, store, trends },
  });

  // 7. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down analytics-service...');
    clearInterval(maintenanceInterval);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

  // 8. Start listening
  await app.listen({ port: config.TI_SERVICE_PORT, host: config.TI_SERVICE_HOST });
  logger.info({ port: config.TI_SERVICE_PORT }, 'Analytics service ready');
}

main().catch((err) => {
  console.error('Failed to start analytics-service:', err);
  process.exit(1);
});
