import { randomUUID } from 'node:crypto';
import { AppError } from '@etip/shared-utils';
import type { DRPStore } from '../schemas/store.js';
import type {
  DRPAlert,
  DRPAlertType,
  DRPAlertStatus,
  DRPSeverity,
  AlertEvidence,
} from '../schemas/drp.js';
import type { ConfidenceScorer } from './confidence-scorer.js';
import type { SignalAggregator } from './signal-aggregator.js';
import type { EvidenceChainBuilder } from './evidence-chain.js';
import type { AlertDeduplication } from './alert-deduplication.js';
import type { SeverityClassifier } from './severity-classifier.js';

export interface AlertManagerDeps {
  confidenceScorer: ConfidenceScorer;
  signalAggregator: SignalAggregator;
  evidenceChain: EvidenceChainBuilder;
  deduplication: AlertDeduplication;
  severityClassifier: SeverityClassifier;
}

const VALID_TRANSITIONS: Record<DRPAlertStatus, DRPAlertStatus[]> = {
  open: ['investigating', 'resolved', 'false_positive'],
  investigating: ['resolved', 'false_positive', 'open'],
  resolved: ['open'],
  false_positive: ['open'],
};

export interface CreateAlertInput {
  assetId: string;
  type: DRPAlertType;
  title: string;
  description: string;
  detectedValue: string;
  sourceUrl?: string;
  evidence?: AlertEvidence[];
  signals?: Array<{ signalType: string; rawValue: number; description: string }>;
  assetCriticality?: number;
}

/** Manages DRP alerts — CRUD, transitions, triage, stats. */
export class AlertManager {
  private readonly store: DRPStore;
  private readonly deps: AlertManagerDeps;

  constructor(store: DRPStore, deps: AlertManagerDeps) {
    this.store = store;
    this.deps = deps;
  }

  /** Create a new DRP alert with confidence scoring and dedup check. */
  create(tenantId: string, input: CreateAlertInput): DRPAlert | null {
    // #4 Dedup: check for existing match
    const existing = this.deps.deduplication.findDuplicate(
      tenantId,
      input.assetId,
      input.type,
      input.detectedValue,
    );

    if (existing) {
      // Merge evidence into existing alert, boost confidence
      const merged = this.deps.deduplication.mergeIntoExisting(
        tenantId,
        existing.id,
        input.evidence ?? [],
      );
      return merged;
    }

    // #1 Confidence scoring
    const signals = input.signals ?? [];
    const { confidence, reasons } = this.deps.confidenceScorer.score(signals);

    // #2 Record signals
    const signalIds: string[] = [];
    for (const sig of signals) {
      const signalId = this.deps.signalAggregator.recordSignal(tenantId, '', {
        signalType: sig.signalType,
        rawValue: sig.rawValue,
        considered: true,
        reason: sig.description,
      });
      signalIds.push(signalId);
    }

    // #5 Severity classification
    const severity = this.deps.severityClassifier.classify({
      confidence,
      assetCriticality: input.assetCriticality ?? 0.5,
      signalCount: signals.length,
      alertType: input.type,
    });

    const now = new Date().toISOString();
    const alert: DRPAlert = {
      id: randomUUID(),
      tenantId,
      assetId: input.assetId,
      type: input.type,
      severity,
      status: 'open',
      title: input.title,
      description: input.description,
      evidence: input.evidence ?? [],
      confidence,
      confidenceReasons: reasons,
      signalIds,
      assignedTo: null,
      triageNotes: '',
      tags: [],
      detectedValue: input.detectedValue,
      sourceUrl: input.sourceUrl ?? null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.store.setAlert(tenantId, alert);

    // Update signal alertIds
    for (const sigId of signalIds) {
      this.deps.signalAggregator.linkSignalToAlert(tenantId, sigId, alert.id);
    }

    // #3 Build evidence chain
    this.deps.evidenceChain.buildChain(tenantId, alert.id, {
      signals,
      confidence,
      reasons,
      severity,
      deduped: false,
    });

    return alert;
  }

  /** Get an alert by ID or throw 404. */
  get(tenantId: string, alertId: string): DRPAlert {
    const alert = this.store.getAlert(tenantId, alertId);
    if (!alert) throw new AppError(404, 'Alert not found', 'ALERT_NOT_FOUND');
    return alert;
  }

  /** Change alert status with transition validation. */
  changeStatus(
    tenantId: string,
    alertId: string,
    newStatus: DRPAlertStatus,
    notes?: string,
  ): DRPAlert {
    const alert = this.get(tenantId, alertId);
    const allowed = VALID_TRANSITIONS[alert.status];
    if (!allowed.includes(newStatus)) {
      throw new AppError(
        400,
        `Cannot transition from ${alert.status} to ${newStatus}`,
        'INVALID_TRANSITION',
      );
    }

    alert.status = newStatus;
    alert.updatedAt = new Date().toISOString();
    if (notes) alert.triageNotes = `${alert.triageNotes}\n[${alert.updatedAt}] ${notes}`.trim();
    if (newStatus === 'resolved') alert.resolvedAt = alert.updatedAt;

    this.store.setAlert(tenantId, alert);
    return alert;
  }

  /** Assign alert to a user. */
  assign(tenantId: string, alertId: string, userId: string): DRPAlert {
    const alert = this.get(tenantId, alertId);
    alert.assignedTo = userId;
    alert.updatedAt = new Date().toISOString();
    this.store.setAlert(tenantId, alert);
    return alert;
  }

  /** Triage an alert — update severity, notes, tags. */
  triage(
    tenantId: string,
    alertId: string,
    input: { severity?: DRPSeverity; notes?: string; tags?: string[] },
  ): DRPAlert {
    const alert = this.get(tenantId, alertId);
    if (input.severity) alert.severity = input.severity;
    if (input.notes) alert.triageNotes = `${alert.triageNotes}\n[${new Date().toISOString()}] ${input.notes}`.trim();
    if (input.tags) alert.tags = input.tags;
    alert.updatedAt = new Date().toISOString();
    this.store.setAlert(tenantId, alert);
    return alert;
  }

  /** List alerts with pagination and filters. */
  list(
    tenantId: string,
    page: number,
    limit: number,
    filters?: { type?: string; status?: string; severity?: string; assetId?: string },
  ): { data: DRPAlert[]; total: number; page: number; limit: number } {
    return this.store.listAlerts(tenantId, page, limit, filters);
  }

  /** Get alert statistics. */
  getStats(tenantId: string): {
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    bySeverity: Record<string, number>;
    avgConfidence: number;
    resolutionRate: number;
  } {
    const alerts = Array.from(this.store.getTenantAlerts(tenantId).values());
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let totalConfidence = 0;
    let resolved = 0;

    for (const a of alerts) {
      byType[a.type] = (byType[a.type] ?? 0) + 1;
      byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
      bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
      totalConfidence += a.confidence;
      if (a.status === 'resolved' || a.status === 'false_positive') resolved++;
    }

    return {
      total: alerts.length,
      byType,
      byStatus,
      bySeverity,
      avgConfidence: alerts.length > 0 ? totalConfidence / alerts.length : 0,
      resolutionRate: alerts.length > 0 ? resolved / alerts.length : 0,
    };
  }

  /** Add evidence to an existing alert. */
  addEvidence(tenantId: string, alertId: string, evidence: AlertEvidence): DRPAlert {
    const alert = this.get(tenantId, alertId);
    alert.evidence.push(evidence);
    alert.updatedAt = new Date().toISOString();
    this.store.setAlert(tenantId, alert);
    return alert;
  }
}
