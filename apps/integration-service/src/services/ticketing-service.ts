import { AppError } from '@etip/shared-utils';
import type { TicketingConfig, Ticket, CreateTicketInput, FieldMapping } from '../schemas/integration.js';
import type { IntegrationStore } from './integration-store.js';
import type { FieldMapper } from './field-mapper.js';
import { getLogger } from '../logger.js';

interface TicketResult {
  success: boolean;
  externalId: string;
  externalUrl: string;
  error?: string;
}

/**
 * Ticketing integration for ServiceNow and Jira.
 * Creates tickets from DRP alerts and syncs status bidirectionally.
 */
export class TicketingService {
  constructor(
    private readonly store: IntegrationStore,
    private readonly fieldMapper: FieldMapper,
  ) {}

  /** Create a ticket in the configured external ticketing system. */
  async createTicket(
    integrationId: string,
    tenantId: string,
    ticketingConfig: TicketingConfig,
    input: CreateTicketInput,
    fieldMappings: FieldMapping[],
  ): Promise<Ticket> {
    const logger = getLogger();
    const sourcePayload: Record<string, unknown> = {
      title: input.title,
      description: input.description,
      priority: input.priority,
      alertId: input.alertId,
      ...input.additionalFields,
    };

    const mappedPayload = this.fieldMapper.applyMappings(sourcePayload, fieldMappings);

    let result: TicketResult;
    try {
      switch (ticketingConfig.type) {
        case 'servicenow':
          result = await this.createServiceNowTicket(ticketingConfig, mappedPayload);
          break;
        case 'jira':
          result = await this.createJiraTicket(ticketingConfig, mappedPayload, input);
          break;
        default:
          throw new AppError(400, 'Unsupported ticketing type', 'UNSUPPORTED_TICKETING');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ integrationId, error: msg }, 'Ticket creation failed');
      throw new AppError(502, `Ticket creation failed: ${msg}`, 'TICKET_CREATION_FAILED');
    }

    if (!result.success) {
      throw new AppError(502, `Ticket creation failed: ${result.error}`, 'TICKET_CREATION_FAILED');
    }

    // Store ticket locally for status tracking
    const ticket = this.store.createTicket({
      integrationId,
      tenantId,
      externalId: result.externalId,
      externalUrl: result.externalUrl,
      alertId: input.alertId,
      title: input.title,
      status: 'open',
      priority: input.priority,
    });

    this.store.addLog(integrationId, tenantId, 'alert.created', 'success', {
      statusCode: 201,
      payload: { ticketId: ticket.id, externalId: result.externalId },
    });
    this.store.touchIntegration(integrationId);

