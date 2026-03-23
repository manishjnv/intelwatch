import { randomUUID } from 'crypto';
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

/**
 * In-memory store for integration entities.
 * Follows DECISION-013/022 pattern — will migrate to DB when scaling.
 */
export class IntegrationStore {
  private integrations = new Map<string, Integration>();
  private logs = new Map<string, IntegrationLog>();
  private deliveries = new Map<string, WebhookDelivery>();
  private tickets = new Map<string, Ticket>();
  private deadLetterQueue = new Map<string, WebhookDelivery>();
  private fieldMapper: FieldMapper | null = null;

  /** Inject field mapper for auto-populating default mappings on creation. */
  setFieldMapper(mapper: FieldMapper): void {
    this.fieldMapper = mapper;
  }

  // ─── Integration CRUD ──────────────────────────────────────

  /** Create a new integration config. Auto-populates default field mappings if none provided. */
  createIntegration(tenantId: string, input: CreateIntegrationInput): Integration {
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
    this.integrations.set(integration.id, integration);
    return integration;
  }

  /** Get integration by ID, filtered by tenant. */
  getIntegration(id: string, tenantId: string): Integration | undefined {
    const item = this.integrations.get(id);
    if (!item || item.tenantId !== tenantId) return undefined;
    return item;
  }

  /** List integrations for a tenant with optional filters. */
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
    return { data: items.slice(start, start + opts.limit), total };
  }

  /** Update an existing integration. */
  updateIntegration(
    id: string,
    tenantId: string,
    input: UpdateIntegrationInput,
  ): Integration | undefined {
    const existing = this.getIntegration(id, tenantId);
    if (!existing) return undefined;
    const updated: Integration = {
      ...existing,
      ...input,
      id: existing.id,
      tenantId: existing.tenantId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.integrations.set(id, updated);
    return updated;
  }

  /** Delete an integration and its logs. */
  deleteIntegration(id: string, tenantId: string): boolean {
    const existing = this.getIntegration(id, tenantId);
    if (!existing) return false;
    this.integrations.delete(id);
    // Clean up related logs
    for (const [logId, log] of this.logs) {
      if (log.integrationId === id) this.logs.delete(logId);
    }
    return true;
  }

  /** Get all enabled integrations for a tenant that match a trigger event. */
  getEnabledForTrigger(tenantId: string, event: TriggerEvent): Integration[] {
    return Array.from(this.integrations.values()).filter(
      (i) => i.tenantId === tenantId && i.enabled && i.triggers.includes(event),
    );
  }

  /** Mark integration as recently used. */
  touchIntegration(id: string): void {
    const item = this.integrations.get(id);
    if (item) {
      item.lastUsedAt = new Date().toISOString();
      item.updatedAt = new Date().toISOString();
    }
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
