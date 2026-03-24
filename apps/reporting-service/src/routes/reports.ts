import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { ReportStore } from '../services/report-store.js';
import type { ReportWorker } from '../workers/report-worker.js';
import { ReportComparator } from '../services/report-comparator.js';
import {
  CreateReportSchema,
  ListReportsQuerySchema,
  BulkDeleteSchema,
  type CreateReportDto,
  type ListReportsQuery,
  type BulkDeleteDto,
} from '../schemas/report.js';
import { validate } from '../utils/validate.js';

export interface ReportRouteDeps {
  reportStore: ReportStore;
  reportWorker: ReportWorker;
}

export function reportRoutes(deps: ReportRouteDeps) {
  const { reportStore, reportWorker } = deps;

  return async function (app: FastifyInstance): Promise<void> {
    // POST /api/v1/reports — Request a new report
    app.post('/', async (req: FastifyRequest<{ Body: CreateReportDto }>, reply: FastifyReply) => {
      const body = validate(CreateReportSchema, req.body);
      const report = reportStore.create(body);

      await reportWorker.enqueue(report);

      return reply.status(201).send({ data: report });
    });

    // GET /api/v1/reports — List reports for tenant
    app.get('/', async (req: FastifyRequest<{ Querystring: ListReportsQuery }>, reply: FastifyReply) => {
      const query = validate(ListReportsQuerySchema, req.query);
      const result = reportStore.list(query.tenantId, {
        type: query.type,
        status: query.status,
        page: query.page,
        limit: query.limit,
      });

      return reply.send({
        data: result.data,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    });

    // GET /api/v1/reports/:id — Get report status + metadata
    app.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const report = reportStore.getById(req.params.id);
      if (!report) throw new AppError(404, `Report not found: ${req.params.id}`, 'NOT_FOUND');
      return reply.send({ data: report });
    });

    // GET /api/v1/reports/:id/download — Download generated report
    app.get('/:id/download', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const report = reportStore.getById(req.params.id);
      if (!report) throw new AppError(404, `Report not found: ${req.params.id}`, 'NOT_FOUND');

      if (report.status !== 'completed') {
        throw new AppError(409, `Report not ready. Status: ${report.status}`, 'REPORT_NOT_READY');
      }

      if (!report.result) {
        throw new AppError(500, 'Report completed but no result available', 'RESULT_MISSING');
      }

      if (report.format === 'html' && typeof report.result === 'string') {
        return reply.type('text/html').send(report.result);
      }

      if (report.format === 'csv' && typeof report.result === 'string') {
        return reply
          .type('text/csv')
          .header('Content-Disposition', `attachment; filename="report-${report.id}.csv"`)
          .send(report.result);
      }

      return reply.send({ data: report.result });
    });

    // POST /api/v1/reports/bulk-delete — Delete multiple reports at once
    app.post('/bulk-delete', async (req: FastifyRequest<{ Body: BulkDeleteDto }>, reply: FastifyReply) => {
      const body = validate(BulkDeleteSchema, req.body);
      let deleted = 0;
      const notFound: string[] = [];

      for (const id of body.ids) {
        if (reportStore.softDelete(id)) {
          deleted++;
        } else {
          notFound.push(id);
        }
      }

      return reply.send({ data: { deleted, notFound } });
    });

    // POST /api/v1/reports/:id/clone — Clone report config into a new pending report
    app.post('/:id/clone', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const source = reportStore.getById(req.params.id);
      if (!source) throw new AppError(404, `Report not found: ${req.params.id}`, 'NOT_FOUND');

      const cloned = reportStore.create({
        type: source.type,
        format: source.format,
        title: `${source.title} (copy)`,
        tenantId: source.tenantId,
        dateRange: undefined, // fresh date range
        filters: source.filters as CreateReportDto['filters'],
        configVersion: source.configVersion,
      });

      await reportWorker.enqueue(cloned);

      return reply.status(201).send({ data: cloned });
    });

    // GET /api/v1/reports/:id/compare/:otherId — Compare two completed reports
    app.get(
      '/:id/compare/:otherId',
      async (
        req: FastifyRequest<{ Params: { id: string; otherId: string } }>,
        reply: FastifyReply,
      ) => {
        const reportA = reportStore.getById(req.params.id);
        if (!reportA) throw new AppError(404, `Report not found: ${req.params.id}`, 'NOT_FOUND');

        const reportB = reportStore.getById(req.params.otherId);
        if (!reportB) throw new AppError(404, `Report not found: ${req.params.otherId}`, 'NOT_FOUND');

        const comparator = new ReportComparator();
        const result = comparator.compare(reportA, reportB);

        return reply.send({ data: result });
      },
    );

    // DELETE /api/v1/reports/:id — Soft-delete a report
    app.delete('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const deleted = reportStore.softDelete(req.params.id);
      if (!deleted) throw new AppError(404, `Report not found: ${req.params.id}`, 'NOT_FOUND');
      return reply.status(204).send();
    });
  };
}
