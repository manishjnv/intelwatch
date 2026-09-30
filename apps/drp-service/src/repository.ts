import { AppError } from '@etip/shared-utils';
import { getLogger } from './logger.js';
import type { MonitoredAsset, DRPAlert, ScanResult, EvidenceChain, AlertFeedback } from './schemas/drp.js';
import type { AIEnrichmentResult, TakedownRequest } from './schemas/p1-p2.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True if `s` looks like a Postgres uuid column value. Legacy/non-uuid ids fail this. */
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/**
 * Runs a Prisma call, mapping any non-AppError failure to a 503 so callers never see
 * raw driver/connection errors. Step 3 decision D3: no fallback to memory — a down
 * DB is a hard failure for the caller, not a silent degrade.
 */
export async function dbCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    getLogger().error({ err }, 'DRP database call failed');
    throw new AppError(503, 'DRP database unavailable', 'DB_UNAVAILABLE');
  }
}

/** Storage abstraction for all Postgres-backed DRP entities (Step 3 S158). */
export interface DrpRepo {
  // ─── Assets ────────────────────────────────────────
  getAsset(tenantId: string, id: string): Promise<MonitoredAsset | null>;
  upsertAsset(asset: MonitoredAsset): Promise<MonitoredAsset>;
  deleteAsset(tenantId: string, id: string): Promise<boolean>;
  /** Newest-updated first. */
  listAssets(tenantId: string): Promise<MonitoredAsset[]>;
  countAssets(tenantId: string): Promise<number>;

  // ─── Alerts ────────────────────────────────────────
  getAlert(tenantId: string, id: string): Promise<DRPAlert | null>;
  upsertAlert(alert: DRPAlert): Promise<DRPAlert>;
  listAlerts(tenantId: string): Promise<DRPAlert[]>;
  listAlertsByAsset(tenantId: string, assetId: string): Promise<DRPAlert[]>;
  setAiEnrichment(tenantId: string, alertId: string, result: AIEnrichmentResult): Promise<void>;
  getAiEnrichment(tenantId: string, alertId: string): Promise<AIEnrichmentResult | null>;
  setEvidenceChain(tenantId: string, chain: EvidenceChain): Promise<void>;
  getEvidenceChain(tenantId: string, alertId: string): Promise<EvidenceChain | null>;
  listEvidenceChains(tenantId: string): Promise<EvidenceChain[]>;

  // ─── Scans ─────────────────────────────────────────
  getScan(tenantId: string, id: string): Promise<ScanResult | null>;
  upsertScan(scan: ScanResult): Promise<ScanResult>;
  listScans(tenantId: string): Promise<ScanResult[]>;

  // ─── Takedowns ─────────────────────────────────────
  getTakedown(tenantId: string, id: string): Promise<TakedownRequest | null>;
  upsertTakedown(takedown: TakedownRequest): Promise<TakedownRequest>;
  listTakedownsByAlert(tenantId: string, alertId: string): Promise<TakedownRequest[]>;
  listTakedowns(tenantId: string): Promise<TakedownRequest[]>;

  // ─── Feedback ──────────────────────────────────────
  addFeedback(feedback: AlertFeedback): Promise<AlertFeedback>;
  listFeedback(tenantId: string): Promise<AlertFeedback[]>;
}

/** In-memory DrpRepo — dev/test backend only. Production requires TI_DATABASE_URL (Step 3 D3). */
export class MemoryDrpRepo implements DrpRepo {
  private assets = new Map<string, MonitoredAsset>(); // memory-ok: dev/test backend only — production passes the Prisma repo (Step 3 D3)
  private alerts = new Map<string, DRPAlert>(); // memory-ok: dev/test backend only — production passes the Prisma repo (Step 3 D3)
  private scans = new Map<string, ScanResult>(); // memory-ok: dev/test backend only — production passes the Prisma repo (Step 3 D3)
  private takedowns = new Map<string, TakedownRequest>(); // memory-ok: dev/test backend only — production passes the Prisma repo (Step 3 D3)
  private feedback: AlertFeedback[] = []; // memory-ok: dev/test backend only — production passes the Prisma repo (Step 3 D3)
  private aiEnrichments = new Map<string, AIEnrichmentResult>(); // memory-ok: dev/test backend only — production passes the Prisma repo (Step 3 D3)
  private evidenceChains = new Map<string, EvidenceChain>(); // memory-ok: dev/test backend only — production passes the Prisma repo (Step 3 D3)

  // ─── Assets ────────────────────────────────────────

  async getAsset(tenantId: string, id: string): Promise<MonitoredAsset | null> {
    const a = this.assets.get(id);
    return a && a.tenantId === tenantId ? { ...a } : null;
  }

  async upsertAsset(asset: MonitoredAsset): Promise<MonitoredAsset> {
    this.assets.set(asset.id, { ...asset });
    return { ...asset };
  }

