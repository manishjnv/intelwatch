import { loadConfig } from './config.js';
import { initLogger } from './logger.js';
import { loadJwtConfig, loadServiceJwtSecret } from '@etip/shared-auth';
import { buildApp } from './app.js';
import { WizardStore } from './services/wizard-store.js';
import { ConnectorValidator } from './services/connector-validator.js';
import { HealthChecker } from './services/health-checker.js';
import { ModuleReadinessChecker } from './services/module-readiness.js';
import { ProgressTracker } from './services/progress-tracker.js';
import { PrerequisiteValidator } from './services/prerequisite-validator.js';
import { DemoSeeder } from './services/demo-seeder.js';
import { IntegrationTester } from './services/integration-tester.js';
import { ChecklistPersistence } from './services/checklist-persistence.js';
import { WelcomeDashboardService } from './services/welcome-dashboard.js';

async function main(): Promise<void> {
  // 1. Config + Logger
  const env = process.env as unknown as Record<string, string | undefined>;
  const config = loadConfig(env);
  const logger = initLogger(config.TI_LOG_LEVEL);
  logger.info('Starting onboarding-service...');

  // 2. Auth secrets
  loadJwtConfig(env);
  loadServiceJwtSecret(env);

  // 3. Core services
  const wizardStore = new WizardStore();
  const healthChecker = new HealthChecker();
  const moduleReadiness = new ModuleReadinessChecker();
  const progressTracker = new ProgressTracker(wizardStore, moduleReadiness, healthChecker);

  // 4. Connector services
  const connectorValidator = new ConnectorValidator(wizardStore);
  const integrationTester = new IntegrationTester(wizardStore);

  // 5. P0 services
  const prerequisiteValidator = new PrerequisiteValidator(moduleReadiness);
  const demoSeeder = new DemoSeeder();
  const checklistPersistence = new ChecklistPersistence(wizardStore);
  const welcomeDashboard = new WelcomeDashboardService(wizardStore, progressTracker, demoSeeder);

  // 6. Build Fastify app
  const app = await buildApp({
    config,
    wizardDeps: { wizardStore, checklistPersistence },
    connectorDeps: { connectorValidator, integrationTester },
    pipelineDeps: { healthChecker, progressTracker },
    moduleDeps: { moduleReadiness, prerequisiteValidator },
    welcomeDeps: { welcomeDashboard, demoSeeder, checklistPersistence },
  });

  // 7. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down...');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 8. Start listening
  await app.listen({ port: config.TI_ONBOARDING_PORT, host: config.TI_ONBOARDING_HOST });
  logger.info({ port: config.TI_ONBOARDING_PORT }, 'Onboarding service ready');
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
