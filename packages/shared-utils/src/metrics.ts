/**
 * @module metrics
 * @description Prometheus metrics plugin for ETIP Fastify services.
 * Registers HTTP request counter, duration histogram, default Node.js
 * process metrics, and a GET /metrics endpoint.
 *
 * Uses structural typing to avoid a fastify dependency in shared-utils.
 * Any Fastify 4.x instance satisfies the MetricsCompatibleApp interface.
 *
 * @example
 * ```typescript
 * import { registerMetrics } from '@etip/shared-utils';
 * await registerMetrics(app, 'ingestion-service');
 * ```
 */
import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

// ── Structural types (Fastify-compatible, no fastify dep needed) ────

interface HookRequest {
  method: string;
  url: string;
  routeOptions?: { url?: string };
}

interface HookReply {
  statusCode: number;
  elapsedTime: number;
  header(name: string, value: string): unknown;
}

type OnResponseHandler = (
  req: HookRequest,
  reply: HookReply,
  done: () => void,
) => void;

type RouteHandler = (
  req: unknown,
  reply: HookReply,
) => Promise<string>;

/** Minimal Fastify-compatible app interface for metrics registration. */
export interface MetricsCompatibleApp {
  addHook(name: 'onResponse', handler: OnResponseHandler): unknown;
  get(
    path: string,
    opts: { config?: Record<string, unknown> },
    handler: RouteHandler,
  ): unknown;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Register Prometheus metrics on a Fastify app instance.
 *
 * Adds:
 * - `http_requests_total` counter (labels: method, route, status_code)
 * - `http_request_duration_seconds` histogram (same labels, 11 buckets)
 * - Default Node.js process metrics (CPU, memory, event loop, GC)
 * - GET `/metrics` endpoint (rate-limit exempt, Prometheus text format)
 *
 * Each call creates an isolated Registry — safe for multi-service testing.
 */
export async function registerMetrics(
  app: MetricsCompatibleApp,
  serviceName: string,
): Promise<void> {
  const registry = new Registry();
  registry.setDefaultLabels({ service: serviceName });
  collectDefaultMetrics({ register: registry });

  const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [registry],
  });

  const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  app.addHook('onResponse', (req, reply, done) => {
    // Use route pattern (e.g. /api/v1/feeds/:id) not actual path — prevents high-cardinality labels
    const route = req.routeOptions?.url ?? req.url;
    const labels = {
      method: req.method,
      route,
      status_code: String(reply.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, reply.elapsedTime / 1000);
    done();
  });

  app.get('/metrics', { config: { rateLimit: false } }, async (_req, reply) => {
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });
}
