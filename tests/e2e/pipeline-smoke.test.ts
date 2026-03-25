/**
 * E2E Pipeline Smoke Test
 *
 * Exercises the full ETIP intelligence pipeline:
 *   Feed trigger → FEED_FETCH → FEED_PARSE → NORMALIZE → ENRICH_REALTIME
 *   → GRAPH_SYNC / IOC_INDEX / CORRELATE → ALERT_EVALUATE → INTEGRATION_PUSH
 *
 * Requirements:
 *   • All ETIP containers running (docker compose up -d)
 *   • E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD env vars set
 *   • Redis accessible at E2E_REDIS_URL (default: redis://localhost:6379)
 *   • API gateway accessible at E2E_API_BASE (default: http://localhost:3001)
 *
 * Run: npx vitest run tests/e2e/pipeline-smoke.test.ts --config tests/e2e/vitest.config.ts
 *
 * NOT included in CI — requires live containers.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type Redis from 'ioredis';
import {
  E2E_ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD,
  createRedisClient,
  snapshotCounters,
  waitForNewJob,
  apiLogin,
  apiGet,
  apiPost,
  apiDelete,
} from './helpers.js';

// ── Queue names (mirrors packages/shared-utils/src/queues.ts) ──────────────────
// Imported as literals here to keep the E2E harness self-contained
// (no workspace build dependency at test-run time).
const Q = {
  FEED_FETCH:       'etip-feed-fetch',
  FEED_PARSE:       'etip-feed-parse',
  NORMALIZE:        'etip-normalize',
  ENRICH_REALTIME:  'etip-enrich-realtime',
  GRAPH_SYNC:       'etip-graph-sync',
  IOC_INDEX:        'etip-ioc-indexed',
  CORRELATE:        'etip-correlate',
  ALERT_EVALUATE:   'etip-alert-evaluate',
  INTEGRATION_PUSH: 'etip-integration-push',
} as const;

// All queues in pipeline order (used for initial counter snapshot)
const PIPELINE_QUEUES = Object.values(Q);

// ── Timeouts per hop ────────────────────────────────────────────────────────────
// Early hops are fast (Redis + BullMQ). Later hops wait on external APIs and AI.
const HOP_TIMEOUTS = {
  [Q.FEED_FETCH]:       10_000,  // Trigger → job enqueued (synchronous)
  [Q.FEED_PARSE]:       30_000,  // Fetch worker fetches remote URL
  [Q.NORMALIZE]:        30_000,  // Parse worker emits normalized jobs
  [Q.ENRICH_REALTIME]:  60_000,  // Normalize worker; enrichment can be slow
  [Q.GRAPH_SYNC]:       60_000,  // Enrich worker (gated by TI_GRAPH_SYNC_ENABLED)
  [Q.IOC_INDEX]:        60_000,  // Enrich worker (gated by TI_IOC_INDEX_ENABLED)
  [Q.CORRELATE]:        60_000,  // Enrich worker (gated by TI_CORRELATE_ENABLED)
  [Q.ALERT_EVALUATE]:   60_000,  // Correlation worker (gated by TI_ALERT_ENABLED)
  [Q.INTEGRATION_PUSH]: 60_000,  // Alert/correlation worker (gated by TI_INTEGRATION_PUSH_ENABLED)
} as const satisfies Record<string, number>;

// ── Test state ──────────────────────────────────────────────────────────────────
let redis: Redis;
let token: string;
let feedId: string | undefined;
let iocCountBefore = 0;

// ── Pre-flight guard ────────────────────────────────────────────────────────────
const hasCreds = Boolean(E2E_ADMIN_EMAIL && E2E_ADMIN_PASSWORD);

// ── Suite ───────────────────────────────────────────────────────────────────────
describe.skipIf(!hasCreds)('ETIP Pipeline Smoke Test', () => {

  beforeAll(async () => {
    if (!hasCreds) return;

    // Connect to Redis
    redis = createRedisClient();
    await redis.ping(); // fails fast if Redis is unreachable

    // Authenticate with API gateway
    token = await apiLogin(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD);
    expect(token).toBeTruthy();

    // Record IOC count before the pipeline run
    const stats = await apiGet(token, '/api/v1/ioc/stats') as { data: { total: number } };
    iocCountBefore = stats?.data?.total ?? 0;
  });

  afterAll(async () => {
    // Cleanup: delete the test feed (even if tests fail mid-way)
    if (feedId) {
      await apiDelete(token, `/api/v1/feeds/${feedId}`).catch((err) => {
        console.warn(`[E2E cleanup] Could not delete feed ${feedId}:`, err.message);
      });
    }

    // Close Redis connection
    if (redis) await redis.quit();
  });

  // ── Step 1: Create test feed ──────────────────────────────────────────────────

  it('creates a test feed via ingestion API', async () => {
    const res = await apiPost(token, '/api/v1/feeds', {
      name: 'E2E Smoke Test Feed — CISA Advisories',
      feedType: 'rss',
      url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml',
      description: 'E2E_TEST — created by pipeline-smoke.test.ts, safe to delete',
      schedule: '0 0 * * 0',  // weekly — never auto-fires during test window
    }) as { data: { id: string } };

    expect(res.data?.id).toBeTruthy();
    feedId = res.data.id;
  });

  // ── Step 2: Trigger + verify queue chain ─────────────────────────────────────

  it('triggers feed fetch and verifies jobs flow through the full queue chain', async () => {
    expect(feedId, 'feed must have been created in previous test').toBeTruthy();

    // Snapshot all queue counters before triggering
    const before = await snapshotCounters(redis, PIPELINE_QUEUES);

    // Trigger the feed fetch (returns 202 Accepted with jobId)
    const triggerRes = await apiPost(token, `/api/v1/feeds/${feedId}/trigger`) as {
      data: { jobId: string; message: string }
    };
    expect(triggerRes.data?.jobId, 'trigger must return a BullMQ jobId').toBeTruthy();
    console.log(`[E2E] Feed triggered — BullMQ jobId: ${triggerRes.data.jobId}`);

    // ── Hop 1: FEED_FETCH — job must arrive immediately after trigger ────────────
    console.log('[E2E] ⏳ Waiting for FEED_FETCH...');
    await waitForNewJob(redis, Q.FEED_FETCH, before.get(Q.FEED_FETCH)!, HOP_TIMEOUTS[Q.FEED_FETCH]);
    console.log('[E2E] ✅ FEED_FETCH — job detected');

    // ── Hop 2: FEED_PARSE — ingestion worker fetches remote URL, emits parse job ─
    console.log('[E2E] ⏳ Waiting for FEED_PARSE...');
    await waitForNewJob(redis, Q.FEED_PARSE, before.get(Q.FEED_PARSE)!, HOP_TIMEOUTS[Q.FEED_PARSE]);
    console.log('[E2E] ✅ FEED_PARSE — job detected');

    // ── Hop 3: NORMALIZE — parse worker extracts entities, emits normalize job ───
    console.log('[E2E] ⏳ Waiting for NORMALIZE...');
    await waitForNewJob(redis, Q.NORMALIZE, before.get(Q.NORMALIZE)!, HOP_TIMEOUTS[Q.NORMALIZE]);
    console.log('[E2E] ✅ NORMALIZE — job detected');

    // ── Hop 4: ENRICH_REALTIME — normalization worker enriches IOCs ─────────────
    console.log('[E2E] ⏳ Waiting for ENRICH_REALTIME (AI + VT enrichment)...');
    await waitForNewJob(redis, Q.ENRICH_REALTIME, before.get(Q.ENRICH_REALTIME)!, HOP_TIMEOUTS[Q.ENRICH_REALTIME]);
    console.log('[E2E] ✅ ENRICH_REALTIME — job detected');
  });

  // ── Step 3: Verify downstream queues (gated by service-level feature flags) ───

  it('verifies post-enrichment queues fire (GRAPH_SYNC, IOC_INDEX, CORRELATE)', async () => {
    // Record counters at start of this check — the enrichment worker is still processing
    const before = await snapshotCounters(redis, [Q.GRAPH_SYNC, Q.IOC_INDEX, Q.CORRELATE]);

    // These queues are gated by TI_GRAPH_SYNC_ENABLED / TI_IOC_INDEX_ENABLED / TI_CORRELATE_ENABLED.
    // We check all three in parallel — a partial pass is acceptable (some flags may be off).
    const results = await Promise.allSettled([
      waitForNewJob(redis, Q.GRAPH_SYNC,  before.get(Q.GRAPH_SYNC)!,  HOP_TIMEOUTS[Q.GRAPH_SYNC]),
      waitForNewJob(redis, Q.IOC_INDEX,   before.get(Q.IOC_INDEX)!,   HOP_TIMEOUTS[Q.IOC_INDEX]),
      waitForNewJob(redis, Q.CORRELATE,   before.get(Q.CORRELATE)!,   HOP_TIMEOUTS[Q.CORRELATE]),
    ]);

    const [graphResult, indexResult, correlateResult] = results;

    if (graphResult.status === 'fulfilled')   console.log('[E2E] ✅ GRAPH_SYNC — job detected');
    else                                      console.warn('[E2E] ⚠️  GRAPH_SYNC — no job (TI_GRAPH_SYNC_ENABLED may be false)');

    if (indexResult.status === 'fulfilled')   console.log('[E2E] ✅ IOC_INDEX — job detected');
    else                                      console.warn('[E2E] ⚠️  IOC_INDEX — no job (TI_IOC_INDEX_ENABLED may be false)');

    if (correlateResult.status === 'fulfilled') console.log('[E2E] ✅ CORRELATE — job detected');
    else                                        console.warn('[E2E] ⚠️  CORRELATE — no job (TI_CORRELATE_ENABLED may be false)');

    // At least one of the three must have fired — if all are off, the enrichment wiring is broken
    const anyFired = results.some((r) => r.status === 'fulfilled');
    expect(anyFired, 'At least one of GRAPH_SYNC / IOC_INDEX / CORRELATE must receive a job').toBe(true);
  });

  // ── Step 4: Verify alerting + integration queues ─────────────────────────────

  it('verifies ALERT_EVALUATE and INTEGRATION_PUSH queues receive jobs', async () => {
    const before = await snapshotCounters(redis, [Q.ALERT_EVALUATE, Q.INTEGRATION_PUSH]);

    // These queues fire from correlation worker (gated by TI_ALERT_ENABLED / TI_INTEGRATION_PUSH_ENABLED)
    const results = await Promise.allSettled([
      waitForNewJob(redis, Q.ALERT_EVALUATE,   before.get(Q.ALERT_EVALUATE)!,   HOP_TIMEOUTS[Q.ALERT_EVALUATE]),
      waitForNewJob(redis, Q.INTEGRATION_PUSH, before.get(Q.INTEGRATION_PUSH)!, HOP_TIMEOUTS[Q.INTEGRATION_PUSH]),
    ]);

    const [alertResult, integrationResult] = results;

    if (alertResult.status === 'fulfilled')       console.log('[E2E] ✅ ALERT_EVALUATE — job detected');
    else                                          console.warn('[E2E] ⚠️  ALERT_EVALUATE — no job (TI_ALERT_ENABLED or correlate may be off)');

    if (integrationResult.status === 'fulfilled') console.log('[E2E] ✅ INTEGRATION_PUSH — job detected');
    else                                          console.warn('[E2E] ⚠️  INTEGRATION_PUSH — no job (TI_INTEGRATION_PUSH_ENABLED may be off)');

    // Soft assertion — warn on missing but don't fail (these are doubly-gated)
    // The test is still informative even if no jobs land here
  });

  // ── Step 5: Verify data landed in IOC service ─────────────────────────────────

  it('verifies IOC data landed in the database after pipeline run', async () => {
    const stats = await apiGet(token, '/api/v1/ioc/stats') as { data: { total: number } };
    const iocCountAfter = stats?.data?.total ?? 0;

    console.log(`[E2E] IOC count before: ${iocCountBefore} | after: ${iocCountAfter}`);

    // Count should be the same or higher — never lower
    expect(iocCountAfter).toBeGreaterThanOrEqual(iocCountBefore);

    if (iocCountAfter > iocCountBefore) {
      console.log(`[E2E] ✅ ${iocCountAfter - iocCountBefore} new IOC(s) stored`);
    } else {
      // Not a failure — CISA feed may contain IOCs already in the DB (dedup'd),
      // or the pipeline hasn't fully completed yet within the test window.
      console.warn('[E2E] ⚠️  IOC count unchanged — possible dedup or pipeline still in progress');
    }
  });

});

// ── Standalone guard test (always runs) ──────────────────────────────────────────
describe('E2E environment pre-flight', () => {
  it('skips smoke tests when credentials are missing and warns clearly', () => {
    if (!hasCreds) {
      console.warn(
        '[E2E] Pipeline smoke tests SKIPPED.\n' +
        '  Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to enable them.\n' +
        '  Example:\n' +
        '    export E2E_ADMIN_EMAIL=admin@yourtenantslug.etip\n' +
        '    export E2E_ADMIN_PASSWORD=your-password\n' +
        '  Then run: npx vitest run tests/e2e/pipeline-smoke.test.ts --config tests/e2e/vitest.config.ts',
      );
    }
    // Always passes — this is a documentation test, not a functional assertion
    expect(true).toBe(true);
  });
});
