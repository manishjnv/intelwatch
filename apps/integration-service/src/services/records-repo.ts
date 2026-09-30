import type { IntegrationLog, WebhookDelivery, Ticket, LogStatus } from '../schemas/integration.js';

/**
 * Storage abstraction for the three record kinds that used to be in-memory Maps
 * on IntegrationStore (Step 3 S156): logs, webhook deliveries + DLQ, tickets.
 * Mirrors the alerting-service Repo<T> pattern (repository.ts) — no repo injected
 * means dev/test (MemoryRecordsRepo); production passes the Prisma repo.
 */
export interface IntegrationRecordsRepo {
  addLog(log: IntegrationLog): Promise<void>;
  /** Newest first. */
  listLogs(
    tenantId: string,
    integrationId: string,
    page: number,
    limit: number,
  ): Promise<{ data: IntegrationLog[]; total: number }>;
  countLogs(tenantId: string, status?: LogStatus): Promise<number>;
  deleteLogsForIntegration(tenantId: string, integrationId: string): Promise<void>;

  insertDelivery(d: WebhookDelivery): Promise<void>;
  updateDelivery(
    id: string,
    patch: Partial<Omit<WebhookDelivery, 'id' | 'tenantId' | 'createdAt'>>,
  ): Promise<WebhookDelivery | null>;
  getDelivery(id: string): Promise<WebhookDelivery | null>;
  /** Newest first. */
  listDeliveries(
    tenantId: string,
    status: LogStatus,
    page: number,
    limit: number,
  ): Promise<{ data: WebhookDelivery[]; total: number }>;
  countDeliveries(tenantId: string, status: LogStatus): Promise<number>;

  insertTicket(t: Ticket): Promise<void>;
  getTicket(id: string): Promise<Ticket | null>;
  updateTicket(id: string, patch: { status: string; updatedAt: string }): Promise<Ticket | null>;
  listTickets(
    tenantId: string,
    integrationId: string | undefined,
    page: number,
    limit: number,
  ): Promise<{ data: Ticket[]; total: number }>;
  countTickets(tenantId: string): Promise<number>;

  /** Retention: delete logs, and deliveries with status 'success', older than `before`. Returns rows deleted. */
  purgeOlderThan(before: Date): Promise<number>;
}

/** In-memory repo — dev/test backend only. Production passes the Prisma repo (Step 3 D3). */
export class MemoryRecordsRepo implements IntegrationRecordsRepo {
  private logs = new Map<string, IntegrationLog>(); // memory-ok: dev/test backend only — production passes the Prisma repo (Step 3 D3)
  private deliveries = new Map<string, WebhookDelivery>(); // memory-ok: dev/test backend only — production passes the Prisma repo (Step 3 D3)
  private tickets = new Map<string, Ticket>(); // memory-ok: dev/test backend only — production passes the Prisma repo (Step 3 D3)

  async addLog(log: IntegrationLog): Promise<void> {
    this.logs.set(log.id, { ...log });
  }

  async listLogs(
    tenantId: string,
    integrationId: string,
    page: number,
    limit: number,
  ): Promise<{ data: IntegrationLog[]; total: number }> {
    const items = Array.from(this.logs.values())
      .filter((l) => l.tenantId === tenantId && l.integrationId === integrationId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const start = (page - 1) * limit;
    return { data: items.slice(start, start + limit).map((l) => ({ ...l })), total: items.length };
  }

  async countLogs(tenantId: string, status?: LogStatus): Promise<number> {
    return Array.from(this.logs.values()).filter(
      (l) => l.tenantId === tenantId && (!status || l.status === status),
    ).length;
  }

  async deleteLogsForIntegration(tenantId: string, integrationId: string): Promise<void> {
    for (const [id, log] of this.logs) {
      if (log.tenantId === tenantId && log.integrationId === integrationId) this.logs.delete(id);
    }
  }

  async insertDelivery(d: WebhookDelivery): Promise<void> {
    this.deliveries.set(d.id, { ...d });
  }

  async updateDelivery(
    id: string,
    patch: Partial<Omit<WebhookDelivery, 'id' | 'tenantId' | 'createdAt'>>,
  ): Promise<WebhookDelivery | null> {
    const d = this.deliveries.get(id);
    if (!d) return null;
    Object.assign(d, patch);
    return { ...d };
  }

  async getDelivery(id: string): Promise<WebhookDelivery | null> {
    const d = this.deliveries.get(id);
    return d ? { ...d } : null;
  }

  async listDeliveries(
    tenantId: string,
    status: LogStatus,
    page: number,
    limit: number,
  ): Promise<{ data: WebhookDelivery[]; total: number }> {
    const items = Array.from(this.deliveries.values())
      .filter((d) => d.tenantId === tenantId && d.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const start = (page - 1) * limit;
    return { data: items.slice(start, start + limit).map((d) => ({ ...d })), total: items.length };
  }

  async countDeliveries(tenantId: string, status: LogStatus): Promise<number> {
    return Array.from(this.deliveries.values()).filter(
      (d) => d.tenantId === tenantId && d.status === status,
    ).length;
  }

  async insertTicket(t: Ticket): Promise<void> {
    this.tickets.set(t.id, { ...t });
  }

  async getTicket(id: string): Promise<Ticket | null> {
    const t = this.tickets.get(id);
    return t ? { ...t } : null;
  }

  async updateTicket(id: string, patch: { status: string; updatedAt: string }): Promise<Ticket | null> {
    const t = this.tickets.get(id);
    if (!t) return null;
    Object.assign(t, patch);
    return { ...t };
  }

  async listTickets(
    tenantId: string,
    integrationId: string | undefined,
    page: number,
    limit: number,
  ): Promise<{ data: Ticket[]; total: number }> {
    let items = Array.from(this.tickets.values()).filter((t) => t.tenantId === tenantId);
    if (integrationId) items = items.filter((t) => t.integrationId === integrationId);
    const start = (page - 1) * limit;
    return { data: items.slice(start, start + limit).map((t) => ({ ...t })), total: items.length };
  }

  async countTickets(tenantId: string): Promise<number> {
    return Array.from(this.tickets.values()).filter((t) => t.tenantId === tenantId).length;
  }

  async purgeOlderThan(before: Date): Promise<number> {
    const cutoff = before.toISOString();
    let deleted = 0;
    for (const [id, log] of this.logs) {
      if (log.createdAt < cutoff) {
        this.logs.delete(id);
        deleted++;
      }
    }
    for (const [id, d] of this.deliveries) {
      if (d.status === 'success' && d.createdAt < cutoff) {
        this.deliveries.delete(id);
        deleted++;
      }
    }
    return deleted;
  }
}
