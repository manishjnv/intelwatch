import { randomUUID } from 'node:crypto';
import type { TyposquatDetector } from './typosquat-detector.js';
import type { AlertManager } from './alert-manager.js';
import type { DRPStore } from '../schemas/store.js';
import type { TyposquatMethod, TyposquatCandidate, ScanResult } from '../schemas/drp.js';
import type { BatchTyposquatResult, BatchTyposquatReport } from '../schemas/p1-p2.js';

/** #6 Batch typosquatting scan — multi-domain, cross-domain dedup, consolidated report. */
export class BatchTyposquatScanner {
  private readonly detector: TyposquatDetector;
  private readonly alertManager: AlertManager;
  private readonly store: DRPStore;

  constructor(detector: TyposquatDetector, alertManager: AlertManager, store: DRPStore) {
    this.detector = detector;
    this.alertManager = alertManager;
    this.store = store;
  }

  /** Scan multiple domains, deduplicate cross-domain, produce consolidated report. */
  scan(
    tenantId: string,
    domains: string[],
    methods: TyposquatMethod[],
    maxPerDomain: number,
    dedup: boolean,
  ): BatchTyposquatReport {
    const startTime = Date.now();
    const globalSeen = new Set<string>();
    let crossDomainDuplicates = 0;
    const results: BatchTyposquatResult[] = [];
    let totalCandidates = 0;
    let totalRegistered = 0;
    let totalAlerts = 0;

    for (const domain of domains) {
      const candidates = this.detector.scan(domain, methods);
      const filtered = dedup ? this.dedup(candidates, globalSeen) : candidates;
      crossDomainDuplicates += candidates.length - filtered.length;

      const limited = filtered.slice(0, maxPerDomain);

      // Create alerts for high-risk registered candidates
      let alertsCreated = 0;
      for (const c of limited.filter((c) => c.riskScore >= 0.4 && c.isRegistered)) {
        const alert = this.alertManager.create(tenantId, {
          assetId: domain,
          type: 'typosquatting',
          title: `Batch typosquat: ${c.domain} (${c.method})`,
          description: `Domain ${c.domain} via ${c.method}. Similarity: ${(c.similarity * 100).toFixed(1)}%.`,
          detectedValue: c.domain,
          evidence: [{
            id: randomUUID(),
            type: 'dns_record',
            title: `Typosquat: ${c.domain}`,
            data: { method: c.method, similarity: c.similarity, hostingProvider: c.hostingProvider },
            collectedAt: new Date().toISOString(),
          }],
          signals: [
            { signalType: `${c.method}_similarity`, rawValue: c.similarity, description: `${c.method}: ${c.domain}` },
            { signalType: 'domain_registered', rawValue: 0.9, description: 'Domain is registered' },
          ],
        });
        if (alert) alertsCreated++;
      }

      const regCount = limited.filter((c) => c.isRegistered).length;
      totalCandidates += limited.length;
      totalRegistered += regCount;
      totalAlerts += alertsCreated;

      results.push({
        domain,
        candidatesFound: limited.length,
        registeredCount: regCount,
        alertsCreated,
        topCandidates: limited.slice(0, 5),
      });
    }

    // Record scan
    const scan: ScanResult = {
      id: randomUUID(),
      tenantId,
      assetId: domains.join(','),
      scanType: 'typosquatting',
      status: 'completed',
      findingsCount: totalCandidates,
      alertsCreated: totalAlerts,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
    this.store.setScan(tenantId, scan);

    return {
      scanId: scan.id,
      domains,
      totalCandidates,
      totalRegistered,
      totalAlerts,
      crossDomainDuplicates,
      results,
      durationMs: scan.durationMs,
    };
  }

  /** Remove candidates already seen in a previous domain's scan. */
  private dedup(candidates: TyposquatCandidate[], seen: Set<string>): TyposquatCandidate[] {
    const result: TyposquatCandidate[] = [];
    for (const c of candidates) {
      if (seen.has(c.domain)) continue;
      seen.add(c.domain);
      result.push(c);
    }
    return result;
  }
}
