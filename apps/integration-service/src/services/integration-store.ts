import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { AppError } from '@etip/shared-utils';
import { prisma } from '../prisma.js';
import { getLogger } from '../logger.js';
import type {
  Integration,
  IntegrationLog,
  WebhookDelivery,
  Ticket,
  LogStatus,
  TriggerEvent,
  CreateIntegrationInput,
  UpdateIntegrationInput,
} from '../schemas/integration.js';
import type { FieldMapper } from './field-mapper.js';
import type { CredentialEncryption } from './credential-encryption.js';
import { toConfigJson, toRow, toUpdateRow, fromRow } from './integration-row.js';
import type { IntegrationRecordsRepo } from './records-repo.js';
import { MemoryRecordsRepo } from './records-repo.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s: string): boolean => UUID_RE.test(s);

/**
 * Store for integration entities. Write-through cache: the Map is the fast
 * synchronous read path; create/update/delete write to Postgres first and only
 * update the Map on success (DB failure throws — cache stays consistent with DB).
 * Call hydrate() at startup to load persisted rows into the cache.
 *
 * Logs/deliveries/DLQ/tickets (Step 3 S156) are NOT cached — they go straight through
 * `records` (in-memory for dev/test, Prisma in production, see records-repo.ts).
 */
export class IntegrationStore {
  private integrations = new Map<string, Integration>(); // memory-ok: derived — write-through cache of the integrations table (hydrate() at startup)
  private fieldMapper: FieldMapper | null = null;
  private encryption: CredentialEncryption | null = null;

  constructor(private readonly records: IntegrationRecordsRepo = new MemoryRecordsRepo()) {}

  /** Inject field mapper for auto-populating default mappings on creation. */
  setFieldMapper(mapper: FieldMapper): void {
    this.fieldMapper = mapper;
  }

  /**
   * Inject credential encryption. Once set, secret fields (credentials{} values and
   * keys like token/apiKey/password/sharedKey) are encrypted at rest in the Map and
   * transparently decrypted on every read — callers never see ciphertext.
   */
  setCredentialEncryption(encryption: CredentialEncryption): void {
    this.encryption = encryption;
  }

  private decryptOut(integration: Integration): Integration {
    return this.encryption ? this.encryption.decryptSecretFields(integration) : integration;
  }

