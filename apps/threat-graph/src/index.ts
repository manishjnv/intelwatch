import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { disconnectPrisma } from './prisma.js';
import { initNeo4jDriver, closeNeo4jDriver } from './driver.js';
import { runGraphMigrations } from './migrations/runner.js';
import { GraphRepository } from './repository.js';
import { GraphService } from './service.js';
import { RiskPropagationEngine } from './propagation.js';
import { createGraphSyncQueue, closeGraphSyncQueue } from './queue.js';
import { createGraphSyncWorker } from './queue.js';
import { AuditTrailService } from './services/audit-trail.js';
import { BidirectionalService } from './services/bidirectional.js';
import { ClusterDetectionService } from './services/cluster-detection.js';
import { ImpactRadiusService } from './services/impact-radius.js';
import { GraphDiffService } from './services/graph-diff.js';
import { ExpandNodeService } from './services/expand-node.js';
import { StixExportService } from './services/stix-export.js';
import { GraphSearchService } from './services/graph-search.js';
import { NodeMergeService } from './services/node-merge.js';
import { BatchImportService } from './services/batch-import.js';
import { DecayCronService } from './services/decay-cron.js';
import { LayoutPresetsService } from './services/layout-presets.js';
import { RelationshipTrendingService } from './services/relationship-trending.js';
import { IocClient } from './clients/ioc-client.js';
import { GraphSyncWriter } from './services/graph-sync.js';
import { IocSyncService } from './services/ioc-sync-service.js';
import { GraphReconciler } from './services/graph-reconciler.js';

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

  // Run versioned graph migrations (P3a). Read APIs must stay up even if
  // this fails, so we log and continue booting rather than exit(1); 3b's
  // reconciler checks getMigrationStatus() before it starts and refuses to
  // run against an un-migrated graph.
  try {
    await runGraphMigrations(logger);
  } catch (err) {
    logger.error({ err }, 'Graph migrations failed — continuing boot with degraded graph state');
  }

  // Create service layer
  const repo = new GraphRepository();
  const propagation = new RiskPropagationEngine(repo, config.TI_GRAPH_PROPAGATION_DECAY, logger);
  const service = new GraphService(repo, propagation, logger);

  // P1+P2 services
  const auditTrail = new AuditTrailService();
  propagation.onAudit((entry) => auditTrail.record(entry));

  const bidirectional = new BidirectionalService();
  const clusterDetection = new ClusterDetectionService();
  const impactRadius = new ImpactRadiusService(repo, propagation);
  const graphDiff = new GraphDiffService();
  const expandNode = new ExpandNodeService();
  const stixExport = new StixExportService(repo);
  const graphSearch = new GraphSearchService();

  // #16-20 services
  const nodeMerge = new NodeMergeService(repo, service, logger);
  const batchImport = new BatchImportService(service, logger);
  const decayCron = new DecayCronService(
    propagation, config.TI_GRAPH_DECAY_CRON_INTERVAL, config.TI_GRAPH_DECAY_THRESHOLD, logger,
  );
  const layoutPresets = new LayoutPresetsService(config.TI_GRAPH_MAX_LAYOUT_PRESETS);
  const trending = new RelationshipTrendingService();

  // S171 P3b: IOC → graph sync (client, mapper is stateless, writer, sync service, reconciler)
  const iocClient = new IocClient(config.TI_IOC_SERVICE_URL, logger);
  const syncWriter = new GraphSyncWriter();
  const iocSync = new IocSyncService(iocClient, syncWriter, logger);
  const reconciler = new GraphReconciler(iocClient, syncWriter, {
    intervalMs: config.TI_GRAPH_RECONCILE_INTERVAL_MS,
    fullSyncIntervalMs: config.TI_GRAPH_FULL_SYNC_INTERVAL_MS,
    pageSize: config.TI_GRAPH_RECONCILE_PAGE_SIZE,
  }, logger);

  // Create BullMQ queue (producer side)
  createGraphSyncQueue();

  // Build Fastify app
  const app = await buildApp({
    config, service, reconciler,
    extendedDeps: {
      repo, bidirectional, clusterDetection, impactRadius,
      graphDiff, expandNode, stixExport, graphSearch, auditTrail, trending,
    },
    operationDeps: {
      repo, nodeMerge, batchImport, decayCron, layoutPresets, trending,
    },
  });

  // Start BullMQ worker (consumer side)
  const worker = createGraphSyncWorker({ service, iocSync, logger });

  // Start decay cron (#18)
  if (config.TI_NODE_ENV !== 'test') {
    decayCron.start();
  }

  // Start IOC→graph reconciler (S171 P3b)
  if (config.TI_GRAPH_RECONCILE_ENABLED && config.TI_NODE_ENV !== 'test') {
    reconciler.start();
  }

  // Graceful shutdown
  app.addHook('onClose', async () => {
    decayCron.stop();
    reconciler.stop();
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
