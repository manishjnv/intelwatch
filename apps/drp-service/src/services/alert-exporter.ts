import type { DRPStore } from '../schemas/store.js';
import type { DRPAlert } from '../schemas/drp.js';
import type { ExportFormat } from '../schemas/p1-p2.js';

interface ExportFilter {
  type?: string;
  status?: string;
  severity?: string;
  assetId?: string;
  fromDate?: string;
  toDate?: string;
}

/** #12 Alert export (CSV/JSON/STIX) — multi-format export for compliance and SIEM. */
export class AlertExporter {
  private readonly store: DRPStore;

  constructor(store: DRPStore) {
    this.store = store;
  }

  /** Export alerts in the requested format. */
  export(
    tenantId: string,
    format: ExportFormat,
    filter?: ExportFilter,
    maxRecords: number = 1000,
  ): { content: string; contentType: string; filename: string; recordCount: number } {
    const alerts = this.getFilteredAlerts(tenantId, filter, maxRecords);

    switch (format) {
      case 'csv': return this.toCSV(alerts);
      case 'json': return this.toJSON(alerts);
      case 'stix': return this.toSTIX(alerts, tenantId);
    }
  }

  private getFilteredAlerts(tenantId: string, filter?: ExportFilter, max: number = 1000): DRPAlert[] {
    let alerts = Array.from(this.store.getTenantAlerts(tenantId).values());

    if (filter) {
      if (filter.type) alerts = alerts.filter((a) => a.type === filter.type);
      if (filter.status) alerts = alerts.filter((a) => a.status === filter.status);
      if (filter.severity) alerts = alerts.filter((a) => a.severity === filter.severity);
      if (filter.assetId) alerts = alerts.filter((a) => a.assetId === filter.assetId);
      if (filter.fromDate) {
        const from = new Date(filter.fromDate).getTime();
        alerts = alerts.filter((a) => new Date(a.createdAt).getTime() >= from);
      }
      if (filter.toDate) {
        const to = new Date(filter.toDate).getTime();
        alerts = alerts.filter((a) => new Date(a.createdAt).getTime() <= to);
      }
    }

    alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return alerts.slice(0, max);
  }

  private toCSV(alerts: DRPAlert[]): { content: string; contentType: string; filename: string; recordCount: number } {
    const headers = [
      'id', 'type', 'severity', 'status', 'title', 'detectedValue',
      'assetId', 'confidence', 'assignedTo', 'createdAt', 'updatedAt',
    ];
    const rows = [headers.join(',')];

    for (const a of alerts) {
      rows.push([
        a.id,
        a.type,
        a.severity,
        a.status,
        `"${a.title.replace(/"/g, '""')}"`,
        `"${a.detectedValue.replace(/"/g, '""')}"`,
        a.assetId,
        a.confidence.toFixed(2),
        a.assignedTo ?? '',
        a.createdAt,
        a.updatedAt,
      ].join(','));
    }

    return {
      content: rows.join('\n'),
      contentType: 'text/csv',
      filename: `drp-alerts-${new Date().toISOString().split('T')[0]}.csv`,
      recordCount: alerts.length,
    };
  }

  private toJSON(alerts: DRPAlert[]): { content: string; contentType: string; filename: string; recordCount: number } {
    const exportData = {
      exportedAt: new Date().toISOString(),
      recordCount: alerts.length,
      alerts: alerts.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        status: a.status,
        title: a.title,
        description: a.description,
        detectedValue: a.detectedValue,
        assetId: a.assetId,
        confidence: a.confidence,
        evidence: a.evidence,
        tags: a.tags,
        assignedTo: a.assignedTo,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        resolvedAt: a.resolvedAt,
      })),
    };

    return {
      content: JSON.stringify(exportData, null, 2),
      contentType: 'application/json',
      filename: `drp-alerts-${new Date().toISOString().split('T')[0]}.json`,
      recordCount: alerts.length,
    };
  }

  private toSTIX(alerts: DRPAlert[], tenantId: string): { content: string; contentType: string; filename: string; recordCount: number } {
    const stixObjects: Record<string, unknown>[] = [];

    // Identity for the tenant
    const identityId = `identity--${tenantId}`;
    stixObjects.push({
      type: 'identity',
      spec_version: '2.1',
      id: identityId,
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      name: tenantId,
      identity_class: 'organization',
    });

    for (const alert of alerts) {
      // Map DRP alert type to STIX indicator pattern
      const pattern = this.alertToSTIXPattern(alert);
      const indicatorId = `indicator--${alert.id}`;

      stixObjects.push({
        type: 'indicator',
        spec_version: '2.1',
        id: indicatorId,
        created: alert.createdAt,
        modified: alert.updatedAt,
        name: alert.title,
        description: alert.description,
        pattern,
        pattern_type: 'stix',
        valid_from: alert.createdAt,
        confidence: Math.round(alert.confidence * 100),
        labels: [alert.type, alert.severity],
        created_by_ref: identityId,
        external_references: alert.sourceUrl
          ? [{ source_name: 'drp-detection', url: alert.sourceUrl }]
          : [],
      });
    }

    const bundle = {
      type: 'bundle',
      id: `bundle--${crypto.randomUUID()}`,
      objects: stixObjects,
    };

    return {
      content: JSON.stringify(bundle, null, 2),
      contentType: 'application/stix+json',
      filename: `drp-alerts-${new Date().toISOString().split('T')[0]}.stix.json`,
      recordCount: alerts.length,
    };
  }

  private alertToSTIXPattern(alert: DRPAlert): string {
    switch (alert.type) {
      case 'typosquatting':
        return `[domain-name:value = '${alert.detectedValue}']`;
      case 'credential_leak':
        return `[email-addr:value LIKE '%${alert.detectedValue}%']`;
      case 'dark_web_mention':
        return `[artifact:payload_bin MATCHES '${alert.detectedValue}']`;
      case 'social_impersonation':
        return `[user-account:display_name = '${alert.detectedValue}']`;
      case 'rogue_app':
        return `[software:name = '${alert.detectedValue}']`;
      case 'exposed_service':
        return `[network-traffic:dst_ref.type = 'ipv4-addr' AND network-traffic:dst_port = ${alert.detectedValue}]`;
      default:
        return `[artifact:payload_bin = '${alert.detectedValue}']`;
    }
  }
}
