import { AppError } from '@etip/shared-utils';
import type { HuntingStore } from '../schemas/store.js';
import type { HuntSession } from '../schemas/hunting.js';

export type ExportFormat = 'json' | 'csv' | 'stix';

export interface ExportResult {
  format: ExportFormat;
  content: string;
  filename: string;
  mimeType: string;
  entityCount: number;
  generatedAt: string;
}

/**
 * #15 Hunt Export & Reporting — generate investigation reports.
 *
 * Exports hunt sessions with entities, timeline, and findings
 * in JSON, CSV, or STIX 2.1 bundle format.
 */
export class HuntExport {
  private readonly store: HuntingStore;

  constructor(store: HuntingStore) {
    this.store = store;
  }

  /** Export a hunt in the specified format. */
  export(tenantId: string, huntId: string, format: ExportFormat): ExportResult {
    const session = this.requireHunt(tenantId, huntId);

    switch (format) {
      case 'json':
        return this.exportJson(session);
      case 'csv':
        return this.exportCsv(session);
      case 'stix':
        return this.exportStix(session);
      default:
        throw new AppError(400, `Unsupported format: ${format}`, 'INVALID_FORMAT');
    }
  }

  /** Export as JSON report. */
  private exportJson(session: HuntSession): ExportResult {
    const report = {
      report: {
        title: session.title,
        hypothesis: session.hypothesis,
        status: session.status,
        severity: session.severity,
        createdAt: session.createdAt,
        completedAt: session.completedAt,
        assignedTo: session.assignedTo,
      },
      entities: session.entities.map((e) => ({
        type: e.type,
        value: e.value,
        addedAt: e.addedAt,
        notes: e.notes,
        pivotDepth: e.pivotDepth,
      })),
      timeline: session.timeline.map((e) => ({
        type: e.type,
        description: e.description,
        timestamp: e.timestamp,
      })),
      findings: session.findings,
      tags: session.tags,
      queryCount: session.queryHistory.length,
      correlationLeadCount: session.correlationLeads.length,
    };

    return {
      format: 'json',
      content: JSON.stringify(report, null, 2),
      filename: `hunt-${session.id}.json`,
      mimeType: 'application/json',
      entityCount: session.entities.length,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Export entities as CSV. */
  private exportCsv(session: HuntSession): ExportResult {
    const header = 'type,value,added_at,added_by,notes,pivot_depth';
    const rows = session.entities.map((e) =>
      [
        e.type,
        this.escapeCsv(e.value),
        e.addedAt,
        e.addedBy,
        this.escapeCsv(e.notes ?? ''),
        e.pivotDepth,
      ].join(','),
    );

    const content = [header, ...rows].join('\n');

    return {
      format: 'csv',
      content,
      filename: `hunt-${session.id}-entities.csv`,
      mimeType: 'text/csv',
      entityCount: session.entities.length,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Export as STIX 2.1 bundle. */
  private exportStix(session: HuntSession): ExportResult {
    const stixObjects: unknown[] = [];

    // Report object
    stixObjects.push({
      type: 'report',
      spec_version: '2.1',
      id: `report--${session.id}`,
      created: session.createdAt,
      modified: session.updatedAt,
      name: session.title,
      description: session.hypothesis,
      report_types: ['threat-report'],
      object_refs: session.entities.map((e) =>
        `indicator--${e.id}`,
      ),
    });

    // Indicator objects for each entity
    for (const entity of session.entities) {
      const pattern = this.entityToStixPattern(entity.type, entity.value);
      if (pattern) {
        stixObjects.push({
          type: 'indicator',
          spec_version: '2.1',
          id: `indicator--${entity.id}`,
          created: entity.addedAt,
          modified: entity.addedAt,
          name: `${entity.type}: ${entity.value}`,
          description: entity.notes ?? '',
          pattern,
          pattern_type: 'stix',
          valid_from: entity.addedAt,
          labels: session.tags,
        });
      }
    }

    const bundle = {
      type: 'bundle',
      id: `bundle--${session.id}`,
      objects: stixObjects,
    };

    return {
      format: 'stix',
      content: JSON.stringify(bundle, null, 2),
      filename: `hunt-${session.id}-stix.json`,
      mimeType: 'application/json',
      entityCount: session.entities.length,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Convert entity to STIX pattern. */
  private entityToStixPattern(type: string, value: string): string | null {
    const patterns: Record<string, string> = {
      ip: `[ipv4-addr:value = '${value}']`,
      domain: `[domain-name:value = '${value}']`,
      url: `[url:value = '${value}']`,
      hash_sha256: `[file:hashes.'SHA-256' = '${value}']`,
      hash_sha1: `[file:hashes.'SHA-1' = '${value}']`,
      hash_md5: `[file:hashes.'MD5' = '${value}']`,
      email: `[email-addr:value = '${value}']`,
      cve: `[vulnerability:name = '${value}']`,
    };
    return patterns[type] ?? null;
  }

  /** Escape CSV field. */
  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private requireHunt(tenantId: string, huntId: string): HuntSession {
    const session = this.store.getSession(tenantId, huntId);
    if (!session) {
      throw new AppError(404, `Hunt session ${huntId} not found`, 'HUNT_NOT_FOUND');
    }
    return session;
  }
}
