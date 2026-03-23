import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { HuntingStore } from './schemas/store.js';
import { HuntQueryBuilder } from './services/hunt-query-builder.js';
import { HuntSessionManager } from './services/hunt-session-manager.js';
import { IOCPivotChains } from './services/ioc-pivot-chains.js';
import { SavedHuntLibrary } from './services/saved-hunt-library.js';
import { CorrelationIntegration } from './services/correlation-integration.js';
import { HypothesisEngine } from './services/hypothesis-engine.js';
import { AISuggestions } from './services/ai-suggestions.js';
import { TimelineService } from './services/timeline-service.js';
import { EvidenceCollection } from './services/evidence-collection.js';
import { Collaboration } from './services/collaboration.js';
import { AIPatternRecognition } from './services/ai-pattern-recognition.js';
import { HuntPlaybooks } from './services/hunt-playbooks.js';
import { HuntScoring } from './services/hunt-scoring.js';
import { BulkImport } from './services/bulk-import.js';
import { HuntExport } from './services/hunt-export.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  // 1. Config + Logger
  const env = process.env as unknown as Record<string, string | undefined>;
  const config = loadConfig(env);
  const logger = initLogger(config.TI_LOG_LEVEL);

  logger.info('Starting hunting-service...');

  // 2. Auth secrets
  loadJwtConfig(env);
  loadServiceJwtSecret(env);

  // 3. In-memory store
  const store = new HuntingStore();

  // 4. Domain services
  const queryBuilder = new HuntQueryBuilder({
    defaultTimeRangeDays: config.TI_HUNT_DEFAULT_TIME_RANGE_DAYS,
    maxResults: config.TI_HUNT_MAX_RESULTS,
  });

  const sessionManager = new HuntSessionManager(store, {
    sessionTimeoutHours: config.TI_HUNT_SESSION_TIMEOUT_HOURS,
    maxActiveSessions: config.TI_HUNT_MAX_ACTIVE_SESSIONS,
  });

  const pivotChains = new IOCPivotChains({
    graphServiceUrl: config.TI_GRAPH_SERVICE_URL,
    maxHops: config.TI_HUNT_MAX_PIVOT_HOPS,
    maxResults: config.TI_HUNT_MAX_PIVOT_RESULTS,
  });

  const huntLibrary = new SavedHuntLibrary(store);

  const correlationIntegration = new CorrelationIntegration(store, {
    correlationServiceUrl: config.TI_CORRELATION_SERVICE_URL,
    enabled: config.TI_HUNT_CORRELATION_ENABLED,
  });

  // 4b. P1 services
  const hypothesisEngine = new HypothesisEngine(store);
  const aiSuggestions = new AISuggestions(store, {
    enabled: false,
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 1024,
    budgetCentsPerDay: 50,
  });
  const timelineService = new TimelineService(store);
  const evidenceCollection = new EvidenceCollection(store);
  const collaboration = new Collaboration(store);

  // 4c. P2 services
  const patternRecognition = new AIPatternRecognition(store, {
    enabled: false,
    model: 'claude-sonnet-4-20250514',
    maxTokens: 2048,
    budgetCentsPerDay: 100,
  });
  const huntPlaybooks = new HuntPlaybooks();
  const huntScoring = new HuntScoring(store);
  const bulkImportService = new BulkImport(sessionManager);
  const huntExportService = new HuntExport(store);

  // 5. Build Fastify app
  const app = await buildApp({
    config,
    routeDeps: {
      sessionManager,
      queryBuilder,
      pivotChains,
      huntLibrary,
      correlationIntegration,
    },
    advancedDeps: {
      hypothesisEngine,
      aiSuggestions,
      timelineService,
      evidenceCollection,
      collaboration,
    },
    p2Deps: {
      patternRecognition,
      playbooks: huntPlaybooks,
      huntScoring,
      bulkImport: bulkImportService,
      huntExport: huntExportService,
    },
  });

  // 6. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down hunting-service...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 7. Start listening
  await app.listen({ port: config.TI_HUNTING_PORT, host: config.TI_HUNTING_HOST });
  logger.info({ port: config.TI_HUNTING_PORT }, 'Hunting service ready');
}

main().catch((err) => {
  console.error('Failed to start hunting-service:', err);
  process.exit(1);
});
