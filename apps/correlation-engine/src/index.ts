import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { CorrelationStore } from './schemas/correlation.js';
import { CooccurrenceService } from './services/cooccurrence.js';
import { InfrastructureClusterService } from './services/infrastructure-cluster.js';
import { TemporalWaveService } from './services/temporal-wave.js';
import { TTPSimilarityService } from './services/ttp-similarity.js';
import { CampaignClusterService } from './services/campaign-cluster.js';
import { ConfidenceScoringService } from './services/confidence-scoring.js';
import { DiamondModelService } from './services/diamond-model.js';
import { KillChainService } from './services/kill-chain.js';
import { FPSuppressionService } from './services/fp-suppression.js';
import { RelationshipInferenceService } from './services/relationship-inference.js';
import { AIPatternDetectionService } from './services/ai-pattern-detection.js';
import { RuleTemplateService } from './services/rule-templates.js';
import { ConfidenceDecayService } from './services/confidence-decay.js';
import { BatchRecorrelationService } from './services/batch-recorrelation.js';
import { GraphIntegrationService } from './services/graph-integration.js';
import { createCorrelateQueue, closeCorrelateQueue, createCorrelateWorker, createDownstreamQueues, closeDownstreamQueues } from './workers/correlate.js';

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

  // Initialize in-memory store
  const store = new CorrelationStore();

  // Create services with config tunables
  const cooccurrence = new CooccurrenceService({
    windowHours: config.TI_CORRELATION_WINDOW_HOURS, minSources: 2,
  });
  const infraCluster = new InfrastructureClusterService();
  const temporalWave = new TemporalWaveService({
    zScoreThreshold: config.TI_CORRELATION_ZSCORE_THRESHOLD,
  });
  const ttpSimilarity = new TTPSimilarityService();
  const campaignCluster = new CampaignClusterService({
    epsilon: config.TI_CORRELATION_DBSCAN_EPSILON,
    minPoints: config.TI_CORRELATION_DBSCAN_MIN_PTS,
  }, cooccurrence, ttpSimilarity);
  const confidenceScoring = new ConfidenceScoringService();
  const diamondModel = new DiamondModelService();
  const killChain = new KillChainService();
  const fpSuppression = new FPSuppressionService({
    fpThreshold: config.TI_CORRELATION_FP_THRESHOLD,
    minSamples: config.TI_CORRELATION_FP_MIN_SAMPLES,
  });
  void new RelationshipInferenceService({
    decayFactor: config.TI_CORRELATION_INFERENCE_DECAY,
    maxDepth: config.TI_CORRELATION_INFERENCE_MAX_DEPTH,
    minConfidence: config.TI_CORRELATION_INFERENCE_MIN_CONF,
  });

  // P2 services (#11-15)
  const aiPatternDetection = new AIPatternDetectionService(
    config.TI_ANTHROPIC_API_KEY,
    config.TI_CORRELATION_AI_ENABLED === 'true',
    logger,
    config.TI_CORRELATION_AI_MODEL,
    config.TI_CORRELATION_AI_MAX_TOKENS,
    config.TI_CORRELATION_AI_DAILY_BUDGET_USD,
  );
  const ruleTemplates = new RuleTemplateService();
  const confidenceDecay = new ConfidenceDecayService();
  const batchRecorrelation = new BatchRecorrelationService({
    store, cooccurrence, infraCluster, temporalWave,
    campaignCluster, fpSuppression, confidenceScoring,
    confidenceThreshold: config.TI_CORRELATION_CONFIDENCE_THRESHOLD,
    windowHours: config.TI_CORRELATION_WINDOW_HOURS,
  });
  const graphIntegration = new GraphIntegrationService({
    graphServiceUrl: config.TI_GRAPH_SERVICE_URL,
    syncEnabled: config.TI_GRAPH_SYNC_ENABLED === 'true',
    maxRelationshipsPerBatch: 1000,
    maxRetries: 3,
    retryDelayMs: 1000,
  }, logger);

  // Build Fastify app
  const app = await buildApp({
    config,
    routeDeps: {
      store, cooccurrence, infraCluster, temporalWave,
      campaignCluster, diamondModel, killChain, fpSuppression,
      confidenceScoring,
      windowHours: config.TI_CORRELATION_WINDOW_HOURS,
      confidenceThreshold: config.TI_CORRELATION_CONFIDENCE_THRESHOLD,
    },
    advancedDeps: {
      store, aiPatternDetection, ruleTemplates,
      confidenceDecay, batchRecorrelation, graphIntegration,
    },
  });

  // BullMQ queue + worker (not in test mode)
  if (config.TI_NODE_ENV !== 'test') {
    createCorrelateQueue();
    const downstream = createDownstreamQueues();
    logger.info({
      alertEvaluate: !!downstream.alertEvaluate,
      integrationPush: !!downstream.integrationPush,
    }, 'Downstream queues initialized');
    createCorrelateWorker({
      store, cooccurrence, infraCluster, temporalWave,
      campaignCluster, fpSuppression, confidenceScoring, logger,
      downstream,
    });
  }

  // Graceful shutdown
  app.addHook('onClose', async () => {
    logger.info('Shutting down correlation engine...');
    await closeDownstreamQueues();
    await closeCorrelateQueue();
  });

  // Start listening
  await app.listen({ port: config.TI_CORRELATION_PORT, host: config.TI_CORRELATION_HOST });
  logger.info({ port: config.TI_CORRELATION_PORT }, 'Correlation engine started');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received signal, shutting down');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start correlation engine:', err);
  process.exit(1);
});
