import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { ReportStore } from '../src/services/report-store.js';
import { TemplateStore } from '../src/services/template-store.js';
import { DataAggregator } from '../src/services/data-aggregator.js';
import { TemplateEngine } from '../src/services/template-engine.js';
import { ScheduleStore } from '../src/services/schedule-store.js';

const config = loadConfig({
  TI_JWT_SECRET: 'dev-jwt-secret-min-32-chars-long!!',
  TI_SERVICE_JWT_SECRET: 'dev-service-secret!!',
});

// Stub worker that processes synchronously for tests
class StubReportWorker {
  private _reportStore: ReportStore;
  private _templateStore: TemplateStore;
  private _aggregator: DataAggregator;
  private _engine: TemplateEngine;

  constructor(reportStore: ReportStore, templateStore: TemplateStore) {
    this._reportStore = reportStore;
    this._templateStore = templateStore;
    this._aggregator = new DataAggregator();
    this._engine = new TemplateEngine();
  }

  async enqueue(report: { id: string; type: string; format: string }): Promise<string> {
    // Process synchronously for tests
    this._reportStore.updateStatus(report.id, 'generating');
    const fullReport = this._reportStore.getById(report.id)!;
    const template = this._templateStore.getByType(fullReport.type)!;
    const data = await this._aggregator.aggregate(fullReport);
    const result = this._engine.render(fullReport, template, data, fullReport.format);
    this._reportStore.updateStatus(report.id, 'completed', result);
    this._reportStore.setGenerationTime(report.id, 50);
    return `test-job-${report.id}`;
  }
}

