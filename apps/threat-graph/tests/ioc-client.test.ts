import { describe, it, expect, vi, beforeEach } from 'vitest';
import type pino from 'pino';

vi.mock('@etip/shared-auth', () => ({
  signServiceToken: vi.fn(() => 'signed-service-token'),
}));

import { IocClient } from '../src/clients/ioc-client.js';

const mockLogger: pino.Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), child: vi.fn() } as any;

const TENANT = '11111111-1111-1111-1111-111111111111';
const IOC_ID = '22222222-2222-2222-2222-222222222222';

function validRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: IOC_ID, tenantId: TENANT, iocType: 'domain', value: 'x.com',
    severity: 'high', tlp: 'amber', confidence: 80, lifecycle: 'active',
    tags: [], threatActors: [], malwareFamilies: [], mitreAttack: [],
    feedSourceId: null, enrichmentData: null,
    firstSeen: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('IocClient', () => {
  let client: IocClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = new IocClient('http://etip_ioc_intelligence:3007', mockLogger);
  });

  it('sends x-service-token and x-tenant-id headers, never logging the token', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: validRecord() }) });

    await client.getIoc(TENANT, IOC_ID);

    const [, opts] = fetchMock.mock.calls[0]!;
    expect(opts.headers['x-service-token']).toBe('signed-service-token');
    expect(opts.headers['x-tenant-id']).toBe(TENANT);
    expect((mockLogger.warn as any).mock.calls.flat().join(' ')).not.toContain('signed-service-token');
  });

  it('getIoc rejects non-UUID ids before any request (queue payload cannot steer the path)', async () => {
    for (const bad of ['internal/tenants', '../internal/tenants', '', 'abc']) {
      await expect(client.getIoc(TENANT, bad)).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_IOC_ID' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('getIoc returns null on 404', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    expect(await client.getIoc(TENANT, IOC_ID)).toBeNull();
  });

  it('getIoc throws AppError 502 on a non-2xx, non-404 response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(client.getIoc(TENANT, IOC_ID)).rejects.toMatchObject({ statusCode: 502, code: 'IOC_SERVICE_ERROR' });
  });

  it('skips an invalid record instead of throwing', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { id: 'not-a-uuid' } }) });
    expect(await client.getIoc(TENANT, IOC_ID)).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('listIocs query string always has sort=updatedAt&order=asc, plus updatedSince when given', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [], total: 0 }) });

    await client.listIocs(TENANT, { page: 2, limit: 100, updatedSince: '2026-01-01T00:00:00.000Z' });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain('sort=updatedAt');
    expect(url).toContain('order=asc');
    expect(url).toContain('page=2');
    expect(url).toContain('limit=100');
    expect(url).toContain('updatedSince=2026-01-01T00%3A00%3A00.000Z');
  });

  it('listIocs skips invalid page items without failing the page', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ data: [validRecord(), { id: 'bad' }], total: 2 }),
    });

    const result = await client.listIocs(TENANT, { page: 1, limit: 50 });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(2);
  });

  it('listTenants returns the tenant summary array', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [{ tenantId: TENANT, iocCount: 5, lastUpdatedAt: null }] }) });
    const tenants = await client.listTenants();
    expect(tenants).toEqual([{ tenantId: TENANT, iocCount: 5, lastUpdatedAt: null }]);
  });

  // R2 — tenant-scoped reads.

  it('getIoc drops a record whose tenantId does not match the requested tenant (treated as not found)', async () => {
    const OTHER_TENANT = '99999999-9999-9999-9999-999999999999';
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: validRecord({ tenantId: OTHER_TENANT }) }) });
    expect(await client.getIoc(TENANT, IOC_ID)).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ expectedTenantId: TENANT, actualTenantId: OTHER_TENANT }), expect.stringContaining('tenant mismatch'));
  });

  it('listIocs reports rawCount as the raw HTTP page size, and drops tenant-mismatched records without counting them as items', async () => {
    const OTHER_TENANT = '99999999-9999-9999-9999-999999999999';
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ data: [validRecord(), validRecord({ id: '33333333-3333-3333-3333-333333333333', tenantId: OTHER_TENANT }), { id: 'bad' }], total: 3 }),
    });
    const result = await client.listIocs(TENANT, { page: 1, limit: 50 });
    expect(result.rawCount).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.tenantId).toBe(TENANT);
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ expectedTenantId: TENANT, actualTenantId: OTHER_TENANT }), expect.stringContaining('tenant mismatch'));
  });

  // R5 — never follow a redirect (service token must not leak to another host).

  it('every fetch call uses redirect: "error"', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [], total: 0 }) });
    await client.listIocs(TENANT, { page: 1, limit: 50 });
    const [, opts] = fetchMock.mock.calls[0]!;
    expect(opts.redirect).toBe('error');
  });
});