    return ticket;
  }

  /** Sync ticket status from external system. */
  async syncStatus(
    ticketId: string,
    tenantId: string,
    ticketingConfig: TicketingConfig,
  ): Promise<Ticket> {
    const ticket = this.store.getTicket(ticketId, tenantId);
    if (!ticket) {
      throw new AppError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
    }

    let externalStatus: string;
    try {
      switch (ticketingConfig.type) {
        case 'servicenow':
          externalStatus = await this.getServiceNowStatus(ticketingConfig, ticket.externalId);
          break;
        case 'jira':
          externalStatus = await this.getJiraStatus(ticketingConfig, ticket.externalId);
          break;
        default:
          throw new AppError(400, 'Unsupported ticketing type', 'UNSUPPORTED_TICKETING');
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(502, 'Status sync failed', 'STATUS_SYNC_FAILED');
    }

    const updated = this.store.updateTicketStatus(ticketId, tenantId, externalStatus);
    if (!updated) {
      throw new AppError(404, 'Ticket not found after update', 'TICKET_NOT_FOUND');
    }
    return updated;
  }

  /** Test connection to a ticketing system. */
  async testConnection(config: TicketingConfig): Promise<{ success: boolean; message: string }> {
    try {
      switch (config.type) {
        case 'servicenow':
          return await this.testServiceNow(config);
        case 'jira':
          return await this.testJira(config);
        default:
          return { success: false, message: 'Unsupported ticketing type' };
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed',
      };
    }
  }

  // ─── ServiceNow ────────────────────────────────────────────

  /** Create incident in ServiceNow via Table API. */
  private async createServiceNowTicket(
    config: { instanceUrl: string; username: string; password: string; tableName: string },
    payload: Record<string, unknown>,
  ): Promise<TicketResult> {
    const url = `${config.instanceUrl}/api/now/table/${config.tableName}`;
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, externalId: '', externalUrl: '', error: `HTTP ${response.status}: ${text}` };
    }

    const data = await response.json() as { result: { sys_id: string; number: string } };
    return {
      success: true,
      externalId: data.result.number || data.result.sys_id,
      externalUrl: `${config.instanceUrl}/nav_to.do?uri=incident.do?sys_id=${data.result.sys_id}`,
    };
  }

  /** Get ServiceNow incident status. */
  private async getServiceNowStatus(
    config: { instanceUrl: string; username: string; password: string; tableName: string },
    externalId: string,
  ): Promise<string> {
    const url = `${config.instanceUrl}/api/now/table/${config.tableName}?sysparm_query=number=${externalId}&sysparm_fields=state`;
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

    const response = await fetch(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });

    if (!response.ok) throw new AppError(502, 'ServiceNow status fetch failed', 'SNOW_FETCH_FAILED');
    const data = await response.json() as { result: Array<{ state: string }> };
    const stateMap: Record<string, string> = { '1': 'new', '2': 'in_progress', '3': 'on_hold', '6': 'resolved', '7': 'closed' };
    const stateValue = data.result[0]?.state;
    return (stateValue ? stateMap[stateValue] : undefined) ?? 'unknown';
  }

  /** Test ServiceNow connection. */
  private async testServiceNow(
    config: { instanceUrl: string; username: string; password: string; tableName: string },
  ): Promise<{ success: boolean; message: string }> {
    const url = `${config.instanceUrl}/api/now/table/${config.tableName}?sysparm_limit=1`;
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    const response = await fetch(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    return { success: response.ok, message: response.ok ? 'Connected to ServiceNow' : `HTTP ${response.status}` };
  }

  // ─── Jira ──────────────────────────────────────────────────

  /** Create issue in Jira via REST API v3. */
  private async createJiraTicket(
    config: { baseUrl: string; email: string; apiToken: string; projectKey: string; issueType: string },
    _mappedPayload: Record<string, unknown>,
    input: CreateTicketInput,
  ): Promise<TicketResult> {
    const url = `${config.baseUrl}/rest/api/3/issue`;
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    const priorityMap: Record<string, string> = { critical: 'Highest', high: 'High', medium: 'Medium', low: 'Low' };

    const body = {
      fields: {
        project: { key: config.projectKey },
        summary: input.title,
        description: {
          type: 'doc', version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: input.description }] }],
        },
        issuetype: { name: config.issueType },
        priority: { name: priorityMap[input.priority] ?? 'Medium' },
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, externalId: '', externalUrl: '', error: `HTTP ${response.status}: ${text}` };
    }

    const data = await response.json() as { key: string; self: string };
    return {
      success: true,
      externalId: data.key,
      externalUrl: `${config.baseUrl}/browse/${data.key}`,
    };
  }

  /** Get Jira issue status. */
  private async getJiraStatus(
    config: { baseUrl: string; email: string; apiToken: string },
    externalId: string,
  ): Promise<string> {
    const url = `${config.baseUrl}/rest/api/3/issue/${externalId}?fields=status`;
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');

    const response = await fetch(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });

    if (!response.ok) throw new AppError(502, 'Jira status fetch failed', 'JIRA_FETCH_FAILED');
    const data = await response.json() as { fields: { status: { name: string } } };
    return data.fields.status.name.toLowerCase();
  }

  /** Test Jira connection. */
  private async testJira(
    config: { baseUrl: string; email: string; apiToken: string },
  ): Promise<{ success: boolean; message: string }> {
    const url = `${config.baseUrl}/rest/api/3/myself`;
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    const response = await fetch(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
    });
    return { success: response.ok, message: response.ok ? 'Connected to Jira' : `HTTP ${response.status}` };
  }
}
