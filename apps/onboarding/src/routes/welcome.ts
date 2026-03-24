import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ZodType } from 'zod';
import { AppError } from '@etip/shared-utils';
import { SeedDemoSchema } from '../schemas/onboarding.js';
import type { WelcomeDashboardService } from '../services/welcome-dashboard.js';
import type { DemoSeeder } from '../services/demo-seeder.js';
import type { ChecklistPersistence } from '../services/checklist-persistence.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validate<S extends ZodType<any, any, any>>(schema: S, data: unknown): ReturnType<S['parse']> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError(400, 'Request validation failed', 'VALIDATION_ERROR', details);
  }
  return result.data;
}

export interface WelcomeRouteDeps {
  welcomeDashboard: WelcomeDashboardService;
  demoSeeder: DemoSeeder;
  checklistPersistence: ChecklistPersistence;
}

export function welcomeRoutes(deps: WelcomeRouteDeps) {
  const { welcomeDashboard, demoSeeder, checklistPersistence } = deps;

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

    /** POST /welcome/seed-demo — Seed demo data for first-time users. */
    app.post('/seed-demo', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const input = validate(SeedDemoSchema, req.body ?? {});
      const result = await demoSeeder.seed(tenantId, input.categories);
      return reply.status(201).send({ data: result });
    });

    /** GET /welcome/demo-status — Check if demo data has been seeded. */
    app.get('/demo-status', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const seeded = demoSeeder.isSeeded(tenantId);
      const result = demoSeeder.getSeedResult(tenantId);
      return reply.send({ data: { seeded, result } });
    });

    /** DELETE /welcome/demo-data — Clear demo data. */
    app.delete('/demo-data', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      demoSeeder.clearDemoData(tenantId);
      return reply.status(204).send();
    });

    /** GET /welcome/demo-available — Get available demo data counts. */
    app.get('/demo-available', async (_req: FastifyRequest, reply: FastifyReply) => {
      const counts = demoSeeder.getAvailableDemoData();
      return reply.send({ data: counts });
    });

    /** POST /welcome/tour-complete — Mark guided tour as completed. */
    app.post('/tour-complete', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      welcomeDashboard.markTourCompleted(tenantId);
      return reply.send({ data: { completed: true } });
    });

    /** GET /welcome/should-show — Check if welcome screen should display. */
    app.get('/should-show', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const show = welcomeDashboard.shouldShowWelcome(tenantId);
      const tourDone = welcomeDashboard.isTourCompleted(tenantId);
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
      const hasSaved = checklistPersistence.hasSavedState(tenantId);
      if (!hasSaved) {
        return reply.send({ data: null });
      }
      const snapshot = checklistPersistence.restore(tenantId);
      return reply.send({ data: snapshot });
    });
  };
}
