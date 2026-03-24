/**
 * @module services/cache-invalidator
 * @description Debounced event-driven cache invalidation.
 * Buffers incoming events into a 5-second window, then batch-invalidates
 * relevant cache namespaces. Prevents Redis thrashing during burst events.
 *
 * (#1) Severity-aware: low/medium IOC events skip dashboard invalidation.
 * Only HIGH/CRITICAL events flush the expensive 48hr dashboard cache.
 */
import { getLogger } from '../logger.js';
import type { CacheManager } from './cache-manager.js';

/** Severities that justify flushing the expensive 48hr dashboard cache. */
const DASHBOARD_WORTHY_SEVERITIES = new Set(['high', 'critical', 'HIGH', 'CRITICAL']);

/**
 * Maps event types to cache namespace prefixes that should be invalidated.
 * 'dashboard' entries are conditionally applied based on severity.
 */
const EVENT_NAMESPACE_MAP: Record<string, { always: string[]; dashboardOnHighSeverity: boolean }> = {
  'ioc.created':              { always: ['ioc'],               dashboardOnHighSeverity: true },
  'ioc.updated':              { always: ['ioc'],               dashboardOnHighSeverity: true },
  'ioc.normalized':           { always: ['ioc'],               dashboardOnHighSeverity: false },
  'ioc.enriched':             { always: ['enrich', 'ioc'],     dashboardOnHighSeverity: true },
  'ioc.expired':              { always: ['ioc'],               dashboardOnHighSeverity: true },
  'feed.fetched':             { always: ['feed', 'dashboard'], dashboardOnHighSeverity: false },
  'feed.parsed':              { always: ['feed'],              dashboardOnHighSeverity: false },
  'feed.error':               { always: ['feed'],              dashboardOnHighSeverity: false },
  'actor.updated':            { always: ['actor', 'dashboard'], dashboardOnHighSeverity: false },
  'malware.detected':         { always: ['malware', 'dashboard'], dashboardOnHighSeverity: false },
  'vuln.published':           { always: ['vuln', 'dashboard'], dashboardOnHighSeverity: false },
  'correlation.match':        { always: ['correlation', 'dashboard'], dashboardOnHighSeverity: false },
  'drp.alert.created':        { always: ['drp', 'dashboard'], dashboardOnHighSeverity: false },
  'graph.node.created':       { always: ['graph'],             dashboardOnHighSeverity: false },
  'hunt.completed':           { always: ['hunt'],              dashboardOnHighSeverity: false },
  'enrichment.budget.warning': { always: ['enrich'],           dashboardOnHighSeverity: false },
};

/** Optional context passed with events for smarter invalidation. */
export interface EventContext {
  severity?: string;
}

/** Buffered invalidation entry. */
interface InvalidationEntry {
  tenantId: string;
  namespaces: Set<string>;
}

export interface CacheInvalidatorDeps {
  cacheManager: CacheManager;
  flushIntervalMs?: number;
}

/**
 * Debounced cache invalidator. Buffers events for a configurable interval
 * (default 5s), then flushes all accumulated invalidations in one batch.
 */
export class CacheInvalidator {
  private readonly cacheManager: CacheManager;
  private readonly flushIntervalMs: number;
  private buffer = new Map<string, InvalidationEntry>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /** Total events processed since start. */
  totalEventsProcessed = 0;
  /** Total flushes executed since start. */
  totalFlushes = 0;
  /** Total keys invalidated since start. */
  totalKeysInvalidated = 0;

  constructor(deps: CacheInvalidatorDeps) {
    this.cacheManager = deps.cacheManager;
    this.flushIntervalMs = deps.flushIntervalMs ?? 5000;
  }

  /**
   * Record an event for deferred invalidation.
   * Events are buffered and flushed in batch at the next interval tick.
   *
   * (#1) Severity-aware: IOC events with low/medium severity skip dashboard
   * invalidation. The 48hr dashboard cache is only flushed for HIGH/CRITICAL.
   *
   * @param eventType - Event type from EVENTS constants (e.g. 'ioc.created')
   * @param tenantId - Tenant whose cache should be invalidated
   * @param context - Optional context (severity) for smarter invalidation
   */
  recordEvent(eventType: string, tenantId: string, context?: EventContext): void {
    const mapping = EVENT_NAMESPACE_MAP[eventType];
    if (!mapping) return;

    // Build namespace list: always-invalidate + conditional dashboard
    const namespacesToInvalidate = [...mapping.always];
    if (mapping.dashboardOnHighSeverity) {
      const severity = context?.severity;
      if (severity && DASHBOARD_WORTHY_SEVERITIES.has(severity)) {
        namespacesToInvalidate.push('dashboard');
      }
      // No severity provided = skip dashboard (conservative: don't flush expensive cache on ambiguous events)
    }

    if (namespacesToInvalidate.length === 0) return;

    this.totalEventsProcessed++;
    const entry = this.buffer.get(tenantId);
    if (entry) {
      for (const ns of namespacesToInvalidate) entry.namespaces.add(ns);
    } else {
      this.buffer.set(tenantId, { tenantId, namespaces: new Set(namespacesToInvalidate) });
    }
  }

  /** Start the debounce flush interval. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
    getLogger().info({ intervalMs: this.flushIntervalMs }, 'Cache invalidator started');
  }

  /** Stop the debounce flush interval and flush remaining buffer. */
  async stop(): Promise<void> {
    this.running = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
    getLogger().info('Cache invalidator stopped');
  }

  /** Flush the event buffer, executing all pending invalidations. */
  async flush(): Promise<number> {
    if (this.buffer.size === 0) return 0;

    const logger = getLogger();
    const entries = Array.from(this.buffer.values());
    this.buffer.clear();

    let totalInvalidated = 0;
    for (const entry of entries) {
      for (const ns of entry.namespaces) {
        const prefix = `etip:${entry.tenantId}:${ns}`;
        try {
          const count = await this.cacheManager.invalidateByPrefix(prefix);
          totalInvalidated += count;
        } catch (err) {
          logger.warn({ prefix, err: (err as Error).message }, 'Invalidation failed for prefix');
        }
      }
    }

    this.totalFlushes++;
    this.totalKeysInvalidated += totalInvalidated;
    if (totalInvalidated > 0) {
      logger.debug(
        { tenants: entries.length, keysInvalidated: totalInvalidated },
        'Cache invalidation flush completed',
      );
    }

    return totalInvalidated;
  }

  /** Get invalidator stats. */
  getStats(): {
    running: boolean;
    bufferSize: number;
    totalEventsProcessed: number;
    totalFlushes: number;
    totalKeysInvalidated: number;
  } {
    return {
      running: this.running,
      bufferSize: this.buffer.size,
      totalEventsProcessed: this.totalEventsProcessed,
      totalFlushes: this.totalFlushes,
      totalKeysInvalidated: this.totalKeysInvalidated,
    };
  }
}
