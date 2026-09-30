import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { HuntingStore } from './schemas/store.js';
import { prisma, disconnectPrisma } from './prisma.js';
import { createPrismaDocRepo } from './doc-repo-prisma.js';
import { HuntQueryBuilder } from './services/hunt-query-builder.js';
import { HuntSessionManager } from './services/hunt-session-manager.js';
import { IOCPivotChains } from './services/ioc-pivot-chains.js';
import { SavedHuntLibrary } from './services/saved-hunt-library.js';
import { CorrelationIntegration } from './services/correlation-integration.js';
import { HypothesisEngine, type HypothesisDoc } from './services/hypothesis-engine.js';
import { AISuggestions } from './services/ai-suggestions.js';
import { TimelineService } from './services/timeline-service.js';
import { EvidenceCollection, type EvidenceDoc } from './services/evidence-collection.js';
import { Collaboration, type CommentDoc, type ShareDoc } from './services/collaboration.js';
import { AIPatternRecognition } from './services/ai-pattern-recognition.js';
import { HuntPlaybooks, type ExecutionDoc } from './services/hunt-playbooks.js';
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

  // 3. Store — Postgres-backed doc store when TI_DATABASE_URL is set, else in-memory (dev only)
  // Step 3 S159, DECISION-051: one generic JSON-document table shared across kinds.
  const usePostgres = !!config.TI_DATABASE_URL;
  if (usePostgres) {
    await prisma.$connect();
    logger.info('Hunting persistence: Postgres');
  } else {
    logger.warn('Hunting persistence: memory (dev only, data lost on restart)');
  }

  const store = new HuntingStore(
    usePostgres
      ? {
        sessions: createPrismaDocRepo(prisma, 'hunt_session'),
        templates: createPrismaDocRepo(prisma, 'hunt_template'),
        leads: createPrismaDocRepo(prisma, 'correlation_lead'),
      }
      : undefined,
  );
  const playbooksRepo = usePostgres ? createPrismaDocRepo<ExecutionDoc>(prisma, 'playbook_execution') : undefined;
  const evidenceRepo = usePostgres ? createPrismaDocRepo<EvidenceDoc>(prisma, 'hunt_evidence') : undefined;
  const hypothesisRepo = usePostgres ? createPrismaDocRepo<HypothesisDoc>(prisma, 'hunt_hypothesis') : undefined;
  const commentsRepo = usePostgres ? createPrismaDocRepo<CommentDoc>(prisma, 'hunt_comment') : undefined;
  const sharesRepo = usePostgres ? createPrismaDocRepo<ShareDoc>(prisma, 'hunt_share') : undefined;

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
  const hypothesisEngine = new HypothesisEngine(store, hypothesisRepo);
  const aiSuggestions = new AISuggestions(store, {
    enabled: false,
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 1024,
    budgetCentsPerDay: 50,
  });
  const timelineService = new TimelineService(store);
  const evidenceCollection = new EvidenceCollection(store, evidenceRepo);
  const collaboration = new Collaboration(store, { comments: commentsRepo, shares: sharesRepo });

  // 4c. P2 services
  const patternRecognition = new AIPatternRecognition(store, {
    enabled: false,
    model: 'claude-sonnet-4-20250514',
    maxTokens: 2048,
    budgetCentsPerDay: 100,
  });
  const huntPlaybooks = new HuntPlaybooks(playbooksRepo);
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
      sessionManager,
    },
  });

  // 6. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down hunting-service...');
    await app.close();
    if (config.TI_DATABASE_URL) await disconnectPrisma();
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
