/**
 * Re-enrichment Scheduler (#15) — Periodic stale IOC scanner.
 * Finds IOCs whose enrichment is older than type-specific TTLs and
 * enqueues them for re-enrichment with lower priority than real-time.
 */

import type pino from 'pino';
import type { Queue } from 'bullmq';
import type { EnrichmentRepository } from '../repository.js';
import type { EnrichJob } from '../schema.js';

/** Type-specific re-enrichment TTLs in hours */
export const RE_ENRICH_TTL_HOURS: Record<string, number> = {
  ip: 24,           // IPs change hands fast (cloud, DHCP)
  ipv6: 24,
  domain: 72,       // Domains more stable
  fqdn: 72,
  url: 48,          // URLs moderate
  hash_sha256: 168, // 7 days — hashes near-permanent
  hash_sha1: 168,
  hash_md5: 168,
  cve: 72,          // CVE data updates periodically
  email: 168,       // Email addresses stable
};

export const DEFAULT_TTL_HOURS = 72;

/** Lower priority than real-time (1) — lets fresh IOCs go first */
const RE_ENRICH_PRIORITY = 10;

/** Max IOCs to enqueue per scan cycle */
const DEFAULT_BATCH_SIZE = 50;

/** Periodically scans for stale enrichment data and enqueues re-enrichment */
export class ReEnrichScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly repo: EnrichmentRepository,
    private readonly queue: Queue<EnrichJob>,
    private readonly logger: pino.Logger,
    private readonly intervalMs: number = 3_600_000, // 1 hour
    private readonly batchSize: number = DEFAULT_BATCH_SIZE,
  ) {}

  /** Start the periodic scan interval */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.scan(), this.intervalMs);
    this.logger.info(
      { intervalMs: this.intervalMs, batchSize: this.batchSize },
      'Re-enrichment scheduler started',
    );
  }

  /** Stop the scheduler */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Scan for stale IOCs and enqueue re-enrichment jobs */
  async scan(): Promise<number> {
    try {
      const staleIOCs = await this.repo.findStaleEnrichment(
        RE_ENRICH_TTL_HOURS,
        this.batchSize,
      );

      if (staleIOCs.length === 0) {
        this.logger.debug('No stale IOCs found for re-enrichment');
        return 0;
      }

      let queued = 0;
      for (const ioc of staleIOCs) {
        try {
          await this.queue.add(`re-enrich-${ioc.id}`, {
            iocId: ioc.id,
            tenantId: ioc.tenantId,
            iocType: ioc.iocType,
            normalizedValue: ioc.normalizedValue,
            confidence: ioc.confidence,
            severity: ioc.severity,
            existingEnrichment: ioc.enrichmentData as Record<string, unknown> | undefined,
          }, { priority: RE_ENRICH_PRIORITY });
          queued++;
        } catch (err) {
          this.logger.warn(
            { error: (err as Error).message, iocId: ioc.id },
            'Failed to queue re-enrichment job',
          );
        }
      }

      this.logger.info({ found: staleIOCs.length, queued }, 'Re-enrichment scan complete');
      return queued;
    } catch (err) {
      this.logger.error({ error: (err as Error).message }, 'Re-enrichment scan failed');
      return 0;
    }
  }
}
