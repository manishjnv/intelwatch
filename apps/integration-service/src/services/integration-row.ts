import type { Prisma } from '@prisma/client';
import type { Integration, IntegrationType, TriggerEvent } from '../schemas/integration.js';

/**
 * DB row <-> domain Integration mapping (S166 PR B). Split out of integration-store.ts
 * to keep that file under the project's 400-line cap.
 */

/** Everything that isn't a scalar column — credentials/configs are already encrypted by the time this is built. */
interface IntegrationConfigJson {
  credentials: Record<string, unknown>;
  webhookConfig?: Integration['webhookConfig'];
  siemConfig?: Integration['siemConfig'];
  ticketingConfig?: Integration['ticketingConfig'];
  lastUsedAt: string | null;
}

export function toConfigJson(integration: Integration): IntegrationConfigJson {
  return {
    credentials: integration.credentials,
    webhookConfig: integration.webhookConfig,
    siemConfig: integration.siemConfig,
    ticketingConfig: integration.ticketingConfig,
    lastUsedAt: integration.lastUsedAt,
  };
}

/** Full row shape for `prisma.integration.create()`. */
export function toRow(integration: Integration): Prisma.IntegrationUncheckedCreateInput {
  return {
    id: integration.id,
    tenantId: integration.tenantId,
    name: integration.name,
    type: integration.type,
    enabled: integration.enabled,
    triggers: integration.triggers,
    fieldMappings: integration.fieldMappings as unknown as Prisma.InputJsonValue,
    config: toConfigJson(integration) as unknown as Prisma.InputJsonValue,
    createdAt: new Date(integration.createdAt),
    updatedAt: new Date(integration.updatedAt),
  };
}

/** Row data for `updateMany()` — everything toRow() writes except the immutable id/tenantId/createdAt columns. */
export function toUpdateRow(integration: Integration): Prisma.IntegrationUncheckedUpdateManyInput {
  return {
    name: integration.name,
    type: integration.type,
    enabled: integration.enabled,
    triggers: integration.triggers,
    fieldMappings: integration.fieldMappings as unknown as Prisma.InputJsonValue,
    config: toConfigJson(integration) as unknown as Prisma.InputJsonValue,
    updatedAt: new Date(integration.updatedAt),
  };
}

export interface IntegrationRow {
  id: string;
  tenantId: string;
  name: string;
  type: string;
  enabled: boolean;
  triggers: string[];
  fieldMappings: unknown;
  config: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/** Reconstruct the domain Integration (still carrying encrypted secrets, as stored) from a DB row. */
export function fromRow(row: IntegrationRow): Integration {
  const config = (row.config ?? {}) as Partial<IntegrationConfigJson>;
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    type: row.type as IntegrationType,
    enabled: row.enabled,
    triggers: row.triggers as TriggerEvent[],
    fieldMappings: (row.fieldMappings as Integration['fieldMappings'] | null) ?? [],
    credentials: config.credentials ?? {},
    webhookConfig: config.webhookConfig,
    siemConfig: config.siemConfig,
    ticketingConfig: config.ticketingConfig,
    lastUsedAt: config.lastUsedAt ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
