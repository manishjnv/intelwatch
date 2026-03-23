import type {
  MonitoredAsset,
  DRPAlert,
  ScanResult,
  DetectionSignal,
  SignalStats,
  EvidenceChain,
  AlertFeedback,
} from './drp.js';

/** Multi-tenant in-memory store for all DRP entities (DECISION-013). */
export class DRPStore {
  readonly assets = new Map<string, Map<string, MonitoredAsset>>();
  readonly alerts = new Map<string, Map<string, DRPAlert>>();
  readonly scans = new Map<string, Map<string, ScanResult>>();
  readonly signals = new Map<string, DetectionSignal[]>();
  readonly signalStats = new Map<string, Map<string, SignalStats>>();
  readonly evidenceChains = new Map<string, Map<string, EvidenceChain>>();
  readonly feedback = new Map<string, AlertFeedback[]>();

  // ─── Asset accessors ──────────────────────────────

  getTenantAssets(tenantId: string): Map<string, MonitoredAsset> {
    let map = this.assets.get(tenantId);
    if (!map) {
      map = new Map();
      this.assets.set(tenantId, map);
    }
    return map;
  }

  getAsset(tenantId: string, id: string): MonitoredAsset | undefined {
    return this.getTenantAssets(tenantId).get(id);
  }

  setAsset(tenantId: string, asset: MonitoredAsset): void {
    this.getTenantAssets(tenantId).set(asset.id, asset);
  }

  deleteAsset(tenantId: string, id: string): boolean {
    return this.getTenantAssets(tenantId).delete(id);
  }

  listAssets(
    tenantId: string,
    page: number,
    limit: number,
    type?: string,
  ): { data: MonitoredAsset[]; total: number; page: number; limit: number } {
    const all = Array.from(this.getTenantAssets(tenantId).values());
    const filtered = type ? all.filter((a) => a.type === type) : all;
    filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = filtered.length;
    const start = (page - 1) * limit;
    return { data: filtered.slice(start, start + limit), total, page, limit };
  }

  // ─── Alert accessors ──────────────────────────────

  getTenantAlerts(tenantId: string): Map<string, DRPAlert> {
    let map = this.alerts.get(tenantId);
    if (!map) {
      map = new Map();
      this.alerts.set(tenantId, map);
    }
    return map;
  }

  getAlert(tenantId: string, id: string): DRPAlert | undefined {
    return this.getTenantAlerts(tenantId).get(id);
  }

  setAlert(tenantId: string, alert: DRPAlert): void {
    this.getTenantAlerts(tenantId).set(alert.id, alert);
  }

  listAlerts(
    tenantId: string,
    page: number,
    limit: number,
    filters?: { type?: string; status?: string; severity?: string; assetId?: string },
  ): { data: DRPAlert[]; total: number; page: number; limit: number } {
    let all = Array.from(this.getTenantAlerts(tenantId).values());
    if (filters?.type) all = all.filter((a) => a.type === filters.type);
    if (filters?.status) all = all.filter((a) => a.status === filters.status);
    if (filters?.severity) all = all.filter((a) => a.severity === filters.severity);
    if (filters?.assetId) all = all.filter((a) => a.assetId === filters.assetId);
    all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = all.length;
    const start = (page - 1) * limit;
    return { data: all.slice(start, start + limit), total, page, limit };
  }

  getAlertsByAsset(tenantId: string, assetId: string): DRPAlert[] {
    return Array.from(this.getTenantAlerts(tenantId).values()).filter(
      (a) => a.assetId === assetId,
    );
  }

  // ─── Scan accessors ───────────────────────────────

  getTenantScans(tenantId: string): Map<string, ScanResult> {
    let map = this.scans.get(tenantId);
    if (!map) {
      map = new Map();
      this.scans.set(tenantId, map);
    }
    return map;
  }

  setScan(tenantId: string, scan: ScanResult): void {
    this.getTenantScans(tenantId).set(scan.id, scan);
  }

  getScan(tenantId: string, id: string): ScanResult | undefined {
    return this.getTenantScans(tenantId).get(id);
  }

  // ─── Signal accessors (#2) ────────────────────────

  getTenantSignals(tenantId: string): DetectionSignal[] {
    let arr = this.signals.get(tenantId);
    if (!arr) {
      arr = [];
      this.signals.set(tenantId, arr);
    }
    return arr;
  }

  addSignal(tenantId: string, signal: DetectionSignal): void {
    this.getTenantSignals(tenantId).push(signal);
  }

  getTenantSignalStats(tenantId: string): Map<string, SignalStats> {
    let map = this.signalStats.get(tenantId);
    if (!map) {
      map = new Map();
      this.signalStats.set(tenantId, map);
    }
    return map;
  }

  // ─── Evidence chain accessors (#3) ────────────────

  getTenantEvidenceChains(tenantId: string): Map<string, EvidenceChain> {
    let map = this.evidenceChains.get(tenantId);
    if (!map) {
      map = new Map();
      this.evidenceChains.set(tenantId, map);
    }
    return map;
  }

  setEvidenceChain(tenantId: string, chain: EvidenceChain): void {
    this.getTenantEvidenceChains(tenantId).set(chain.alertId, chain);
  }

  getEvidenceChain(tenantId: string, alertId: string): EvidenceChain | undefined {
    return this.getTenantEvidenceChains(tenantId).get(alertId);
  }

  // ─── Feedback accessors ───────────────────────────

  getTenantFeedback(tenantId: string): AlertFeedback[] {
    let arr = this.feedback.get(tenantId);
    if (!arr) {
      arr = [];
      this.feedback.set(tenantId, arr);
    }
    return arr;
  }

  addFeedback(tenantId: string, fb: AlertFeedback): void {
    this.getTenantFeedback(tenantId).push(fb);
  }
}