  async deleteAsset(tenantId: string, id: string): Promise<boolean> {
    const a = this.assets.get(id);
    if (!a || a.tenantId !== tenantId) return false;
    return this.assets.delete(id);
  }

  async listAssets(tenantId: string): Promise<MonitoredAsset[]> {
    return Array.from(this.assets.values())
      .filter((a) => a.tenantId === tenantId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((a) => ({ ...a }));
  }

  async countAssets(tenantId: string): Promise<number> {
    let count = 0;
    for (const a of this.assets.values()) if (a.tenantId === tenantId) count++;
    return count;
  }

  // ─── Alerts ────────────────────────────────────────

  async getAlert(tenantId: string, id: string): Promise<DRPAlert | null> {
    const a = this.alerts.get(id);
    return a && a.tenantId === tenantId ? { ...a } : null;
  }

  async upsertAlert(alert: DRPAlert): Promise<DRPAlert> {
    this.alerts.set(alert.id, { ...alert });
    return { ...alert };
  }

  async listAlerts(tenantId: string): Promise<DRPAlert[]> {
    return Array.from(this.alerts.values())
      .filter((a) => a.tenantId === tenantId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((a) => ({ ...a }));
  }

  async listAlertsByAsset(tenantId: string, assetId: string): Promise<DRPAlert[]> {
    return Array.from(this.alerts.values())
      .filter((a) => a.tenantId === tenantId && a.assetId === assetId)
      .map((a) => ({ ...a }));
  }

  async setAiEnrichment(tenantId: string, alertId: string, result: AIEnrichmentResult): Promise<void> {
    this.aiEnrichments.set(`${tenantId}:${alertId}`, { ...result });
  }

  async getAiEnrichment(tenantId: string, alertId: string): Promise<AIEnrichmentResult | null> {
    const r = this.aiEnrichments.get(`${tenantId}:${alertId}`);
    return r ? { ...r } : null;
  }

  async setEvidenceChain(tenantId: string, chain: EvidenceChain): Promise<void> {
    this.evidenceChains.set(`${tenantId}:${chain.alertId}`, { ...chain, steps: [...chain.steps] });
  }

  async getEvidenceChain(tenantId: string, alertId: string): Promise<EvidenceChain | null> {
    const c = this.evidenceChains.get(`${tenantId}:${alertId}`);
    return c ? { ...c, steps: [...c.steps] } : null;
  }

  async listEvidenceChains(tenantId: string): Promise<EvidenceChain[]> {
    return Array.from(this.evidenceChains.values())
      .filter((c) => c.tenantId === tenantId)
      .map((c) => ({ ...c, steps: [...c.steps] }));
  }

  // ─── Scans ─────────────────────────────────────────

  async getScan(tenantId: string, id: string): Promise<ScanResult | null> {
    const s = this.scans.get(id);
    return s && s.tenantId === tenantId ? { ...s } : null;
  }

  async upsertScan(scan: ScanResult): Promise<ScanResult> {
    this.scans.set(scan.id, { ...scan });
    return { ...scan };
  }

  async listScans(tenantId: string): Promise<ScanResult[]> {
    return Array.from(this.scans.values())
      .filter((s) => s.tenantId === tenantId)
      .map((s) => ({ ...s }));
  }

  // ─── Takedowns ─────────────────────────────────────

  async getTakedown(tenantId: string, id: string): Promise<TakedownRequest | null> {
    const t = this.takedowns.get(id);
    return t && t.tenantId === tenantId ? { ...t } : null;
  }

  async upsertTakedown(takedown: TakedownRequest): Promise<TakedownRequest> {
    this.takedowns.set(takedown.id, { ...takedown });
    return { ...takedown };
  }

  async listTakedownsByAlert(tenantId: string, alertId: string): Promise<TakedownRequest[]> {
    return Array.from(this.takedowns.values())
      .filter((t) => t.tenantId === tenantId && t.alertId === alertId)
      .map((t) => ({ ...t }));
  }

  async listTakedowns(tenantId: string): Promise<TakedownRequest[]> {
    return Array.from(this.takedowns.values())
      .filter((t) => t.tenantId === tenantId)
      .map((t) => ({ ...t }));
  }

  // ─── Feedback ──────────────────────────────────────

  async addFeedback(feedback: AlertFeedback): Promise<AlertFeedback> {
    this.feedback.push({ ...feedback });
    return { ...feedback };
  }

  async listFeedback(tenantId: string): Promise<AlertFeedback[]> {
    return this.feedback.filter((f) => f.tenantId === tenantId).map((f) => ({ ...f }));
  }

  /** Synchronous reset — test-only. */
  clear(): void {
    this.assets.clear();
    this.alerts.clear();
    this.scans.clear();
    this.takedowns.clear();
    this.feedback = [];
    this.aiEnrichments.clear();
    this.evidenceChains.clear();
  }
}
