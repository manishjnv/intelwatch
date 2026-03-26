#!/usr/bin/env npx tsx
/**
 * Pipeline health check — verifies all ETIP services, queues, and data stores.
 *
 * Usage: npx tsx scripts/check-pipeline-health.ts
 * Options: --json (machine-readable output)
 *
 * Checks:
 * 1. Service /health endpoints (ports 3001–3025)
 * 2. Redis queue depths (BullMQ waiting counts)
 * 3. PostgreSQL article + IOC counts
 * 4. Elasticsearch indexed document count
 * 5. Neo4j node count (via threat-graph /graph/stats)
 */

// ── Service Definitions ──────────────────────────────────────────

interface ServiceDef {
  name: string;
  port: number;
  healthPath: string;
}

const SERVICES: ServiceDef[] = [
  { name: 'api-gateway',      port: 3001, healthPath: '/health' },
  { name: 'ingestion',        port: 3004, healthPath: '/health' },
  { name: 'normalization',    port: 3005, healthPath: '/health' },
  { name: 'ai-enrichment',    port: 3006, healthPath: '/health' },
  { name: 'ioc-intelligence', port: 3007, healthPath: '/health' },
  { name: 'threat-actor',     port: 3008, healthPath: '/health' },
  { name: 'malware-intel',    port: 3009, healthPath: '/health' },
  { name: 'vuln-intel',       port: 3010, healthPath: '/health' },
  { name: 'drp',              port: 3011, healthPath: '/health' },
  { name: 'threat-graph',     port: 3012, healthPath: '/health' },
  { name: 'correlation',      port: 3013, healthPath: '/health' },
  { name: 'threat-hunting',   port: 3014, healthPath: '/health' },
  { name: 'integration',      port: 3015, healthPath: '/health' },
  { name: 'user-management',  port: 3016, healthPath: '/health' },
  { name: 'customization',    port: 3017, healthPath: '/health' },
  { name: 'onboarding',       port: 3018, healthPath: '/health' },
  { name: 'billing',          port: 3019, healthPath: '/health' },
  { name: 'es-indexing',      port: 3020, healthPath: '/health' },
  { name: 'reporting',        port: 3021, healthPath: '/health' },
  { name: 'admin-ops',        port: 3022, healthPath: '/health' },
  { name: 'alerting',         port: 3023, healthPath: '/health' },
  { name: 'analytics',        port: 3024, healthPath: '/health' },
  { name: 'caching',          port: 3025, healthPath: '/health' },
];

const QUEUE_NAMES = [
  'etip-feed-fetch', 'etip-feed-fetch-rss', 'etip-feed-fetch-nvd',
  'etip-feed-fetch-stix', 'etip-feed-fetch-rest', 'etip-feed-parse',
  'etip-normalize', 'etip-enrich-realtime', 'etip-graph-sync',
  'etip-correlate', 'etip-alert-evaluate', 'etip-integration-push',
  'etip-ioc-indexed', 'etip-report-generate', 'etip-cache-invalidate',
];

// ── Helpers ──────────────────────────────────────────────────────

interface ServiceResult { name: string; status: 'up' | 'down' | 'error'; latencyMs: number; detail?: string }
interface QueueResult { name: string; waiting: number; active: number; warning: boolean }
interface DataResult { store: string; count: number; detail?: string }
interface Report { services: ServiceResult[]; queues: QueueResult[]; data: DataResult[]; summary: string }

const BASE_URL = process.env.PIPELINE_BASE_URL || 'http://localhost';
const TIMEOUT_MS = 5000;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function checkService(svc: ServiceDef): Promise<ServiceResult> {
  const url = `${BASE_URL}:${svc.port}${svc.healthPath}`;
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(url, TIMEOUT_MS);
    const latencyMs = Date.now() - start;
    return { name: svc.name, status: res.ok ? 'up' : 'error', latencyMs, detail: `HTTP ${res.status}` };
  } catch (err) {
    return { name: svc.name, status: 'down', latencyMs: Date.now() - start, detail: (err as Error).message?.slice(0, 60) };
  }
}

async function checkQueues(): Promise<QueueResult[]> {
  // Try admin-service queue monitor endpoint
  try {
    const res = await fetchWithTimeout(`${BASE_URL}:3022/api/v1/admin/queues`, TIMEOUT_MS);
    if (res.ok) {
      const body = (await res.json()) as { data?: Array<{ name: string; waiting: number; active: number }> };
      if (body.data) {
        return body.data.map((q) => ({
          name: q.name, waiting: q.waiting, active: q.active, warning: q.waiting > 100,
        }));
      }
    }
  } catch { /* fallback below */ }

  // Fallback: return unknown for all queues
  return QUEUE_NAMES.map((name) => ({ name, waiting: -1, active: -1, warning: false }));
}

