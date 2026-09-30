import type {
  MonitoredAsset,
  DRPAlert,
  ScanResult,
  DetectionSignal,
  SignalStats,
  EvidenceChain,
  AlertFeedback,
} from './drp.js';
import type {
  AIEnrichmentResult,
  TakedownRequest,
  CorrelationCluster,
  AssetRiskScore,
} from './p1-p2.js';
import { MemoryDrpRepo, type DrpRepo } from '../repository.js';

/** Newest signals kept per tenant before older ones are dropped (Step 3 S158). */
const MAX_SIGNALS_PER_TENANT = 5000;

/**
 * Multi-tenant DRP store (Step 3 S158). Assets, alerts, scans, takedowns,
 * feedback, AI enrichment and evidence chains are backed by `DrpRepo`
 * (Postgres in production, in-memory for dev/test — Step 3 D3: no fallback).
 * Signals, signal stats, correlation clusters and asset risk scores stay
 * in process memory — they are caches/derived data, not business records.
 */
export class DRPStore {
  private readonly repo: DrpRepo;

  readonly signals = new Map<string, DetectionSignal[]>(); // memory-ok: buffer — capped at 5,000 newest per tenant (Step 3 S158)
  readonly signalStats = new Map<string, Map<string, SignalStats>>(); // memory-ok: derived from signals
  readonly correlations = new Map<string, Map<string, CorrelationCluster>>(); // memory-ok: derived — recomputed on request
  readonly assetRiskScores = new Map<string, Map<string, AssetRiskScore>>(); // memory-ok: derived — recomputed on request

  constructor(repo: DrpRepo = new MemoryDrpRepo()) {
    this.repo = repo;
  }

  // ─── Asset accessors ──────────────────────────────

  async getAsset(tenantId: string, id: string): Promise<MonitoredAsset | null> {
    return this.repo.getAsset(tenantId, id);
  }

  async setAsset(_tenantId: string, asset: MonitoredAsset): Promise<void> {
    await this.repo.upsertAsset(asset);
  }

  async deleteAsset(tenantId: string, id: string): Promise<boolean> {
    return this.repo.deleteAsset(tenantId, id);
  }

  async countAssets(tenantId: string): Promise<number> {
    return this.repo.countAssets(tenantId);
  }

  /** All assets of a tenant, newest-updated first. */
  async listAllAssets(tenantId: string): Promise<MonitoredAsset[]> {
    return this.repo.listAssets(tenantId);
  }

  async listAssets(
    tenantId: string,
    page: number,
    limit: number,
    type?: string,
  ): Promise<{ data: MonitoredAsset[]; total: number; page: number; limit: number }> {
    const all = await this.repo.listAssets(tenantId);
    const filtered = type ? all.filter((a) => a.type === type) : all;
    const total = filtered.length;
    const start = (page - 1) * limit;
    return { data: filtered.slice(start, start + limit), total, page, limit };
  }

  // ─── Alert accessors ──────────────────────────────

  async getAlert(tenantId: string, id: string): Promise<DRPAlert | null> {
    return this.repo.getAlert(tenantId, id);
  }

  async setAlert(_tenantId: string, alert: DRPAlert): Promise<void> {
    await this.repo.upsertAlert(alert);
  }

  /** All alerts of a tenant, newest-updated first. */
  async listAllAlerts(tenantId: string): Promise<DRPAlert[]> {
    return this.repo.listAlerts(tenantId);
  }

  async listAlerts(
    tenantId: string,
    page: number,
    limit: number,
    filters?: { type?: string; status?: string; severity?: string; assetId?: string },
  ): Promise<{ data: DRPAlert[]; total: number; page: number; limit: number }> {
    let all = await this.repo.listAlerts(tenantId);
    if (filters?.type) all = all.filter((a) => a.type === filters.type);
    if (filters?.status) all = all.filter((a) => a.status === filters.status);
    if (filters?.severity) all = all.filter((a) => a.severity === filters.severity);
    if (filters?.assetId) all = all.filter((a) => a.assetId === filters.assetId);
    const total = all.length;
    const start = (page - 1) * limit;
    return { data: all.slice(start, start + limit), total, page, limit };
  }

  async getAlertsByAsset(tenantId: string, assetId: string): Promise<DRPAlert[]> {
    return this.repo.listAlertsByAsset(tenantId, assetId);
  }

