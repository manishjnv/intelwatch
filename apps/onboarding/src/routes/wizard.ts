import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ZodType } from 'zod';
import { AppError } from '@etip/shared-utils';
import {
  OrgProfileSchema,
  TeamInviteSchema,
  CompleteStepSchema,
  SkipStepSchema,
  DashboardPreferenceSchema,
} from '../schemas/onboarding.js';
import type { WizardStore } from '../services/wizard-store.js';
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

export interface WizardRouteDeps {
  wizardStore: WizardStore;
  checklistPersistence: ChecklistPersistence;
}

export function wizardRoutes(deps: WizardRouteDeps) {
  const { wizardStore, checklistPersistence } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET /wizard — Get current wizard state. */
    app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const wizard = wizardStore.getOrCreate(tenantId);
      return reply.send({ data: wizard });
    });

    /** POST /wizard/org-profile — Set organization profile. */
    app.post('/org-profile', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      wizardStore.getOrCreate(tenantId);
      const profile = validate(OrgProfileSchema, req.body);
      const wizard = wizardStore.setOrgProfile(tenantId, profile);
      return reply.status(201).send({ data: wizard });
    });

    /** POST /wizard/team-invite — Invite team members. */
    app.post('/team-invite', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      wizardStore.getOrCreate(tenantId);
      const input = validate(TeamInviteSchema, req.body);
      const wizard = wizardStore.addTeamInvites(tenantId, input.invites);
      return reply.status(201).send({ data: wizard });
    });

    /** POST /wizard/complete-step — Mark a step as completed. */
    app.post('/complete-step', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const input = validate(CompleteStepSchema, req.body);
      const wizard = wizardStore.completeStep(tenantId, input.step, input.data);
      checklistPersistence.save(tenantId);
      return reply.send({ data: wizard });
    });

    /** POST /wizard/skip-step — Skip an optional step. */
    app.post('/skip-step', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const input = validate(SkipStepSchema, req.body);
      const wizard = wizardStore.skipStep(tenantId, input.step);
      checklistPersistence.save(tenantId);
      return reply.send({ data: wizard });
    });

    /** POST /wizard/dashboard-prefs — Set dashboard preferences. */
    app.post('/dashboard-prefs', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      wizardStore.getOrCreate(tenantId);
      const prefs = validate(DashboardPreferenceSchema, req.body);
      const wizard = wizardStore.setDashboardPrefs(tenantId, prefs);
      return reply.send({ data: wizard });
    });

    /** POST /wizard/reset — Reset onboarding (restart wizard). */
    app.post('/reset', async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const wizard = wizardStore.reset(tenantId);
      return reply.send({ data: wizard });
    });
  };
}
