/**
 * @module components/command-center/integrations/connector-types
 * @description Field/label metadata driving the Add Connection wizard's Step 2 form and
 * the Connected list's type label. Mirrors apps/integration-service/src/schemas/integration.ts
 * exactly — only fields with no safe server-side `.default(...)` are asked for.
 */
import type { IntegrationType, TriggerEvent, IntegrationInput } from '@/hooks/use-integrations'

export interface FieldDef {
  key: string
  label: string
  help: string
  secret?: boolean
  optional?: boolean
  placeholder?: string
}

export type ConnectorGroup = 'siem' | 'webhook' | 'ticketing'

export interface ConnectorMeta {
  label: string
  group: ConnectorGroup
  purpose: string
  fields: FieldDef[]
}

export const CONNECTOR_TYPES: Record<IntegrationType, ConnectorMeta> = {
  splunk_hec: {
    label: 'Splunk HEC', group: 'siem',
    purpose: 'Push IOCs and alerts to Splunk via HTTP Event Collector.',
    fields: [
      { key: 'url', label: 'HEC URL', help: 'Splunk: Settings → Data inputs → HTTP Event Collector → your endpoint', placeholder: 'https://splunk.example.com:8088' },
      { key: 'token', label: 'HEC Token', help: 'Splunk: Settings → Data inputs → HTTP Event Collector → your token', secret: true },
    ],
  },
  sentinel: {
    label: 'Microsoft Sentinel', group: 'siem',
    purpose: 'Send events to a Sentinel Log Analytics workspace.',
    fields: [
      { key: 'workspaceId', label: 'Workspace ID', help: 'Sentinel: Log Analytics workspace → Agents management → Workspace ID' },
      { key: 'sharedKey', label: 'Shared Key', help: 'Sentinel: Log Analytics workspace → Agents management → Primary key', secret: true },
    ],
  },
  elastic_siem: {
    label: 'Elastic', group: 'siem',
    purpose: 'Index alerts into Elastic Security.',
    fields: [
      { key: 'url', label: 'Elasticsearch URL', help: 'Your Elastic cluster endpoint', placeholder: 'https://elastic.example.com:9200' },
      { key: 'apiKey', label: 'API Key', help: 'Kibana: Stack Management → API Keys → Create API key', secret: true },
    ],
  },
  webhook: {
    label: 'Webhook', group: 'webhook',
    purpose: 'POST events as JSON to any URL you control.',
    fields: [
      { key: 'url', label: 'Webhook URL', help: 'The endpoint that will receive POSTed events' },
      { key: 'secret', label: 'Signing secret (optional)', help: 'Used to HMAC-sign the payload so you can verify it came from ETIP', secret: true, optional: true },
    ],
  },
  servicenow: {
    label: 'ServiceNow', group: 'ticketing',
    purpose: 'Create incidents in ServiceNow.',
    fields: [
      { key: 'instanceUrl', label: 'Instance URL', help: 'Your ServiceNow instance URL', placeholder: 'https://yourinstance.service-now.com' },
      { key: 'username', label: 'Username', help: 'A ServiceNow account with incident-create permission' },
      { key: 'password', label: 'Password', help: 'Password for the account above', secret: true },
    ],
  },
  jira: {
    label: 'Jira', group: 'ticketing',
    purpose: 'Create issues in a Jira project.',
    fields: [
      { key: 'baseUrl', label: 'Base URL', help: 'Your Jira site URL', placeholder: 'https://yourcompany.atlassian.net' },
      { key: 'email', label: 'Account email', help: 'Atlassian account email for the API token' },
      { key: 'apiToken', label: 'API token', help: 'id.atlassian.com → Security → API tokens → Create', secret: true },
      { key: 'projectKey', label: 'Project key', help: 'Jira project key, e.g. SEC', placeholder: 'SEC' },
    ],
  },
}

/** URL-ish field per type — routes the SSRF "must be publicly reachable" 400 to the right input. '' = type has none. */
export const URL_FIELD_KEY: Record<IntegrationType, string> = {
  splunk_hec: 'url', sentinel: '', elastic_siem: 'url',
  webhook: 'url', servicenow: 'instanceUrl', jira: 'baseUrl',
}

export const TRIGGERS: { value: TriggerEvent; label: string }[] = [
  { value: 'alert.created', label: 'Alert created' },
  { value: 'alert.updated', label: 'Alert updated' },
  { value: 'alert.closed', label: 'Alert closed' },
  { value: 'ioc.created', label: 'IOC created' },
  { value: 'ioc.updated', label: 'IOC updated' },
  { value: 'correlation.match', label: 'Correlation match' },
  { value: 'drp.alert.created', label: 'DRP alert created' },
  { value: 'hunt.completed', label: 'Hunt completed' },
]

export const DEFAULT_TRIGGERS: TriggerEvent[] = ['alert.created', 'ioc.created']

/** Builds the create/update payload's config field from flat wizard values. */
export function buildConfigPayload(type: IntegrationType, v: Record<string, string>): Pick<IntegrationInput, 'siemConfig' | 'webhookConfig' | 'ticketingConfig'> {
  switch (type) {
    case 'splunk_hec': return { siemConfig: { type, url: v.url ?? '', token: v.token ?? '' } }
    case 'sentinel': return { siemConfig: { type, workspaceId: v.workspaceId ?? '', sharedKey: v.sharedKey ?? '' } }
    case 'elastic_siem': return { siemConfig: { type, url: v.url ?? '', apiKey: v.apiKey ?? '' } }
    case 'webhook': return { webhookConfig: { url: v.url ?? '', ...(v.secret ? { secret: v.secret } : {}) } }
    case 'servicenow': return { ticketingConfig: { type, instanceUrl: v.instanceUrl ?? '', username: v.username ?? '', password: v.password ?? '' } }
    case 'jira': return { ticketingConfig: { type, baseUrl: v.baseUrl ?? '', email: v.email ?? '', apiToken: v.apiToken ?? '', projectKey: v.projectKey ?? '' } }
  }
}

/** Reverse of buildConfigPayload — flattens an existing integration's config for Edit mode. */
export function valuesFromIntegration(integration: {
  type: IntegrationType
  siemConfig?: unknown
  webhookConfig?: unknown
  ticketingConfig?: unknown
}): Record<string, string> {
  const cfg = (integration.siemConfig ?? integration.webhookConfig ?? integration.ticketingConfig ?? {}) as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const f of CONNECTOR_TYPES[integration.type].fields) {
    const val = cfg[f.key]
    if (typeof val === 'string') out[f.key] = val
  }
  return out
}
