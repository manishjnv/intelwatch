import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '@etip/shared-auth';
import { AppError } from '@etip/shared-utils';
import {
  PaginationSchema,
  CreateFieldMappingPresetSchema,
  UpdateFieldMappingPresetSchema,
  CreateTicketTemplateSchema,
  UpdateTicketTemplateSchema,
  CreateTaxiiCollectionSchema,
  UpdateTaxiiCollectionSchema,
  CreateExportScheduleSchema,
  UpdateExportScheduleSchema,
  IntegrationTypeEnum,
} from '../schemas/integration.js';
import { z } from 'zod';
import type { FieldMappingStore } from '../services/field-mapping-store.js';
import type { TemplateEngine } from '../services/template-engine.js';
import type { StixCollectionStore } from '../services/stix-collection-store.js';
import type { ExportScheduler } from '../services/export-scheduler.js';

export interface AdvancedRouteDeps {
  fieldMappingStore: FieldMappingStore;
  templateEngine: TemplateEngine;
  stixCollectionStore: StixCollectionStore;
  exportScheduler: ExportScheduler;
}

/** Build advanced route handlers for P1 #7-#10. */
export function advancedRoutes(deps: AdvancedRouteDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    const { fieldMappingStore, templateEngine, stixCollectionStore, exportScheduler } = deps;

    const auth = async (req: FastifyRequest, reply: FastifyReply) => {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
      }
      try {
        const payload = verifyAccessToken(header.slice(7));
        (req as unknown as Record<string, unknown>).user = payload;
      } catch {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
      }
    };

    const getTenant = (req: FastifyRequest): string => {
      const user = (req as unknown as Record<string, unknown>).user as { tenantId?: string } | undefined;
      if (!user?.tenantId) throw new AppError(403, 'No tenant context', 'NO_TENANT');
      return user.tenantId;
    };

    // ═══════════════════════════════════════════════════════════════
    // P1 #7: Field Mapping Presets
    // ═══════════════════════════════════════════════════════════════

    app.post('/field-mapping-presets', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const input = CreateFieldMappingPresetSchema.parse(req.body);
      const preset = fieldMappingStore.createPreset(tenantId, input);
      return reply.status(201).send({ data: preset });
    });

    app.get('/field-mapping-presets', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const query = PaginationSchema.extend({
        targetType: IntegrationTypeEnum.optional(),
      }).parse(req.query);
      const result = fieldMappingStore.listPresets(tenantId, query);
      return reply.send({ data: result.data, total: result.total, page: query.page, limit: query.limit });
    });

    app.put('/field-mapping-presets/:id', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const input = UpdateFieldMappingPresetSchema.parse(req.body);
      const updated = fieldMappingStore.updatePreset(id, tenantId, input);
      if (!updated) throw new AppError(404, 'Preset not found', 'NOT_FOUND');
      return reply.send({ data: updated });
    });

    app.delete('/field-mapping-presets/:id', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const deleted = fieldMappingStore.deletePreset(id, tenantId);
      if (!deleted) throw new AppError(404, 'Preset not found', 'NOT_FOUND');
      return reply.status(204).send();
    });

    // ═══════════════════════════════════════════════════════════════
    // P1 #8: Ticket Templates
    // ═══════════════════════════════════════════════════════════════

    app.post('/ticket-templates', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const input = CreateTicketTemplateSchema.parse(req.body);
      const template = templateEngine.createTemplate(tenantId, input);
      return reply.status(201).send({ data: template });
    });

    app.get('/ticket-templates', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const query = PaginationSchema.extend({
        targetType: z.enum(['servicenow', 'jira']).optional(),
      }).parse(req.query);
      const result = templateEngine.listTemplates(tenantId, query);
      return reply.send({ data: result.data, total: result.total, page: query.page, limit: query.limit });
    });

    app.put('/ticket-templates/:id', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const input = UpdateTicketTemplateSchema.parse(req.body);
      const updated = templateEngine.updateTemplate(id, tenantId, input);
      if (!updated) throw new AppError(404, 'Template not found', 'NOT_FOUND');
      return reply.send({ data: updated });
    });

    app.delete('/ticket-templates/:id', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const deleted = templateEngine.deleteTemplate(id, tenantId);
      if (!deleted) throw new AppError(404, 'Template not found', 'NOT_FOUND');
      return reply.status(204).send();
    });

    // ═══════════════════════════════════════════════════════════════
    // P1 #9: TAXII Collection Management
    // ═══════════════════════════════════════════════════════════════

    app.post('/taxii/collections', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const input = CreateTaxiiCollectionSchema.parse(req.body);
      const collection = stixCollectionStore.createCollection(tenantId, input);
      return reply.status(201).send({ data: collection });
    });

    app.put('/taxii/collections/:id', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const input = UpdateTaxiiCollectionSchema.parse(req.body);
      const updated = stixCollectionStore.updateCollection(id, tenantId, input);
      if (!updated) throw new AppError(404, 'Collection not found', 'NOT_FOUND');
      return reply.send({ data: updated });
    });

    app.delete('/taxii/collections/:id', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const deleted = stixCollectionStore.deleteCollection(id, tenantId);
      if (!deleted) throw new AppError(404, 'Collection not found', 'NOT_FOUND');
      return reply.status(204).send();
    });

    app.get('/taxii/collections/:id/manifest', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const query = PaginationSchema.parse(req.query);
      const result = stixCollectionStore.getManifest(id, tenantId, query);
      return reply
        .header('Content-Type', 'application/taxii+json;version=2.1')
        .send({ objects: result.data, total: result.total });
    });

    // ═══════════════════════════════════════════════════════════════
    // P1 #10: Export Schedules
    // ═══════════════════════════════════════════════════════════════

    app.post('/export/schedules', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const input = CreateExportScheduleSchema.parse(req.body);
      const schedule = exportScheduler.createSchedule(tenantId, input);
      return reply.status(201).send({ data: schedule });
    });

    app.get('/export/schedules', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const query = PaginationSchema.extend({
        enabled: z.coerce.boolean().optional(),
      }).parse(req.query);
      const result = exportScheduler.listSchedules(tenantId, query);
      return reply.send({ data: result.data, total: result.total, page: query.page, limit: query.limit });
    });

    app.put('/export/schedules/:id', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const input = UpdateExportScheduleSchema.parse(req.body);
      const updated = exportScheduler.updateSchedule(id, tenantId, input);
      if (!updated) throw new AppError(404, 'Schedule not found', 'NOT_FOUND');
      return reply.send({ data: updated });
    });

    app.delete('/export/schedules/:id', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const deleted = exportScheduler.deleteSchedule(id, tenantId);
      if (!deleted) throw new AppError(404, 'Schedule not found', 'NOT_FOUND');
      return reply.status(204).send();
    });

    app.post('/export/schedules/:id/run', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const result = await exportScheduler.executeSchedule(id, tenantId);
      if (!result) throw new AppError(404, 'Schedule not found or execution failed', 'NOT_FOUND');
      return reply
        .header('Content-Type', result.contentType)
        .header('Content-Disposition', `attachment; filename="${result.filename}"`)
        .send(result.content);
    });

    app.get('/export/schedules/:id/history', { preHandler: [auth] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };
      const query = PaginationSchema.parse(req.query);
      const result = exportScheduler.getRunHistory(id, tenantId, query);
      if (!result) throw new AppError(404, 'Schedule not found', 'NOT_FOUND');
      return reply.send({ data: result.data, total: result.total, page: query.page, limit: query.limit });
    });
  };
}