  // ─── Scan accessors ───────────────────────────────

  async getScan(tenantId: string, id: string): Promise<ScanResult | null> {
    return this.repo.getScan(tenantId, id);
  }

  async setScan(_tenantId: string, scan: ScanResult): Promise<void> {
    await this.repo.upsertScan(scan);
  }

  /** All scans of a tenant. */
  async listAllScans(tenantId: string): Promise<ScanResult[]> {
    return this.repo.listScans(tenantId);
  }

  // ─── Signal accessors (#2) — stays in memory ──────

  getTenantSignals(tenantId: string): DetectionSignal[] {
    let arr = this.signals.get(tenantId);
    if (!arr) {
      arr = [];
      this.signals.set(tenantId, arr);
    }
    return arr;
  }

  addSignal(tenantId: string, signal: DetectionSignal): void {
    const arr = this.getTenantSignals(tenantId);
    arr.push(signal);
    if (arr.length > MAX_SIGNALS_PER_TENANT) {
      arr.splice(0, arr.length - MAX_SIGNALS_PER_TENANT);
    }
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

  async setEvidenceChain(tenantId: string, chain: EvidenceChain): Promise<void> {
    await this.repo.setEvidenceChain(tenantId, chain);
  }

  async getEvidenceChain(tenantId: string, alertId: string): Promise<EvidenceChain | null> {
    return this.repo.getEvidenceChain(tenantId, alertId);
  }

  /** All evidence chains of a tenant. */
  async listEvidenceChains(tenantId: string): Promise<EvidenceChain[]> {
    return this.repo.listEvidenceChains(tenantId);
  }

  // ─── Feedback accessors ───────────────────────────

  async addFeedback(_tenantId: string, fb: AlertFeedback): Promise<void> {
    await this.repo.addFeedback(fb);
  }

  /** All feedback of a tenant. */
  async listFeedback(tenantId: string): Promise<AlertFeedback[]> {
    return this.repo.listFeedback(tenantId);
  }

  // ─── AI Enrichment cache (#7) ───────────────────────

  async setAIEnrichment(tenantId: string, alertId: string, result: AIEnrichmentResult): Promise<void> {
    await this.repo.setAiEnrichment(tenantId, alertId, result);
  }

  async getAIEnrichment(tenantId: string, alertId: string): Promise<AIEnrichmentResult | null> {
    return this.repo.getAiEnrichment(tenantId, alertId);
  }

  // ─── Takedown requests (#11) ────────────────────────

  async setTakedown(_tenantId: string, takedown: TakedownRequest): Promise<void> {
    await this.repo.upsertTakedown(takedown);
  }

  async getTakedown(tenantId: string, id: string): Promise<TakedownRequest | null> {
    return this.repo.getTakedown(tenantId, id);
  }

  async getTakedownsByAlert(tenantId: string, alertId: string): Promise<TakedownRequest[]> {
    return this.repo.listTakedownsByAlert(tenantId, alertId);
  }

  /** All takedown requests of a tenant. */
  async listTakedowns(tenantId: string): Promise<TakedownRequest[]> {
    return this.repo.listTakedowns(tenantId);
  }

  // ─── Correlation clusters (#15) — stays in memory ───

  getTenantCorrelations(tenantId: string): Map<string, CorrelationCluster> {
    let map = this.correlations.get(tenantId);
    if (!map) {
      map = new Map();
      this.correlations.set(tenantId, map);
    }
    return map;
  }

  setCorrelation(tenantId: string, cluster: CorrelationCluster): void {
    this.getTenantCorrelations(tenantId).set(cluster.id, cluster);
  }

  // ─── Asset risk scores (#14) — stays in memory ──────

  getTenantAssetRisks(tenantId: string): Map<string, AssetRiskScore> {
    let map = this.assetRiskScores.get(tenantId);
    if (!map) {
      map = new Map();
      this.assetRiskScores.set(tenantId, map);
    }
    return map;
  }

  setAssetRisk(tenantId: string, risk: AssetRiskScore): void {
    this.getTenantAssetRisks(tenantId).set(risk.assetId, risk);
  }

  getAssetRisk(tenantId: string, assetId: string): AssetRiskScore | undefined {
    return this.getTenantAssetRisks(tenantId).get(assetId);
  }
}
