import { z } from 'zod';
import { AppError } from '@etip/shared-utils';
import { signServiceToken } from '@etip/shared-auth';
import type pino from 'pino';

const IocIdSchema = z.string().uuid();

/**
 * IOC service client (S171 P3b) — reads IOC records from ioc-intelligence
 * over the internal service-JWT path (60s TTL, signed fresh per request).
 */
export const IocRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  iocType: z.string(),
  value: z.string(),
  severity: z.string(),
  tlp: z.string(),
  confidence: z.number().int(),
  lifecycle: z.string(),
  tags: z.array(z.string()).default([]),
  threatActors: z.array(z.string()).default([]),
  malwareFamilies: z.array(z.string()).default([]),
  mitreAttack: z.array(z.string()).default([]),
  feedSourceId: z.string().nullable().default(null),
  enrichmentData: z.unknown().nullable().default(null),
  firstSeen: z.string(),
  lastSeen: z.string(),
  updatedAt: z.string(),
}).passthrough();

export type IocRecord = z.infer<typeof IocRecordSchema>;

export interface TenantSummary {
  tenantId: string;
  iocCount: number;
  lastUpdatedAt: string | null;
}

export interface ListIocsOpts {
  page: number;
  limit: number;
  updatedSince?: string;
}

const REQUEST_TIMEOUT_MS = 15_000;

export class IocClient {
  constructor(
    private readonly baseUrl: string,
    private readonly logger: pino.Logger,
  ) {}

  /** Gets one IOC by id. Returns null on 404. */
  async getIoc(tenantId: string, iocId: string): Promise<IocRecord | null> {
    // iocId can come from a queue payload — never let it steer the request path (e.g. "internal/tenants").
    if (!IocIdSchema.safeParse(iocId).success) {
      throw new AppError(400, 'Invalid IOC id', 'INVALID_IOC_ID');
    }
    const res = await this.doFetch(`/api/v1/ioc/${encodeURIComponent(iocId)}`, tenantId);
    if (res.status === 404) return null;
    if (!res.ok) throw this.serviceError(res.status);

    const body = (await res.json()) as { data: unknown };
    const rec = this.parseOne(body.data, iocId);
    if (!rec) return null;
    if (rec.tenantId !== tenantId) {
      this.logger.warn({ iocId, expectedTenantId: tenantId, actualTenantId: rec.tenantId }, 'Dropping IOC — tenant mismatch');
      return null;
    }
    return rec;
  }

  /** Lists IOCs for a tenant, always ordered by updatedAt ascending. rawCount is the page size
   *  BEFORE validation/tenant filtering — callers must page off it, never off items.length, so a
   *  page containing only invalid/mismatched records doesn't look like the end of the set. */
  async listIocs(tenantId: string, opts: ListIocsOpts): Promise<{ items: IocRecord[]; total: number; rawCount: number }> {
    const params = new URLSearchParams({
      page: String(opts.page),
      limit: String(opts.limit),
      sort: 'updatedAt',
      order: 'asc',
    });
    if (opts.updatedSince) params.set('updatedSince', opts.updatedSince);

    const res = await this.doFetch(`/api/v1/ioc?${params.toString()}`, tenantId);
    if (!res.ok) throw this.serviceError(res.status);

    const body = (await res.json()) as { data: unknown[]; total: number };
    const rawCount = body.data.length;
    const items: IocRecord[] = [];
    for (const raw of body.data) {
      const rec = this.parseOne(raw);
      if (!rec) continue;
      if (rec.tenantId !== tenantId) {
        this.logger.warn({ iocId: rec.id, expectedTenantId: tenantId, actualTenantId: rec.tenantId }, 'Dropping IOC — tenant mismatch');
        continue;
      }
      items.push(rec);
    }
    return { items, total: Number(body.total ?? items.length), rawCount };
  }

  /** Lists tenants with IOCs (for the reconciler to iterate). No tenant header — service scope. */
  async listTenants(): Promise<TenantSummary[]> {
    const res = await this.doFetch('/api/v1/ioc/internal/tenants');
    if (!res.ok) throw this.serviceError(res.status);
    const body = (await res.json()) as { data: TenantSummary[] };
    return body.data ?? [];
  }

  private parseOne(raw: unknown, id?: string): IocRecord | null {
    const parsed = IocRecordSchema.safeParse(raw);
    if (!parsed.success) {
      this.logger.warn({ iocId: id, issues: parsed.error.issues }, 'Skipping invalid IOC record from ioc-intelligence');
      return null;
    }
    return parsed.data;
  }

  private serviceError(status: number): AppError {
    return new AppError(502, 'IOC service request failed', 'IOC_SERVICE_ERROR', { status });
  }

  private async doFetch(path: string, tenantId?: string): Promise<Response> {
    const headers: Record<string, string> = {
      'x-service-token': signServiceToken('threat-graph', 'ioc-intelligence'),
    };
    if (tenantId) headers['x-tenant-id'] = tenantId;

    return fetch(`${this.baseUrl}${path}`, {
      headers,
      redirect: 'error', // never follow a redirect to another host with the service token attached
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }
}