async function checkDataStores(): Promise<DataResult[]> {
  const results: DataResult[] = [];

  // PostgreSQL: article count via ingestion service
  try {
    const res = await fetchWithTimeout(`${BASE_URL}:3004/api/v1/feeds/stats`, TIMEOUT_MS);
    if (res.ok) {
      const body = (await res.json()) as { data?: { totalArticles?: number } };
      results.push({ store: 'PostgreSQL (articles)', count: body.data?.totalArticles ?? 0 });
    }
  } catch { results.push({ store: 'PostgreSQL (articles)', count: -1, detail: 'unreachable' }); }

  // PostgreSQL: IOC count via normalization stats
  try {
    const res = await fetchWithTimeout(`${BASE_URL}:3005/api/v1/stats`, TIMEOUT_MS);
    if (res.ok) {
      const body = (await res.json()) as { data?: { totalIocs?: number } };
      results.push({ store: 'PostgreSQL (IOCs)', count: body.data?.totalIocs ?? 0 });
    }
  } catch { results.push({ store: 'PostgreSQL (IOCs)', count: -1, detail: 'unreachable' }); }

  // Elasticsearch: document count via es-indexing health
  try {
    const res = await fetchWithTimeout(`${BASE_URL}:3020/health`, TIMEOUT_MS);
    if (res.ok) {
      const body = (await res.json()) as { esConnected?: boolean; indexedDocs?: number };
      results.push({ store: 'Elasticsearch', count: body.indexedDocs ?? 0, detail: body.esConnected ? 'connected' : 'disconnected' });
    }
  } catch { results.push({ store: 'Elasticsearch', count: -1, detail: 'unreachable' }); }

  // Neo4j: node count via threat-graph stats
  try {
    const res = await fetchWithTimeout(`${BASE_URL}:3012/api/v1/graph/stats`, TIMEOUT_MS);
    if (res.ok) {
      const body = (await res.json()) as { data?: { totalNodes?: number; totalRelationships?: number } };
      results.push({ store: 'Neo4j (nodes)', count: body.data?.totalNodes ?? 0, detail: `${body.data?.totalRelationships ?? 0} relationships` });
    }
  } catch { results.push({ store: 'Neo4j (nodes)', count: -1, detail: 'unreachable' }); }

  return results;
}

// ── Main ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const jsonOutput = process.argv.includes('--json');

  // Run all checks in parallel
  const [services, queues, data] = await Promise.all([
    Promise.all(SERVICES.map(checkService)),
    checkQueues(),
    checkDataStores(),
  ]);

  const upCount = services.filter((s) => s.status === 'up').length;
  const queueWarnings = queues.filter((q) => q.warning).length;
  const summary = `${upCount}/${SERVICES.length} services up, ${queueWarnings} queue warnings`;

  const report: Report = { services, queues, data, summary };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Pretty print
  console.log('\n=== ETIP Pipeline Health Check ===\n');

  console.log('Services:');
  console.log('  Name                  Status   Latency  Detail');
  console.log('  ' + '-'.repeat(60));
  for (const s of services) {
    const icon = s.status === 'up' ? 'OK' : s.status === 'down' ? 'DOWN' : 'ERR';
    const pad = (str: string, len: number) => str.padEnd(len);
    console.log(`  ${pad(s.name, 22)} ${pad(icon, 8)} ${String(s.latencyMs).padStart(5)}ms  ${s.detail ?? ''}`);
  }

  console.log('\nQueues (waiting > 100 = warning):');
  const activeQueues = queues.filter((q) => q.waiting > 0 || q.active > 0);
  if (activeQueues.length === 0) {
    console.log('  All queues idle or unreachable');
  } else {
    for (const q of activeQueues) {
      const warn = q.warning ? ' ⚠' : '';
      console.log(`  ${q.name.padEnd(30)} waiting=${q.waiting} active=${q.active}${warn}`);
    }
  }

  console.log('\nData Stores:');
  for (const d of data) {
    const countStr = d.count >= 0 ? String(d.count) : 'N/A';
    console.log(`  ${d.store.padEnd(25)} count=${countStr}  ${d.detail ?? ''}`);
  }

  console.log(`\nSummary: ${summary}\n`);

  // Exit code: non-zero if any service down
  const downCount = services.filter((s) => s.status === 'down').length;
  if (downCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Health check failed:', err);
  process.exit(2);
});
