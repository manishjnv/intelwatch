import { describe, it, expect } from 'vitest';
import { ReportComparator } from '../src/services/report-comparator.js';
import type { ReportRecord } from '../src/services/report-store.js';
import type { RenderedReport } from '../src/services/template-engine.js';

function makeReport(overrides: Partial<ReportRecord> & { result?: unknown }): ReportRecord {
  return {
    id: 'r-1',
    type: 'daily',
    format: 'json',
    status: 'completed',
    title: 'Daily Report',
    tenantId: 't1',
    dateRange: { from: '2026-03-23T00:00:00Z', to: '2026-03-24T00:00:00Z' },
    filters: {},
    configVersion: 1,
    result: null,
    errorMessage: null,
    generationTimeMs: 150,
    createdAt: '2026-03-24T00:00:00Z',
    updatedAt: '2026-03-24T00:00:00Z',
    expiresAt: '2026-04-23T00:00:00Z',
    deleted: false,
    ...overrides,
  };
}

function makeRendered(overrides: Partial<RenderedReport> = {}): RenderedReport {
  return {
    metadata: {
      id: 'r-1',
      title: 'Daily Report',
      type: 'daily',
      format: 'json',
      dateRange: { from: '2026-03-23T00:00:00Z', to: '2026-03-24T00:00:00Z' },
      generatedAt: '2026-03-24T12:00:00Z',
      configVersion: 1,
    },
    sections: [
      {
        title: 'IOC Summary',
        type: 'summary',
        content: { total: 1250, newInPeriod: 45, bySeverity: { critical: 12, high: 28 } },
        order: 1,
      },
      {
        title: 'Feed Health',
        type: 'metrics',
        content: { totalFeeds: 24, activeFeeds: 20, healthScore: 87 },
        order: 2,
      },
    ],
    riskScore: 65,
    ...overrides,
  };
}

describe('ReportComparator', () => {
  const comparator = new ReportComparator();

  it('throws if reportA is not completed', () => {
    const a = makeReport({ status: 'pending' });
    const b = makeReport({ id: 'r-2', result: makeRendered() });
    expect(() => comparator.compare(a, b)).toThrow('not completed');
  });

  it('throws if reportB is not completed', () => {
    const a = makeReport({ result: makeRendered() });
    const b = makeReport({ id: 'r-2', status: 'generating' });
    expect(() => comparator.compare(a, b)).toThrow('not completed');
  });

  it('throws if result data is missing', () => {
    const a = makeReport({ result: null });
    const b = makeReport({ id: 'r-2', result: makeRendered() });
    expect(() => comparator.compare(a, b)).toThrow('no result data');
  });

  it('compares risk scores correctly — worsened', () => {
    const a = makeReport({ result: makeRendered({ riskScore: 40 }) });
    const b = makeReport({ id: 'r-2', result: makeRendered({ riskScore: 75 }) });
    const diff = comparator.compare(a, b);

    expect(diff.riskScore.a).toBe(40);
    expect(diff.riskScore.b).toBe(75);
    expect(diff.riskScore.delta).toBe(35);
    expect(diff.riskScore.direction).toBe('worsened');
  });

  it('compares risk scores correctly — improved', () => {
    const a = makeReport({ result: makeRendered({ riskScore: 80 }) });
    const b = makeReport({ id: 'r-2', result: makeRendered({ riskScore: 50 }) });
    const diff = comparator.compare(a, b);

    expect(diff.riskScore.delta).toBe(-30);
    expect(diff.riskScore.direction).toBe('improved');
  });

  it('compares risk scores correctly — unchanged', () => {
    const a = makeReport({ result: makeRendered({ riskScore: 60 }) });
    const b = makeReport({ id: 'r-2', result: makeRendered({ riskScore: 60 }) });
    const diff = comparator.compare(a, b);

    expect(diff.riskScore.delta).toBe(0);
    expect(diff.riskScore.direction).toBe('unchanged');
  });

  it('detects numeric changes in matching sections', () => {
    const renderedA = makeRendered({
      sections: [
        { title: 'IOC Summary', type: 'summary', content: { total: 1000, newInPeriod: 30 }, order: 1 },
      ],
    });
    const renderedB = makeRendered({
      sections: [
        { title: 'IOC Summary', type: 'summary', content: { total: 1500, newInPeriod: 50 }, order: 1 },
      ],
    });

    const a = makeReport({ result: renderedA });
    const b = makeReport({ id: 'r-2', result: renderedB });
    const diff = comparator.compare(a, b);

    expect(diff.sectionDeltas).toHaveLength(1);
    expect(diff.sectionDeltas[0]!.title).toBe('IOC Summary');

    const totalChange = diff.sectionDeltas[0]!.changes.find((c) => c.metric === 'total');
    expect(totalChange).toBeDefined();
    expect(totalChange!.a).toBe(1000);
    expect(totalChange!.b).toBe(1500);
    expect(totalChange!.delta).toBe(500);
    expect(totalChange!.percentChange).toBe(50);
  });

  it('flattens nested objects (e.g., bySeverity)', () => {
    const renderedA = makeRendered({
      sections: [
        { title: 'IOC Summary', type: 'summary', content: { bySeverity: { critical: 10, high: 20 } }, order: 1 },
      ],
    });
    const renderedB = makeRendered({
      sections: [
        { title: 'IOC Summary', type: 'summary', content: { bySeverity: { critical: 15, high: 20 } }, order: 1 },
      ],
    });

    const a = makeReport({ result: renderedA });
    const b = makeReport({ id: 'r-2', result: renderedB });
    const diff = comparator.compare(a, b);

    const criticalChange = diff.sectionDeltas[0]!.changes.find((c) => c.metric === 'bySeverity.critical');
    expect(criticalChange).toBeDefined();
    expect(criticalChange!.delta).toBe(5);
    expect(criticalChange!.percentChange).toBe(50);

    // high unchanged — should not appear
    const highChange = diff.sectionDeltas[0]!.changes.find((c) => c.metric === 'bySeverity.high');
    expect(highChange).toBeUndefined();
  });

  it('skips sections that only exist in one report', () => {
    const renderedA = makeRendered({
      sections: [
        { title: 'Only In A', type: 'summary', content: { total: 100 }, order: 1 },
      ],
    });
    const renderedB = makeRendered({
      sections: [
        { title: 'Only In B', type: 'summary', content: { total: 200 }, order: 1 },
      ],
    });

    const a = makeReport({ result: renderedA });
    const b = makeReport({ id: 'r-2', result: renderedB });
    const diff = comparator.compare(a, b);

    expect(diff.sectionDeltas).toHaveLength(0);
  });

  it('returns report metadata in result', () => {
    const a = makeReport({ id: 'a1', title: 'Report A', result: makeRendered() });
    const b = makeReport({ id: 'b1', title: 'Report B', result: makeRendered() });
    const diff = comparator.compare(a, b);

    expect(diff.reportA.id).toBe('a1');
    expect(diff.reportA.title).toBe('Report A');
    expect(diff.reportB.id).toBe('b1');
    expect(diff.reportB.title).toBe('Report B');
  });
});
