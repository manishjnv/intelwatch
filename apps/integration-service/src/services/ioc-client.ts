import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import { signServiceToken } from '@etip/shared-auth';
import type pino from 'pino';

/**
 * IOC service client (Step 3 S157) — reads real IOC records from ioc-intelligence
 * over the internal service-JWT path, for exports (DECISION-048: no fabricated data).
 * Mirrors apps/threat-graph/src/clients/ioc-client.ts.
 */
export const IocRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  iocType: z.string(),
  value: z.string(),
  severity: z.string(),
  tlp: z.string(),
  confidence: z.number().int(),
  tags: z.array(z.string()).default([]),
  firstSeen: z.string(),
  lastSeen: z.string(),
}).passthrough();

export type IocRecord = z.infer<typeof IocRecordSchema>;

/** Fetches export records for an entity type. Matches ExportRecordFetcher in export-scheduler.ts. */
export type ExportRecordFetcher = (
  tenantId: string,
  entityType: string,
  filters: Record<string, unknown>,
  limit: number,
) => Promise<Record<string, unknown>[]>;

const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 500;

class IocClient {
  constructor(
    private readonly baseUrl: string,
    private readonly logger: pino.Logger,
  ) {}

  /** Pages IOCs for a tenant, newest-updated first, until `limit` valid rows or no more pages. */
  async listIocs(tenantId: string, filters: Record<string, unknown>, limit: number): Promise<IocRecord[]> {
    const results: IocRecord[] = [];
    let page = 1;
    const pageSize = Math.min(PAGE_SIZE, limit);
    while (results.length < limit) {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        sort: 'updatedAt',
        order: 'desc',
      });
      if (typeof filters.severity === 'string') params.set('severity', filters.severity);

      const res = await this.doFetch(`/api/v1/ioc?${params.toString()}`, tenantId);
      if (!res.ok) throw new AppError(502, 'IOC service request failed', 'IOC_SERVICE_ERROR', { status: res.status });

      const body = (await res.json()) as { data: unknown[]; total?: number };
      if (body.data.length === 0) break;

      for (const raw of body.data) {
        const parsed = IocRecordSchema.safeParse(raw);
        if (!parsed.success) {
          this.logger.warn({ issues: parsed.error.issues }, 'Skipping invalid IOC record from ioc-intelligence');
          continue;
        }
        if (parsed.data.tenantId !== tenantId) {
          this.logger.warn({ iocId: parsed.data.id, expectedTenantId: tenantId, actualTenantId: parsed.data.tenantId }, 'Dropping IOC — tenant mismatch');
          continue;
        }
        results.push(parsed.data);
        if (results.length >= limit) break;
      }

      if (body.data.length < pageSize) break; // last page
      page++;
    }
    return results;
  }

  private async doFetch(path: string, tenantId: string): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      headers: {
        'x-service-token': signServiceToken('integration-service', 'ioc-intelligence'),
        'x-tenant-id': tenantId,
      },
      redirect: 'error', // never follow a redirect to another host with the service token attached
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }
}

/** Builds an ExportRecordFetcher backed by the real ioc-intelligence service. Only `iocs` is supported today. */
export function createIocExportFetcher(baseUrl: string, logger: pino.Logger): ExportRecordFetcher {
  const client = new IocClient(baseUrl, logger);
  return async (tenantId, entityType, filters, limit) => {
    if (entityType !== 'iocs') {
      throw new AppError(400, `Export of ${entityType} is not available yet`, 'EXPORT_ENTITY_UNSUPPORTED');
    }
    const iocs = await client.listIocs(tenantId, filters, limit);
    return iocs.map((ioc) => ({
      id: ioc.id,
      type: ioc.iocType,
      value: ioc.value,
      severity: ioc.severity,
      confidence: ioc.confidence,
      tlp: ioc.tlp,
      tags: ioc.tags,
      createdAt: ioc.firstSeen,
      lastSeen: ioc.lastSeen,
    }));
  };
}
