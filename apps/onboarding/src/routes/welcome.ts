import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { WelcomeDashboardService } from '../services/welcome-dashboard.js';
import type { RealSeeder } from '../services/real-seeder.js';
import type { ChecklistPersistence } from '../services/checklist-persistence.js';

export interface WelcomeRouteDeps {
  welcomeDashboard: WelcomeDashboardService;
  realSeeder?: RealSeeder;
  checklistPersistence: ChecklistPersistence;
}

export function welcomeRoutes(deps: WelcomeRouteDeps) {
  const { welcomeDashboard, realSeeder, checklistPersistence } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /welcome — Get personalized welcome dashboard. */
    app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const dashboard = await welcomeDashboard.getDashboard(tenantId);
      return reply.send({ data: dashboard });
    });

    /** GET /welcome/tips — Get guided tips (optional category filter). */
    app.get('/tips', async (req: FastifyRequest<{ Querystring: { category?: string } }>, reply: FastifyReply) => {
      const category = (req.query as Record<string, string>).category;
      const tips = welcomeDashboard.getTips(category);
      return reply.send({ data: tips, total: tips.length });
    });

    /** POST /welcome/seed-demo — Subscribe tenant to starter feeds via RealSeeder.
     * No fabricated data (DECISION-048). Feature flag: TI_REAL_SEEDER_ENABLED. */
    app.post('/seed-demo', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const planTier = ((req.body as Record<string, unknown>)?.planTier as string) || 'free';

      const realEnabled = process.env.TI_REAL_SEEDER_ENABLED !== 'false';
      if (!realEnabled || !realSeeder) {
        throw new AppError(503, 'Starter feed setup is unavailable', 'SEEDER_UNAVAILABLE');
      }

      const result = await realSeeder.seedTenant(tenantId, planTier);
      return reply.status(201).send({ data: { ...result, seederUsed: 'real' as const } });
    });

    /** POST /welcome/tour-complete — Mark guided tour as completed. */
    app.post('/tour-complete', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      await welcomeDashboard.markTourCompleted(tenantId);
      return reply.send({ data: { completed: true } });
    });

    /** GET /welcome/should-show — Check if welcome screen should display. */
    app.get('/should-show', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const show = welcomeDashboard.shouldShowWelcome(tenantId);
      const tourDone = await welcomeDashboard.isTourCompleted(tenantId);
      return reply.send({ data: { showWelcome: show, tourCompleted: tourDone } });
    });

    /** POST /welcome/save-state — Save onboarding state. */
    app.post('/save-state', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const snapshot = await checklistPersistence.save(tenantId);
      return reply.status(201).send({ data: snapshot });
    });

    /** GET /welcome/saved-state — Get saved onboarding state. */
    app.get('/saved-state', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const hasSaved = await checklistPersistence.hasSavedState(tenantId);
      if (!hasSaved) {
        return reply.send({ data: null });
      }
      const snapshot = await checklistPersistence.restore(tenantId);
      return reply.send({ data: snapshot });
    });
  };
}
