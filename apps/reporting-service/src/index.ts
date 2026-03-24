import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { ReportStore } from './services/report-store.js';
import { ScheduleStore } from './services/schedule-store.js';
import { TemplateStore } from './services/template-store.js';
import { DataAggregator } from './services/data-aggregator.js';
import { TemplateEngine } from './services/template-engine.js';
import { ReportWorker } from './workers/report-worker.js';
import { RetentionCron } from './services/retention-cron.js';

async function main(): Promise<void> {
  // 1. Config + Logger
  const env = process.env as unknown as Record<string, string | undefined>;
  const config = loadConfig(env);
  const logger = initLogger(config.TI_LOG_LEVEL);
  logger.info('Starting reporting-service...');

  // 2. Auth secrets
  loadJwtConfig(env);
  loadServiceJwtSecret(env);

  // 3. Core services (in-memory — DECISION-013)
  const reportStore = new ReportStore(config.TI_REPORT_MAX_PER_TENANT, config.TI_REPORT_RETENTION_DAYS);
  const scheduleStore = new ScheduleStore();
  const templateStore = new TemplateStore();
  const dataAggregator = new DataAggregator();
  const templateEngine = new TemplateEngine();

  // 4. Retention cron (purge expired reports every hour)
  const retentionCron = new RetentionCron(reportStore);
  retentionCron.start();

  // 5. BullMQ worker
  const reportWorker = new ReportWorker({
    reportStore,
    templateStore,
    dataAggregator,
    templateEngine,
    redisUrl: config.TI_REDIS_URL,
  });
  reportWorker.start();

  // 6. Wire schedule callbacks to enqueue report generation
  scheduleStore.setCallback((schedule) => {
    const report = reportStore.create({
      type: schedule.reportType,
      format: schedule.format,
      tenantId: schedule.tenantId,
      filters: schedule.filters as Record<string, unknown> & {
        severities?: ('critical' | 'high' | 'medium' | 'low' | 'info')[];
        iocTypes?: string[];
        feedIds?: string[];
        tags?: string[];
      },
      configVersion: schedule.configVersion,
    });
    reportWorker.enqueue(report).catch((err) => {
      logger.error({ scheduleId: schedule.id, error: (err as Error).message }, 'Scheduled report enqueue failed');
    });
  });

  // 7. Build Fastify app with DI
  const app = await buildApp({
    config,
    reportDeps: { reportStore, reportWorker },
    scheduleDeps: { scheduleStore },
    templateDeps: { templateStore },
    statsDeps: { reportStore, scheduleStore },
  });

  // 8. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down reporting-service...');
    retentionCron.stop();
    scheduleStore.stopAll();
    await reportWorker.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

  // 9. Start listening
  await app.listen({ port: config.TI_SERVICE_PORT, host: config.TI_SERVICE_HOST });
  logger.info({ port: config.TI_SERVICE_PORT }, 'Reporting service ready');
}

main().catch((err) => {
  console.error('Failed to start reporting-service:', err);
  process.exit(1);
});
