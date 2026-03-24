import { Queue, Worker, type Job } from 'bullmq';
import { QUEUES, AppError } from '@etip/shared-utils';
import type { ReportStore, ReportRecord } from '../services/report-store.js';
import type { TemplateStore } from '../services/template-store.js';
import type { DataAggregator } from '../services/data-aggregator.js';
import type { TemplateEngine } from '../services/template-engine.js';
import { getLogger } from '../logger.js';

export interface ReportJobData {
  reportId: string;
}

export interface ReportJobResult {
  reportId: string;
  status: 'completed' | 'failed';
  generationTimeMs: number;
  error?: string;
}

export interface ReportWorkerDeps {
  reportStore: ReportStore;
  templateStore: TemplateStore;
  dataAggregator: DataAggregator;
  templateEngine: TemplateEngine;
  redisUrl: string;
}

export class ReportWorker {
  private _queue: Queue<ReportJobData, ReportJobResult> | null = null;
  private _worker: Worker<ReportJobData, ReportJobResult> | null = null;
  private _deps: ReportWorkerDeps;
  private _logger = getLogger();

  constructor(deps: ReportWorkerDeps) {
    this._deps = deps;
  }

  getQueue(): Queue<ReportJobData, ReportJobResult> | null {
    return this._queue;
  }

  start(): void {
    const connection = this._parseRedisUrl(this._deps.redisUrl);

    this._queue = new Queue<ReportJobData, ReportJobResult>(QUEUES.REPORT_GENERATE, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });

    this._worker = new Worker<ReportJobData, ReportJobResult>(
      QUEUES.REPORT_GENERATE,
      async (job: Job<ReportJobData>) => this._processJob(job),
      {
        connection,
        concurrency: 2,
      },
    );

    this._worker.on('failed', (job, err) => {
      this._logger.error({ jobId: job?.id, error: err.message }, 'Report generation job failed');
    });

    this._worker.on('completed', (job) => {
      this._logger.info({ jobId: job.id, reportId: job.data.reportId }, 'Report generation completed');
    });

    this._logger.info('Report worker started');
  }

  async enqueue(report: ReportRecord): Promise<string> {
    if (!this._queue) {
      throw new AppError(500, 'Report queue not initialized', 'QUEUE_NOT_READY');
    }

    const job = await this._queue.add(
      QUEUES.REPORT_GENERATE,
      { reportId: report.id },
      { jobId: `report-${report.id}` },
    );

    this._logger.info({ reportId: report.id, jobId: job.id }, 'Report job enqueued');
    return job.id!;
  }

  async stop(): Promise<void> {
    if (this._worker) {
      await this._worker.close();
      this._worker = null;
    }
    if (this._queue) {
      await this._queue.close();
      this._queue = null;
    }
    this._logger.info('Report worker stopped');
  }

  private async _processJob(job: Job<ReportJobData>): Promise<ReportJobResult> {
    const { reportId } = job.data;
    const startTime = Date.now();
    const { reportStore, templateStore, dataAggregator, templateEngine } = this._deps;

    this._logger.info({ reportId, jobId: job.id }, 'Processing report generation');

    const report = reportStore.getById(reportId);
    if (!report) {
      throw new AppError(404, `Report not found: ${reportId}`, 'NOT_FOUND');
    }

    reportStore.updateStatus(reportId, 'generating');

    try {
      const template = templateStore.getByType(report.type);
      if (!template) {
        throw new AppError(500, `No template found for report type: ${report.type}`, 'TEMPLATE_MISSING');
      }

      const data = await dataAggregator.aggregate(report);
      const result = templateEngine.render(report, template, data, report.format);

      const generationTimeMs = Date.now() - startTime;
      reportStore.updateStatus(reportId, 'completed', result);
      reportStore.setGenerationTime(reportId, generationTimeMs);

      return { reportId, status: 'completed', generationTimeMs };
    } catch (err) {
      const generationTimeMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      reportStore.updateStatus(reportId, 'failed', undefined, errorMessage);
      reportStore.setGenerationTime(reportId, generationTimeMs);

      this._logger.error({ reportId, error: errorMessage }, 'Report generation failed');
      throw err;
    }
  }

  private _parseRedisUrl(url: string): { host: string; port: number; password?: string } {
    const parsed = new URL(url);
    const password = parsed.password ? decodeURIComponent(parsed.password) : undefined;
    return {
      host: parsed.hostname,
      port: Number(parsed.port) || 6379,
      password: password || undefined,
    };
  }
}
