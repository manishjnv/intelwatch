import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { BackupStore } from '../services/backup-store.js';
import { TriggerBackupSchema, InitiateRestoreSchema } from '../schemas/admin.js';
import { validate } from '../utils/validate.js';

export interface BackupRouteDeps {
  backupStore: BackupStore;
}

/** Backup and restore routes (core feature 3). */
export function backupRoutes(deps: BackupRouteDeps) {
  const { backupStore } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    /** GET / — list backup records. */
    app.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ data: backupStore.list() });
    });

    /** POST /trigger — initiate a new backup. */
    app.post(
      '/trigger',
      async (req: FastifyRequest, reply: FastifyReply) => {
        const body = validate(TriggerBackupSchema, req.body);
        const adminId = (req.headers['x-admin-id'] as string) || 'system';
        const record = backupStore.trigger({ ...body, triggeredBy: adminId });
        return reply.status(201).send({ data: record });
      },
    );

    /** GET /:id — get backup details. */
    app.get(
      '/:id',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const record = backupStore.getById(req.params.id);
        if (!record) throw new AppError(404, `Backup not found: ${req.params.id}`, 'NOT_FOUND');
        return reply.send({ data: record });
      },
    );

    /** POST /:id/restore — initiate restore from a completed backup. */
    app.post(
      '/:id/restore',
      async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const body = validate(InitiateRestoreSchema, req.body);
        const adminId = (req.headers['x-admin-id'] as string) || 'system';
        try {
          const restore = backupStore.initiateRestore(req.params.id, { requestedBy: adminId, notes: body.notes });
          return reply.status(201).send({ data: restore });
        } catch (err) {
          if (err instanceof AppError) throw err;
          throw new AppError(500, 'Failed to initiate restore', 'RESTORE_ERROR');
        }
      },
    );
  };
}
