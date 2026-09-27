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

/**
 * Store for integration entities. Write-through cache: the Map is the fast
 * synchronous read path; create/update/delete write to Postgres first and only
 * update the Map on success (DB failure throws — cache stays consistent with DB).
 * Call hydrate() at startup to load persisted rows into the cache.
 */
export class IntegrationStore {
  private integrations = new Map<string, Integration>();
  private logs = new Map<string, IntegrationLog>();
  private deliveries = new Map<string, WebhookDelivery>();
  private tickets = new Map<string, Ticket>();
  private deadLetterQueue = new Map<string, WebhookDelivery>();
  private fieldMapper: FieldMapper | null = null;
  private encryption: CredentialEncryption | null = null;

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

  // ─── Integration CRUD ──────────────────────────────────────

  /**
   * Load all persisted integrations from Postgres into the in-memory cache.
   * Throws on DB failure — see hydrateWithRetry() for the startup-safe wrapper.
   */
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

  /** Create a new integration config. Auto-populates default field mappings if none provided. */
  async createIntegration(tenantId: string, input: CreateIntegrationInput): Promise<Integration> {
    const now = new Date().toISOString();
    // P0 #2: Auto-populate default field mappings when none provided
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
    return integration; // local var still holds plaintext — no decrypt round-trip needed
  }

  /** Get integration by ID, filtered by tenant. Secret fields are decrypted for the caller. */
  getIntegration(id: string, tenantId: string): Integration | undefined {
    const item = this.integrations.get(id);
    if (!item || item.tenantId !== tenantId) return undefined;
    return this.decryptOut(item);
  }

  /** List integrations for a tenant with optional filters. Secret fields are decrypted for the caller. */
  listIntegrations(
    tenantId: string,
    opts: { type?: string; enabled?: boolean; page: number; limit: number },
  ): { data: Integration[]; total: number } {
    let items = Array.from(this.integrations.values()).filter(
      (i) => i.tenantId === tenantId,
    );
    if (opts.type) items = items.filter((i) => i.type === opts.type);
    if (opts.enabled !== undefined) items = items.filter((i) => i.enabled === opts.enabled);
    const total = items.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: items.slice(start, start + opts.limit).map((i) => this.decryptOut(i)), total };
  }

  /** Update an existing integration. Secret fields in `input` are encrypted before storage. */
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

  /** Delete an integration and its logs. */
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
    // Clean up related logs
    for (const [logId, log] of this.logs) {
      if (log.integrationId === id) this.logs.delete(logId);
    }
    return true;
  }

  /** Get all enabled integrations for a tenant that match a trigger event. Secret fields are decrypted for the caller. */
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

  // ─── Logs ──────────────────────────────────────────────────

  /** Add an integration log entry. */
  addLog(
    integrationId: string,
    tenantId: string,
    event: TriggerEvent,
    status: LogStatus,
    details: { statusCode?: number; errorMessage?: string; attempt?: number; payload?: Record<string, unknown>; responseBody?: string },
  ): IntegrationLog {
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
    this.logs.set(log.id, log);
    return log;
  }

  /** List logs for an integration. */
  listLogs(
    integrationId: string,
    tenantId: string,
    opts: { page: number; limit: number },
  ): { data: IntegrationLog[]; total: number } {
    const items = Array.from(this.logs.values())
      .filter((l) => l.integrationId === integrationId && l.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = items.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: items.slice(start, start + opts.limit), total };
  }

  // ─── Webhook Deliveries ────────────────────────────────────

  /** Create a webhook delivery attempt. */
  createDelivery(delivery: Omit<WebhookDelivery, 'id' | 'createdAt'>): WebhookDelivery {
    const d: WebhookDelivery = {
      ...delivery,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.deliveries.set(d.id, d);
    return d;
  }

  /** Update delivery status. */
  updateDelivery(id: string, updates: Partial<WebhookDelivery>): WebhookDelivery | undefined {
    const d = this.deliveries.get(id);
    if (!d) return undefined;
    Object.assign(d, updates);
    return d;
  }

  /** Move a failed delivery to the dead letter queue. */
  moveToDLQ(deliveryId: string): boolean {
    const d = this.deliveries.get(deliveryId);
    if (!d) return false;
    d.status = 'dead_letter';
    this.deadLetterQueue.set(d.id, d);
    this.deliveries.delete(deliveryId);
    return true;
  }

  /** List DLQ items for a tenant. */
  listDLQ(
    tenantId: string,
    opts: { page: number; limit: number },
  ): { data: WebhookDelivery[]; total: number } {
    const items = Array.from(this.deadLetterQueue.values())
      .filter((d) => d.tenantId === tenantId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = items.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: items.slice(start, start + opts.limit), total };
  }

  /** Retry a DLQ item (move back to deliveries). */
  retryDLQ(id: string, tenantId: string): WebhookDelivery | undefined {
    const d = this.deadLetterQueue.get(id);
    if (!d || d.tenantId !== tenantId) return undefined;
    d.status = 'retrying';
    d.attempts = 0;
    d.nextRetryAt = null;
    d.lastError = null;
    this.deliveries.set(d.id, d);
    this.deadLetterQueue.delete(id);
    return d;
  }

  // ─── Tickets ───────────────────────────────────────────────

  /** Store a ticket record. */
  createTicket(ticket: Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'>): Ticket {
    const t: Ticket = {
      ...ticket,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.tickets.set(t.id, t);
    return t;
  }

  /** Get ticket by ID, filtered by tenant. */
  getTicket(id: string, tenantId: string): Ticket | undefined {
    const t = this.tickets.get(id);
    if (!t || t.tenantId !== tenantId) return undefined;
    return t;
  }

  /** Update ticket status (from external sync). */
  updateTicketStatus(id: string, tenantId: string, status: string): Ticket | undefined {
    const t = this.getTicket(id, tenantId);
    if (!t) return undefined;
    t.status = status;
    t.updatedAt = new Date().toISOString();
    return t;
  }

  /** List tickets for a tenant. */
  listTickets(
    tenantId: string,
    opts: { integrationId?: string; page: number; limit: number },
  ): { data: Ticket[]; total: number } {
    let items = Array.from(this.tickets.values()).filter(
      (t) => t.tenantId === tenantId,
    );
    if (opts.integrationId) items = items.filter((t) => t.integrationId === opts.integrationId);
    const total = items.length;
    const start = (opts.page - 1) * opts.limit;
    return { data: items.slice(start, start + opts.limit), total };
  }

  // ─── Stats ─────────────────────────────────────────────────

  /** Get integration stats for a tenant. */
  getStats(tenantId: string): {
    totalIntegrations: number;
    enabledIntegrations: number;
    totalLogs: number;
    failedLogs: number;
    dlqSize: number;
    totalTickets: number;
  } {
    const integrations = Array.from(this.integrations.values()).filter(
      (i) => i.tenantId === tenantId,
    );
    const logs = Array.from(this.logs.values()).filter(
      (l) => l.tenantId === tenantId,
    );
    const dlq = Array.from(this.deadLetterQueue.values()).filter(
      (d) => d.tenantId === tenantId,
    );
    const tickets = Array.from(this.tickets.values()).filter(
      (t) => t.tenantId === tenantId,
    );
    return {
      totalIntegrations: integrations.length,
      enabledIntegrations: integrations.filter((i) => i.enabled).length,
      totalLogs: logs.length,
      failedLogs: logs.filter((l) => l.status === 'failure').length,
      dlqSize: dlq.length,
      totalTickets: tickets.length,
    };
  }
}
