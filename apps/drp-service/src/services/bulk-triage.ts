import type { AlertManager } from './alert-manager.js';
import type { DRPStore } from '../schemas/store.js';
import type { DRPAlert, DRPAlertStatus, DRPSeverity } from '../schemas/drp.js';
import type { BulkTriageResult } from '../schemas/p1-p2.js';

export interface BulkTriageAction {
  status?: DRPAlertStatus;
  severity?: DRPSeverity;
  assignTo?: string;
  addTags?: string[];
  notes?: string;
}

export interface BulkTriageFilter {
  type?: string;
  status?: string;
  severity?: string;
  assetId?: string;
  minConfidence?: number;
  maxConfidence?: number;
}

/** #8 Bulk alert triage — triage multiple alerts at once with filter-based selection. */
export class BulkTriageService {
  private readonly alertManager: AlertManager;
  private readonly store: DRPStore;

  constructor(alertManager: AlertManager, store: DRPStore) {
    this.alertManager = alertManager;
    this.store = store;
  }

  /** Triage multiple alerts by explicit IDs or by filter. */
  triage(
    tenantId: string,
    alertIds: string[] | undefined,
    filter: BulkTriageFilter | undefined,
    action: BulkTriageAction,
  ): BulkTriageResult {
    const targetAlerts = this.resolveAlerts(tenantId, alertIds, filter);
    let succeeded = 0;
    const errors: Array<{ alertId: string; error: string }> = [];

    for (const alert of targetAlerts) {
      try {
        this.applyAction(tenantId, alert, action);
        succeeded++;
      } catch (err) {
        errors.push({
          alertId: alert.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return {
      processed: targetAlerts.length,
      succeeded,
      failed: errors.length,
      errors,
    };
  }

  /** Resolve target alerts from IDs or filter. */
  private resolveAlerts(
    tenantId: string,
    alertIds: string[] | undefined,
    filter: BulkTriageFilter | undefined,
  ): DRPAlert[] {
    if (alertIds && alertIds.length > 0) {
      const results: DRPAlert[] = [];
      for (const id of alertIds) {
        const alert = this.store.getAlert(tenantId, id);
        if (alert) results.push(alert);
      }
      return results;
    }

    // Filter-based selection
    let alerts = Array.from(this.store.getTenantAlerts(tenantId).values());
    if (filter) {
      if (filter.type) alerts = alerts.filter((a) => a.type === filter.type);
      if (filter.status) alerts = alerts.filter((a) => a.status === filter.status);
      if (filter.severity) alerts = alerts.filter((a) => a.severity === filter.severity);
      if (filter.assetId) alerts = alerts.filter((a) => a.assetId === filter.assetId);
      if (filter.minConfidence !== undefined) alerts = alerts.filter((a) => a.confidence >= filter.minConfidence!);
      if (filter.maxConfidence !== undefined) alerts = alerts.filter((a) => a.confidence <= filter.maxConfidence!);
    }
    return alerts;
  }

  /** Apply a triage action to a single alert. */
  private applyAction(tenantId: string, alert: DRPAlert, action: BulkTriageAction): void {
    if (action.status) {
      this.alertManager.changeStatus(tenantId, alert.id, action.status, action.notes);
    }
    if (action.severity || action.notes || action.addTags) {
      const existingTags = alert.tags ?? [];
      const mergedTags = action.addTags
        ? [...new Set([...existingTags, ...action.addTags])]
        : undefined;
      this.alertManager.triage(tenantId, alert.id, {
        severity: action.severity,
        notes: action.notes,
        tags: mergedTags,
      });
    }
    if (action.assignTo) {
      this.alertManager.assign(tenantId, alert.id, action.assignTo);
    }
  }
}
