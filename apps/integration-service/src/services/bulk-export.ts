import type { BulkExportRequest } from '../schemas/integration.js';
import type { StixExportService } from './stix-export.js';

/**
 * Bulk export service for CSV, JSON, and STIX formats.
 * Generates downloadable exports of IOCs, alerts, and other entities.
 */
export class BulkExportService {
  constructor(private readonly stixExport: StixExportService) {}

  /**
   * Generate a bulk export in the requested format.
   * Returns the formatted data as a string with the appropriate content type.
   */
  async export(
    request: BulkExportRequest,
    data: Record<string, unknown>[],
    tenantId: string,
  ): Promise<{ content: string; contentType: string; filename: string }> {
    switch (request.format) {
      case 'csv':
        return this.exportCsv(data, request.entityType);
      case 'json':
        return this.exportJson(data, request.entityType);
      case 'stix':
        return this.exportStix(data, tenantId, request.entityType);
    }
  }

  /** Export data as CSV. */
  private exportCsv(
    data: Record<string, unknown>[],
    entityType: string,
  ): { content: string; contentType: string; filename: string } {
    if (data.length === 0) {
      return {
        content: '',
        contentType: 'text/csv',
        filename: `etip-${entityType}-export.csv`,
      };
    }

    // Get all unique keys across all records
    const keys = this.getAllKeys(data);
    const header = keys.map((k) => this.escapeCsvField(k)).join(',');

    const rows = data.map((row) =>
      keys.map((k) => this.escapeCsvField(this.formatCsvValue(row[k]))).join(','),
    );

    return {
      content: [header, ...rows].join('\n'),
      contentType: 'text/csv',
      filename: `etip-${entityType}-export-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  }

  /** Export data as JSON. */
  private exportJson(
    data: Record<string, unknown>[],
    entityType: string,
  ): { content: string; contentType: string; filename: string } {
    const exported = {
      exportedAt: new Date().toISOString(),
      source: 'ETIP Platform',
      entityType,
      count: data.length,
      data,
    };

    return {
      content: JSON.stringify(exported, null, 2),
      contentType: 'application/json',
      filename: `etip-${entityType}-export-${new Date().toISOString().slice(0, 10)}.json`,
    };
  }

  /** Export IOCs as STIX 2.1 bundle. */
  private exportStix(
    data: Record<string, unknown>[],
    tenantId: string,
    entityType: string,
  ): { content: string; contentType: string; filename: string } {
    // Convert generic records to IOC format for STIX
    const iocs = data.map((d) => ({
      id: String(d.id ?? ''),
      type: String(d.type ?? 'unknown'),
      value: String(d.value ?? d.normalizedValue ?? ''),
      severity: d.severity as string | undefined,
      confidence: typeof d.confidence === 'number' ? d.confidence : undefined,
      description: d.description as string | undefined,
      createdAt: d.createdAt as string | undefined,
      updatedAt: d.updatedAt as string | undefined,
      tags: Array.isArray(d.tags) ? d.tags as string[] : undefined,
    }));

    const bundle = this.stixExport.iocToStixBundle(iocs, tenantId);

    return {
      content: JSON.stringify(bundle, null, 2),
      contentType: 'application/stix+json;version=2.1',
      filename: `etip-${entityType}-stix-${new Date().toISOString().slice(0, 10)}.json`,
    };
  }

  /** Get all unique keys from an array of objects. */
  private getAllKeys(data: Record<string, unknown>[]): string[] {
    const keySet = new Set<string>();
    for (const row of data) {
      for (const key of Object.keys(row)) {
        keySet.add(key);
      }
    }
    return Array.from(keySet);
  }

  /** Escape a CSV field value. */
  private escapeCsvField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /** Format a value for CSV output. */
  private formatCsvValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}