describe('Report Routes', () => {
  let app: FastifyInstance;
  let reportStore: ReportStore;
  let scheduleStore: ScheduleStore;
  let templateStore: TemplateStore;

  beforeEach(async () => {
    reportStore = new ReportStore();
    scheduleStore = new ScheduleStore();
    templateStore = new TemplateStore();
    const stubWorker = new StubReportWorker(reportStore, templateStore) as any;

    app = await buildApp({
      config,
      reportDeps: { reportStore, reportWorker: stubWorker },
      scheduleDeps: { scheduleStore },
      templateDeps: { templateStore },
      statsDeps: { reportStore, scheduleStore },
    });
  });

  afterEach(async () => {
    scheduleStore.stopAll();
    await app.close();
  });

  describe('POST /api/v1/reports', () => {
    it('creates a report and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/reports',
        payload: { type: 'daily', format: 'json' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.id).toBeTruthy();
      expect(body.data.type).toBe('daily');
    });

    it('creates daily report', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/reports',
        payload: { type: 'daily' },
      });
      expect(res.statusCode).toBe(201);
    });

    it('creates weekly report', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/reports',
        payload: { type: 'weekly' },
      });
      expect(res.statusCode).toBe(201);
    });

    it('creates monthly report', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/reports',
        payload: { type: 'monthly' },
      });
      expect(res.statusCode).toBe(201);
    });

    it('creates custom report', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/reports',
        payload: { type: 'custom', dateRange: { from: '2025-01-01T00:00:00Z', to: '2025-01-31T00:00:00Z' } },
      });
      expect(res.statusCode).toBe(201);
    });

    it('creates executive report', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/reports',
        payload: { type: 'executive' },
      });
      expect(res.statusCode).toBe(201);
    });

    it('returns 400 for invalid type', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/reports',
        payload: { type: 'invalid' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for missing type', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/reports',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('accepts filters', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/reports',
        payload: { type: 'daily', filters: { severities: ['critical', 'high'] } },
      });
      expect(res.statusCode).toBe(201);
    });

    it('accepts custom title', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/reports',
        payload: { type: 'daily', title: 'My Custom Title' },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).data.title).toBe('My Custom Title');
    });

    it('accepts html format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/reports',
        payload: { type: 'daily', format: 'html' },
      });
      expect(res.statusCode).toBe(201);
    });

    it('accepts pdf format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/reports',
        payload: { type: 'daily', format: 'pdf' },
      });
      expect(res.statusCode).toBe(201);
    });
  });

  describe('GET /api/v1/reports', () => {
    it('returns empty list initially', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/reports?tenantId=default' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it('returns created reports', async () => {
      await app.inject({ method: 'POST', url: '/api/v1/reports', payload: { type: 'daily' } });
      const res = await app.inject({ method: 'GET', url: '/api/v1/reports?tenantId=default' });
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(1);
    });

    it('filters by type', async () => {
      await app.inject({ method: 'POST', url: '/api/v1/reports', payload: { type: 'daily' } });
      await app.inject({ method: 'POST', url: '/api/v1/reports', payload: { type: 'weekly' } });
      const res = await app.inject({ method: 'GET', url: '/api/v1/reports?tenantId=default&type=daily' });
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(1);
    });

    it('paginates with page and limit', async () => {
      for (let i = 0; i < 5; i++) {
        await app.inject({ method: 'POST', url: '/api/v1/reports', payload: { type: 'daily' } });
      }
      const res = await app.inject({ method: 'GET', url: '/api/v1/reports?tenantId=default&page=1&limit=2' });
      const body = JSON.parse(res.body);
      expect(body.data.length).toBe(2);
      expect(body.meta.totalPages).toBe(3);
    });
  });

  describe('GET /api/v1/reports/:id', () => {
    it('returns report by id', async () => {
      const createRes = await app.inject({ method: 'POST', url: '/api/v1/reports', payload: { type: 'daily' } });
      const id = JSON.parse(createRes.body).data.id;
      const res = await app.inject({ method: 'GET', url: `/api/v1/reports/${id}` });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.id).toBe(id);
    });

    it('returns 404 for non-existent id', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/reports/nonexistent' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/reports/:id/download', () => {
    it('downloads completed report', async () => {
      const createRes = await app.inject({ method: 'POST', url: '/api/v1/reports', payload: { type: 'daily' } });
      const id = JSON.parse(createRes.body).data.id;

      const res = await app.inject({ method: 'GET', url: `/api/v1/reports/${id}/download` });
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 for non-existent report', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/reports/nonexistent/download' });
      expect(res.statusCode).toBe(404);
    });

    it('returns HTML content type for html reports', async () => {
      const createRes = await app.inject({ method: 'POST', url: '/api/v1/reports', payload: { type: 'daily', format: 'html' } });
      const id = JSON.parse(createRes.body).data.id;
      const res = await app.inject({ method: 'GET', url: `/api/v1/reports/${id}/download` });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });
  });

  describe('DELETE /api/v1/reports/:id', () => {
    it('deletes report and returns 204', async () => {
      const createRes = await app.inject({ method: 'POST', url: '/api/v1/reports', payload: { type: 'daily' } });
      const id = JSON.parse(createRes.body).data.id;
      const res = await app.inject({ method: 'DELETE', url: `/api/v1/reports/${id}` });
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 for non-existent report', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/reports/nonexistent' });
      expect(res.statusCode).toBe(404);
    });

    it('deleted report no longer accessible', async () => {
      const createRes = await app.inject({ method: 'POST', url: '/api/v1/reports', payload: { type: 'daily' } });
      const id = JSON.parse(createRes.body).data.id;
      await app.inject({ method: 'DELETE', url: `/api/v1/reports/${id}` });
      const getRes = await app.inject({ method: 'GET', url: `/api/v1/reports/${id}` });
      expect(getRes.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/reports/schedule', () => {
    it('creates schedule and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/reports/schedule',
        payload: { name: 'Daily Auto', reportType: 'daily', cronExpression: '0 8 * * *' },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).data.id).toBeTruthy();
    });

    it('returns 400 for invalid cron', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/reports/schedule',
        payload: { name: 'Bad', reportType: 'daily', cronExpression: 'not-cron' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 for missing name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/reports/schedule',
        payload: { reportType: 'daily', cronExpression: '0 8 * * *' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/reports/schedule', () => {
    it('returns empty list initially', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/reports/schedule' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data).toEqual([]);
    });

    it('returns created schedules', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/reports/schedule',
        payload: { name: 'Test', reportType: 'daily', cronExpression: '0 8 * * *' },
      });
      const res = await app.inject({ method: 'GET', url: '/api/v1/reports/schedule?tenantId=default' });
      expect(JSON.parse(res.body).data.length).toBe(1);
    });
  });

  describe('PUT /api/v1/reports/schedule/:id', () => {
    it('updates schedule name', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/reports/schedule',
        payload: { name: 'Old', reportType: 'daily', cronExpression: '0 8 * * *' },
      });
      const id = JSON.parse(createRes.body).data.id;
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/reports/schedule/${id}`,
        payload: { name: 'New' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.name).toBe('New');
    });

    it('returns 404 for non-existent schedule', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/reports/schedule/nonexistent',
        payload: { name: 'X' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/reports/schedule/:id', () => {
    it('deletes schedule and returns 204', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/reports/schedule',
        payload: { name: 'Test', reportType: 'daily', cronExpression: '0 8 * * *' },
      });
      const id = JSON.parse(createRes.body).data.id;
      const res = await app.inject({ method: 'DELETE', url: `/api/v1/reports/schedule/${id}` });
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 for non-existent schedule', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/reports/schedule/nonexistent' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/reports/templates', () => {
    it('returns all templates', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/reports/templates' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.length).toBe(5);
    });
  });

  describe('GET /api/v1/reports/stats', () => {
    it('returns stats', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/reports/stats' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.reports).toBeDefined();
      expect(body.data.schedules).toBeDefined();
    });

    it('stats update after creating reports', async () => {
      await app.inject({ method: 'POST', url: '/api/v1/reports', payload: { type: 'daily' } });
      await app.inject({ method: 'POST', url: '/api/v1/reports', payload: { type: 'weekly' } });
      const res = await app.inject({ method: 'GET', url: '/api/v1/reports/stats' });
      const body = JSON.parse(res.body);
      expect(body.data.reports.total).toBe(2);
    });
  });
});
