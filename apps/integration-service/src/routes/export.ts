import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, PERMISSIONS } from '@etip/shared-auth';
import { AppError } from '@etip/shared-utils';
import { z } from 'zod';
import { BulkExportRequestSchema, CreateTicketSchema, PaginationSchema } from '../schemas/integration.js';
import type { IntegrationStore } from '../services/integration-store.js';
import type { StixExportService } from '../services/stix-export.js';
import type { BulkExportService } from '../services/bulk-export.js';
import type { TicketingService } from '../services/ticketing-service.js';
import type { ExportRecordFetcher } from '../services/ioc-client.js';
import { requirePermission } from '../plugins/authz.js';

export interface ExportRouteDeps {
  store: IntegrationStore;
  stixExport: StixExportService;
  bulkExport: BulkExportService;
  ticketingService: TicketingService;
  fetchRecords: ExportRecordFetcher;
}

/** Build export + ticketing route handler. */
export function exportRoutes(deps: ExportRouteDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    const { store, stixExport, bulkExport, ticketingService, fetchRecords } = deps;

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

    const readAccess = requirePermission(PERMISSIONS.INTEGRATION_READ);
    const updateAccess = requirePermission(PERMISSIONS.INTEGRATION_UPDATE);
    // Tickets go only to an admin-configured ticketing integration (tenant-scoped by id), so raising
    // them from alerts/correlations is analyst work — gated on alert permissions, not integration admin.
    const ticketCreate = requirePermission(PERMISSIONS.ALERT_CREATE);
    const ticketRead = requirePermission(PERMISSIONS.ALERT_READ);
    const ticketUpdate = requirePermission(PERMISSIONS.ALERT_UPDATE);

    const getTenant = (req: FastifyRequest): string => {
      const user = (req as unknown as Record<string, unknown>).user as { tenantId?: string } | undefined;
      if (!user?.tenantId) throw new AppError(403, 'No tenant context', 'NO_TENANT');
      return user.tenantId;
    };

    // ─── TAXII 2.1 Discovery ─────────────────────────────────
    // Intentionally unauthenticated — standard TAXII discovery is public.

    app.get('/taxii/discovery', async (req: FastifyRequest, reply: FastifyReply) => {
      const baseUrl = `${req.protocol}://${req.hostname}`;
      const discovery = stixExport.getDiscovery(baseUrl);
      return reply.header('Content-Type', 'application/taxii+json;version=2.1').send(discovery);
    });

    // ─── TAXII 2.1 Collections ───────────────────────────────

    app.get('/taxii/collections', { preHandler: [auth, readAccess] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const collections = stixExport.getCollections(tenantId);
      return reply.header('Content-Type', 'application/taxii+json;version=2.1').send(collections);
    });

    // ─── TAXII 2.1 Collection Objects ─────────────────────────

    app.get('/taxii/collections/:collectionId/objects', { preHandler: [auth, readAccess] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      // collectionId from params — the collection's entityFilter is applied in the advanced routes;
      // this discovery endpoint exports the tenant's full IOC set (Step 3 S157, DECISION-048: real data only).
      void (req.params as { collectionId: string }).collectionId;

      const records = await fetchRecords(tenantId, 'iocs', {}, 500);
      const iocs = records.map((r) => ({
        id: String(r.id ?? ''),
        type: String(r.type ?? 'unknown'),
        value: String(r.value ?? ''),
        severity: r.severity as string | undefined,
        confidence: typeof r.confidence === 'number' ? r.confidence : undefined,
        createdAt: r.createdAt as string | undefined,
        tags: Array.isArray(r.tags) ? (r.tags as string[]) : undefined,
      }));
      const bundle = stixExport.iocToStixBundle(iocs, tenantId);
      return reply
        .header('Content-Type', 'application/stix+json;version=2.1')
        .header('X-TAXII-Date-Added-First', bundle.objects[0]?.created ?? new Date().toISOString())
        .header('X-TAXII-Date-Added-Last', bundle.objects[bundle.objects.length - 1]?.created ?? new Date().toISOString())
        .send(bundle);
    });

    // ─── Bulk Export ──────────────────────────────────────────

    app.post('/export', { preHandler: [auth, updateAccess] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const request = BulkExportRequestSchema.parse(req.body);

      const data = await fetchRecords(tenantId, request.entityType, request.filters ?? {}, request.limit ?? 1000);

      const result = await bulkExport.export(request, data, tenantId);
      return reply
        .header('Content-Type', result.contentType)
        .header('Content-Disposition', `attachment; filename="${result.filename}"`)
        .send(result.content);
    });

    // ─── Ticketing ────────────────────────────────────────────

    app.post('/tickets', { preHandler: [auth, ticketCreate] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const input = CreateTicketSchema.parse(req.body);

      const integration = store.getIntegration(input.integrationId, tenantId);
      if (!integration) throw new AppError(404, 'Integration not found', 'NOT_FOUND');
      if (!integration.ticketingConfig) throw new AppError(400, 'Not a ticketing integration', 'NOT_TICKETING');

      const ticket = await ticketingService.createTicket(
        input.integrationId, tenantId, integration.ticketingConfig,
        input, integration.fieldMappings,
      );
      return reply.status(201).send({ data: ticket });
    });

    app.get('/tickets', { preHandler: [auth, ticketRead] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const query = PaginationSchema.extend({
        integrationId: z.string().uuid().optional(),
      }).parse(req.query);
      const result = await store.listTickets(tenantId, query);
      return reply.send({ data: result.data, total: result.total, page: query.page, limit: query.limit });
    });

    app.post('/tickets/:id/sync', { preHandler: [auth, ticketUpdate] }, async (req: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenant(req);
      const { id } = req.params as { id: string };

      const ticket = await store.getTicket(id, tenantId);
      if (!ticket) throw new AppError(404, 'Ticket not found', 'NOT_FOUND');

      const integration = store.getIntegration(ticket.integrationId, tenantId);
      if (!integration?.ticketingConfig) throw new AppError(400, 'No ticketing config', 'NO_TICKETING_CONFIG');

      const synced = await ticketingService.syncStatus(id, tenantId, integration.ticketingConfig);
      return reply.send({ data: synced });
    });
  };
}
