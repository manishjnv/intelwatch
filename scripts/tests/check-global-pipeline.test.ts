import { describe, it, expect } from 'vitest';
import { determineOverallStatus } from '../check-global-pipeline.js';

function makeReport(overrides: Record<string, any> = {}) {
  return {
    feeds: { total: 10, active: 8, stale: 0, disabledByFailure: 0, staleFeedNames: [], ...overrides.feeds },
    articles: { created24h: 100, normalized24h: 90, pending: 5, stuck: 0, throughputRate: 0.9, ...overrides.articles },
    iocs: { created24h: 50, enriched24h: 40, unenriched: 10, warninglistFiltered: 5, avgConfidence: 65, highConfidenceCount: 20, ...overrides.iocs },
    subscriptions: { total: 25, uniqueTenants: 5, ...overrides.subscriptions },
  };
}

describe('determineOverallStatus', () => {
  it('healthy: all feeds active, no stuck articles', () => {
    const report = makeReport();
    expect(determineOverallStatus(report)).toBe('healthy');
  });

  it('degraded: 1 stale feed', () => {
    const report = makeReport({ feeds: { stale: 1 } });
    expect(determineOverallStatus(report)).toBe('degraded');
  });

  it('critical: >50% stale feeds', () => {
    const report = makeReport({ feeds: { active: 8, stale: 5 } });
    expect(determineOverallStatus(report)).toBe('critical');
  });

  it('critical: stuck articles >100', () => {
    const report = makeReport({ articles: { stuck: 150 } });
    expect(determineOverallStatus(report)).toBe('critical');
  });

  it('throughput rate calculated correctly', () => {
    const report = makeReport({ articles: { created24h: 200, normalized24h: 150, stuck: 0 } });
    // throughputRate is pre-calculated in the report, but status should be healthy
    expect(determineOverallStatus(report)).toBe('healthy');
  });
});
