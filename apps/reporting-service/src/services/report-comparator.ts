import { AppError } from '@etip/shared-utils';
import type { ReportRecord } from './report-store.js';
import type { RenderedReport } from './template-engine.js';

export interface ComparisonResult {
  reportA: { id: string; title: string; type: string; dateRange: { from: string; to: string } };
  reportB: { id: string; title: string; type: string; dateRange: { from: string; to: string } };
  riskScore: { a: number; b: number; delta: number; direction: 'improved' | 'worsened' | 'unchanged' };
  sectionDeltas: SectionDelta[];
}

export interface SectionDelta {
  title: string;
  type: string;
  changes: MetricChange[];
}

export interface MetricChange {
  metric: string;
  a: number;
  b: number;
  delta: number;
  percentChange: number;
}

/**
 * Compares two completed reports and produces a structured diff.
 * Both reports must be completed and have JSON-serializable results.
 */
export class ReportComparator {
  compare(reportA: ReportRecord, reportB: ReportRecord): ComparisonResult {
    if (reportA.status !== 'completed') {
      throw new AppError(409, `Report ${reportA.id} is not completed (status: ${reportA.status})`, 'REPORT_NOT_READY');
    }
    if (reportB.status !== 'completed') {
      throw new AppError(409, `Report ${reportB.id} is not completed (status: ${reportB.status})`, 'REPORT_NOT_READY');
    }

    const dataA = reportA.result as RenderedReport | null;
    const dataB = reportB.result as RenderedReport | null;

    if (!dataA || !dataB) {
      throw new AppError(500, 'One or both reports have no result data', 'RESULT_MISSING');
    }

    const riskA = dataA.riskScore ?? 0;
    const riskB = dataB.riskScore ?? 0;
    const riskDelta = riskB - riskA;

    const sectionDeltas = this._compareSections(dataA, dataB);

    return {
      reportA: { id: reportA.id, title: reportA.title, type: reportA.type, dateRange: reportA.dateRange },
      reportB: { id: reportB.id, title: reportB.title, type: reportB.type, dateRange: reportB.dateRange },
      riskScore: {
        a: riskA,
        b: riskB,
        delta: riskDelta,
        direction: riskDelta < 0 ? 'improved' : riskDelta > 0 ? 'worsened' : 'unchanged',
      },
      sectionDeltas,
    };
  }

  private _compareSections(dataA: RenderedReport, dataB: RenderedReport): SectionDelta[] {
    const deltas: SectionDelta[] = [];
    const sectionMapB = new Map(dataB.sections.map((s) => [s.title, s]));

    for (const sA of dataA.sections) {
      const sB = sectionMapB.get(sA.title);
      if (!sB) continue;

      const changes = this._compareContent(sA.content, sB.content);
      if (changes.length > 0) {
        deltas.push({ title: sA.title, type: sA.type, changes });
      }
    }

    return deltas;
  }

  private _compareContent(contentA: unknown, contentB: unknown): MetricChange[] {
    const changes: MetricChange[] = [];

    if (typeof contentA !== 'object' || contentA === null) return changes;
    if (typeof contentB !== 'object' || contentB === null) return changes;
    if (Array.isArray(contentA) || Array.isArray(contentB)) return changes;

    const a = contentA as Record<string, unknown>;
    const b = contentB as Record<string, unknown>;

    for (const key of Object.keys(a)) {
      const valA = a[key];
      const valB = b[key];

      if (typeof valA === 'number' && typeof valB === 'number') {
        const delta = valB - valA;
        if (delta !== 0) {
          changes.push({
            metric: key,
            a: valA,
            b: valB,
            delta,
            percentChange: valA !== 0 ? Math.round((delta / valA) * 100) : valB !== 0 ? 100 : 0,
          });
        }
      } else if (typeof valA === 'object' && valA !== null && typeof valB === 'object' && valB !== null) {
        // Flatten one level (e.g., bySeverity)
        const nestedChanges = this._compareContent(valA, valB);
        for (const nc of nestedChanges) {
          changes.push({ ...nc, metric: `${key}.${nc.metric}` });
        }
      }
    }

    return changes;
  }
}
