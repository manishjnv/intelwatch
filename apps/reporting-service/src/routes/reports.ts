import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';
import type { ReportStore } from '../services/report-store.js';
import type { ReportWorker } from '../workers/report-worker.js';
import { CreateReportSchema, ListReportsQuerySchema, type CreateReportDto, type ListReportsQuery } from '../schemas/report.js';
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

      return reply.send({ data: report.result });
    });

    // DELETE /api/v1/reports/:id — Soft-delete a report
    app.delete('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const deleted = reportStore.softDelete(req.params.id);
      if (!deleted) throw new AppError(404, `Report not found: ${req.params.id}`, 'NOT_FOUND');
      return reply.status(204).send();
    });
  };
}
