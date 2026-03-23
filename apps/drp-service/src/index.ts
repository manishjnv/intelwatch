import { loadConfig } from './config.js';
import { initLogger, getLogger } from './logger.js';
import { DRPStore } from './schemas/store.js';
import { AssetManager } from './services/asset-manager.js';
import { AlertManager } from './services/alert-manager.js';
import { TyposquatDetector } from './services/typosquat-detector.js';
import { DarkWebMonitor } from './services/dark-web-monitor.js';
import { CredentialLeakDetector } from './services/credential-leak-detector.js';
import { AttackSurfaceScanner } from './services/attack-surface-scanner.js';
import { ConfidenceScorer } from './services/confidence-scorer.js';
import { SignalAggregator } from './services/signal-aggregator.js';
import { EvidenceChainBuilder } from './services/evidence-chain.js';
import { AlertDeduplication } from './services/alert-deduplication.js';
import { SeverityClassifier } from './services/severity-classifier.js';
import { DRPGraphIntegration } from './services/graph-integration.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env as Record<string, string | undefined>);
  const logger = initLogger(config.TI_LOG_LEVEL);

  // In-memory store (DECISION-013)
  const store = new DRPStore();

  // P0 improvement services
  const confidenceScorer = new ConfidenceScorer();
  const signalAggregator = new SignalAggregator(store);
  const evidenceChain = new EvidenceChainBuilder(store);
  const deduplication = new AlertDeduplication(store);
  const severityClassifier = new SeverityClassifier(store);

  // Core services
  const assetManager = new AssetManager(store, {
    maxAssetsPerTenant: config.TI_DRP_MAX_ASSETS_PER_TENANT,
  });
  const alertManager = new AlertManager(store, {
    confidenceScorer,
    signalAggregator,
    evidenceChain,
    deduplication,
    severityClassifier,
  });
  const typosquatDetector = new TyposquatDetector({
    maxCandidates: config.TI_DRP_MAX_TYPOSQUAT_CANDIDATES,
  });
  const darkWebMonitor = new DarkWebMonitor(store);
  const credentialLeakDetector = new CredentialLeakDetector(store);
  const attackSurfaceScanner = new AttackSurfaceScanner(store);
  const graphIntegration = new DRPGraphIntegration({
    graphServiceUrl: config.TI_GRAPH_SERVICE_URL,
    syncEnabled: config.TI_DRP_GRAPH_SYNC_ENABLED,
    maxRetries: 3,
    retryDelayMs: 1000,
  });

  const app = await buildApp({
    config,
    assetDeps: { assetManager },
    alertDeps: {
      alertManager,
      signalAggregator,
      confidenceScorer,
      evidenceChain,
    },
    detectionDeps: {
      assetManager,
      alertManager,
      typosquatDetector,
      darkWebMonitor,
      credentialLeakDetector,
      attackSurfaceScanner,
      graphIntegration,
      store,
    },
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down DRP service');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await app.listen({ port: config.TI_DRP_PORT, host: config.TI_DRP_HOST });
  logger.info(
    { port: config.TI_DRP_PORT, host: config.TI_DRP_HOST },
    'DRP service ready',
  );
}

main().catch((err) => {
  const logger = getLogger();
  logger.fatal({ err }, 'DRP service failed to start');
  process.exit(1);
});