  /** Run a read (or admin write) against `records`. DB failure -> AppError(503) — no fallback to memory (Step 3 D3). */
  private async dbRead<T>(fn: () => Promise<T>, message: string): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof AppError) throw err;
      getLogger().error({ error: err instanceof Error ? err.message : String(err) }, message);
      throw new AppError(503, message, 'DB_UNAVAILABLE');
    }
  }

  /**
   * Run a delivery-path write against `records`. These fire inside the webhook/SIEM send
   * loops' try blocks — if they threw on a DB outage the loop would treat it as a failed
   * push and re-send the webhook to the customer, so a DB hiccup here just logs and moves on.
   */
  private async bestEffort(fn: () => Promise<void>, context: Record<string, unknown>, message: string): Promise<void> {
    try {
      await fn();
    } catch (err) {
      getLogger().error({ ...context, error: err instanceof Error ? err.message : String(err) }, message);
    }
  }

  // ─── Integration CRUD ──────────────────────────────────────

  async hydrate(): Promise<void> {
    const rows = await prisma.integration.findMany();
    for (const row of rows) {
      this.integrations.set(row.id, fromRow(row));
    }
  }

  /**
   * hydrate(), retrying with backoff if the DB is still starting. Never throws —
   * a still-down DB after all attempts just leaves the cache empty (or partially
   * populated from an earlier attempt) and logs; the service keeps serving /health.
   * (ponytail: fixed interval + attempt cap, not a backoff library — this only
   * needs to smooth over a slow-starting Postgres container on deploy.)
   */
  async hydrateWithRetry(
    logger: { info: (obj: unknown, msg?: string) => void; error: (obj: unknown, msg?: string) => void },
    opts: { retryMs?: number; maxAttempts?: number } = {},
  ): Promise<void> {
    const retryMs = opts.retryMs ?? 30_000;
    const maxAttempts = opts.maxAttempts ?? 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.hydrate();
        logger.info({ attempt }, 'IntegrationStore hydrated from DB');
        return;
      } catch (err) {
        logger.error({ attempt, error: err instanceof Error ? err.message : String(err) }, 'IntegrationStore hydrate failed');
        if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, retryMs));
      }
    }
    logger.error({}, 'IntegrationStore hydrate: giving up after max attempts — starting with an empty cache');
  }

  async createIntegration(tenantId: string, input: CreateIntegrationInput): Promise<Integration> {
    const now = new Date().toISOString();
    const fieldMappings = (input.fieldMappings && input.fieldMappings.length > 0)
      ? input.fieldMappings
      : (this.fieldMapper?.getDefaultMappings(input.type) ?? []);
    const integration: Integration = {
      id: randomUUID(),
      tenantId,
      name: input.name,
      type: input.type,
      enabled: input.enabled ?? true,
      triggers: input.triggers,
      fieldMappings,
      credentials: input.credentials ?? {},
      webhookConfig: input.webhookConfig,
      siemConfig: input.siemConfig,
      ticketingConfig: input.ticketingConfig,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const stored = this.encryption ? this.encryption.encryptSecretFields(integration) : integration;
    try {
      await prisma.integration.create({ data: toRow(stored) });
    } catch (err) {
      getLogger().error({ error: err instanceof Error ? err.message : String(err) }, 'Failed to persist integration');
      throw new AppError(503, 'Failed to persist integration', 'DB_UNAVAILABLE'); // ponytail: DB detail stays in server logs, never in the response
    }
    this.integrations.set(integration.id, stored);
    return integration;
  }

  getIntegration(id: string, tenantId: string): Integration | undefined {
    const item = this.integrations.get(id);
    if (!item || item.tenantId !== tenantId) return undefined;
    return this.decryptOut(item);
  }

  listIntegrations(
    tenantId: string,
    opts: { type?: string; enabled?: boolean; page: number; limit: number },
  ): { data: Integration[]; total: number } {
    let items = Array.from(this.integrations.values()).filter((i) => i.tenantId === tenantId);
    if (opts.type) items = items.filter((i) => i.type === opts.type);
    if (opts.enabled !== undefined) items = items.filter((i) => i.enabled === opts.enabled);
    const total = items.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: items.slice(start, start + opts.limit).map((i) => this.decryptOut(i)), total };
  }

  async updateIntegration(
    id: string,
    tenantId: string,
    input: UpdateIntegrationInput,
  ): Promise<Integration | undefined> {
    const existing = this.integrations.get(id);
    if (!existing || existing.tenantId !== tenantId) return undefined;
    const encryptedInput = this.encryption ? this.encryption.encryptSecretFields(input) : input;
    const updated: Integration = {
      ...existing,
      ...encryptedInput,
      id: existing.id,
      tenantId: existing.tenantId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    try {
      await prisma.integration.updateMany({ where: { id, tenantId }, data: toUpdateRow(updated) });
    } catch (err) {
      getLogger().error({ error: err instanceof Error ? err.message : String(err) }, 'Failed to persist integration update');
      throw new AppError(503, 'Failed to persist integration update', 'DB_UNAVAILABLE'); // ponytail: DB detail stays in server logs, never in the response
    }
    this.integrations.set(id, updated);
    return this.decryptOut(updated);
  }

  async deleteIntegration(id: string, tenantId: string): Promise<boolean> {
    const existing = this.getIntegration(id, tenantId);
    if (!existing) return false;
    try {
      await prisma.integration.deleteMany({ where: { id, tenantId } });
    } catch (err) {
      getLogger().error({ error: err instanceof Error ? err.message : String(err) }, 'Failed to delete integration');
      throw new AppError(503, 'Failed to delete integration', 'DB_UNAVAILABLE'); // ponytail: DB detail stays in server logs, never in the response
    }
    this.integrations.delete(id);
    await this.bestEffort(
      () => this.records.deleteLogsForIntegration(tenantId, id),
      { integrationId: id },
      'Failed to delete integration logs',
    );
    return true;
  }

  getEnabledForTrigger(tenantId: string, event: TriggerEvent): Integration[] {
    return Array.from(this.integrations.values())
      .filter((i) => i.tenantId === tenantId && i.enabled && i.triggers.includes(event))
      .map((i) => this.decryptOut(i));
  }

  /**
   * Mark integration as recently used. Called after every SIEM/webhook/ticketing
   * push — the Map update is synchronous so pushes never wait on it. The DB write
   * is fire-and-forget (ponytail: awaiting here would add DB latency to every push;
   * losing a lastUsedAt timestamp on crash is fine — upgrade to awaited if that changes).
   */
  touchIntegration(id: string): void {
    const item = this.integrations.get(id);
    if (!item) return;
    const now = new Date().toISOString();
    item.lastUsedAt = now;
    item.updatedAt = now;
    prisma.integration
      .updateMany({
        where: { id, tenantId: item.tenantId },
        data: { config: toConfigJson(item) as unknown as Prisma.InputJsonValue, updatedAt: new Date(now) },
      })
      .catch((err: unknown) => {
        getLogger().error(
          { integrationId: id, error: err instanceof Error ? err.message : String(err) },
          'touchIntegration: DB write failed — cache updated, DB left stale',
        );
      });
  }

  // ─── Logs (best-effort writes, throwing reads) ──────────────

  /** Add an integration log entry. Best-effort — see bestEffort() doc. */
  async addLog(
    integrationId: string,
    tenantId: string,
    event: TriggerEvent,
    status: LogStatus,
    details: { statusCode?: number; errorMessage?: string; attempt?: number; payload?: Record<string, unknown>; responseBody?: string },
  ): Promise<IntegrationLog> {
    const log: IntegrationLog = {
      id: randomUUID(),
      integrationId,
      tenantId,
      event,
      status,
      statusCode: details.statusCode ?? null,
      errorMessage: details.errorMessage ?? null,
      attempt: details.attempt ?? 1,
      payload: details.payload ?? {},
      responseBody: details.responseBody ?? null,
      createdAt: new Date().toISOString(),
    };
    await this.bestEffort(() => this.records.addLog(log), { integrationId, logId: log.id }, 'Failed to persist integration log'); // ponytail: best-effort — see bestEffort() doc
    return log;
  }

  async listLogs(
    integrationId: string,
    tenantId: string,
    opts: { page: number; limit: number },
  ): Promise<{ data: IntegrationLog[]; total: number }> {
    return this.dbRead(
      () => this.records.listLogs(tenantId, integrationId, opts.page, opts.limit),
      'Failed to list integration logs',
    );
  }

  // ─── Webhook Deliveries + DLQ ────────────────────────────────

  /** Create a webhook delivery attempt. Best-effort — see bestEffort() doc. */
  async createDelivery(delivery: Omit<WebhookDelivery, 'id' | 'createdAt'>): Promise<WebhookDelivery> {
    const d: WebhookDelivery = { ...delivery, id: randomUUID(), createdAt: new Date().toISOString() };
    await this.bestEffort(() => this.records.insertDelivery(d), { deliveryId: d.id }, 'Failed to persist webhook delivery'); // ponytail: best-effort — see bestEffort() doc
    return d;
  }

  /** Update delivery status. Best-effort — see bestEffort() doc. */
  async updateDelivery(id: string, updates: Partial<WebhookDelivery>): Promise<WebhookDelivery | undefined> {
    let result: WebhookDelivery | undefined;
    await this.bestEffort(async () => { // ponytail: best-effort — see bestEffort() doc
      result = (await this.records.updateDelivery(id, updates)) ?? undefined;
    }, { deliveryId: id }, 'Failed to persist webhook delivery update');
    return result;
  }

  /** Move a failed delivery to the dead letter queue. Best-effort — see bestEffort() doc. */
  async moveToDLQ(deliveryId: string): Promise<boolean> {
    let moved = false;
    await this.bestEffort(async () => { // ponytail: best-effort — see bestEffort() doc
      const updated = await this.records.updateDelivery(deliveryId, { status: 'dead_letter' });
      moved = updated !== null;
    }, { deliveryId }, 'Failed to move delivery to dead letter queue');
    return moved;
  }

  async listDLQ(tenantId: string, opts: { page: number; limit: number }): Promise<{ data: WebhookDelivery[]; total: number }> {
    return this.dbRead(
      () => this.records.listDeliveries(tenantId, 'dead_letter', opts.page, opts.limit),
      'Failed to list dead letter queue',
    );
  }

  /** Retry a DLQ item (admin action, not on the delivery hot path — throws on DB failure). */
  async retryDLQ(id: string, tenantId: string): Promise<WebhookDelivery | undefined> {
    return this.dbRead(async () => {
      const existing = await this.records.getDelivery(id);
      if (!existing || existing.tenantId !== tenantId || existing.status !== 'dead_letter') return undefined;
      const updated = await this.records.updateDelivery(id, {
        status: 'retrying', attempts: 0, nextRetryAt: null, lastError: null,
      });
      return updated ?? undefined;
    }, 'Failed to retry dead letter queue item');
  }

  // ─── Tickets (writes and reads throw on DB failure) ─────────

  async createTicket(ticket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>): Promise<Ticket> {
    if (!isUuid(ticket.tenantId)) throw new AppError(400, 'tenantId must be a UUID', 'VALIDATION_ERROR');
    const now = new Date().toISOString();
    const t: Ticket = { ...ticket, id: randomUUID(), createdAt: now, updatedAt: now };
    return this.dbRead(async () => {
      await this.records.insertTicket(t);
      return t;
    }, 'Failed to persist ticket');
  }

  async getTicket(id: string, tenantId: string): Promise<Ticket | undefined> {
    return this.dbRead(async () => {
      const t = await this.records.getTicket(id);
      return (t && t.tenantId === tenantId) ? t : undefined;
    }, 'Failed to get ticket');
  }

  async updateTicketStatus(id: string, tenantId: string, status: string): Promise<Ticket | undefined> {
    return this.dbRead(async () => {
      const existing = await this.records.getTicket(id);
      if (!existing || existing.tenantId !== tenantId) return undefined;
      const updated = await this.records.updateTicket(id, { status, updatedAt: new Date().toISOString() });
      return updated ?? undefined;
    }, 'Failed to update ticket status');
  }

  async listTickets(
    tenantId: string,
    opts: { integrationId?: string; page: number; limit: number },
  ): Promise<{ data: Ticket[]; total: number }> {
    return this.dbRead(
      () => this.records.listTickets(tenantId, opts.integrationId, opts.page, opts.limit),
      'Failed to list tickets',
    );
  }

  // ─── Stats + Retention ───────────────────────────────────────

  async getStats(tenantId: string): Promise<{
    totalIntegrations: number;
    enabledIntegrations: number;
    totalLogs: number;
    failedLogs: number;
    dlqSize: number;
    totalTickets: number;
  }> {
    const integrations = Array.from(this.integrations.values()).filter((i) => i.tenantId === tenantId);
    return this.dbRead(async () => {
      const [totalLogs, failedLogs, dlqSize, totalTickets] = await Promise.all([
        this.records.countLogs(tenantId),
        this.records.countLogs(tenantId, 'failure'),
        this.records.countDeliveries(tenantId, 'dead_letter'),
        this.records.countTickets(tenantId),
      ]);
      return {
        totalIntegrations: integrations.length,
        enabledIntegrations: integrations.filter((i) => i.enabled).length,
        totalLogs, failedLogs, dlqSize, totalTickets,
      };
    }, 'Failed to compute integration stats');
  }

  /** Retention: delete logs and successful deliveries older than `days`. Returns rows deleted. */
  async purgeOldRecords(days = 30): Promise<number> {
    const before = new Date(Date.now() - days * 86_400_000);
    return this.dbRead(() => this.records.purgeOlderThan(before), 'Failed to purge old integration records');
  }
}
