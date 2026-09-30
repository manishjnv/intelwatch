import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pino from 'pino';

vi.mock('@etip/shared-auth', () => ({
  signServiceToken: vi.fn(() => 'signed-service-token'),
}));

import { createIocExportFetcher } from '../src/services/ioc-client.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const OTHER_TENANT = '22222222-2222-2222-2222-222222222222';
const logger = pino({ level: 'silent' });

function iocRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    tenantId: TENANT,
    iocType: 'ip',
    value: '1.2.3.4',
    severity: 'high',
    tlp: 'amber',
    confidence: 80,
    tags: ['botnet'],
    firstSeen: '2026-01-01T00:00:00.000Z',
    lastSeen: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok, status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('createIocExportFetcher', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejects non-iocs entity types with 400 EXPORT_ENTITY_UNSUPPORTED', async () => {
    const fetchRecords = createIocExportFetcher('http://ioc-intelligence', logger);
    await expect(fetchRecords(TENANT, 'alerts', {}, 10)).rejects.toMatchObject({
      statusCode: 400, code: 'EXPORT_ENTITY_UNSUPPORTED',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends the service token, tenant header, and redirect: error', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({ data: [], total: 0 }));
    const fetchRecords = createIocExportFetcher('http://ioc-intelligence', logger);
    await fetchRecords(TENANT, 'iocs', {}, 10);

    const [url, init] = vi.mocked(global.fetch).mock.calls[0]!;
    expect(String(url)).toContain('http://ioc-intelligence/api/v1/ioc?');
    const headers = init!.headers as Record<string, string>;
    expect(headers['x-service-token']).toBeTruthy();
    expect(headers['x-tenant-id']).toBe(TENANT);
    expect(init!.redirect).toBe('error');
  });

  it('pages until `limit` records are collected', async () => {
    // Page 1 is a full page (4 raw rows) but half belong to another tenant and are
    // dropped, so the client must fetch page 2 to reach `limit` valid records.
    const uuid = (n: number) => `aaaaaaaa-aaaa-aaaa-aaaa-${String(n).padStart(12, '0')}`;
    const page1 = [
      iocRow({ id: uuid(1), value: '1.1.1.1' }),
      iocRow({ id: uuid(2), tenantId: OTHER_TENANT, value: '1.1.1.2' }),
      iocRow({ id: uuid(3), value: '1.1.1.3' }),
      iocRow({ id: uuid(4), tenantId: OTHER_TENANT, value: '1.1.1.4' }),
    ];
    const page2 = Array.from({ length: 4 }, (_, i) => iocRow({ id: uuid(100 + i), value: `2.2.2.${i}` }));
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(jsonResponse({ data: page1, total: 8 }))
      .mockResolvedValueOnce(jsonResponse({ data: page2, total: 8 }));

    const fetchRecords = createIocExportFetcher('http://ioc-intelligence', logger);
    const result = await fetchRecords(TENANT, 'iocs', {}, 4);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(4);
  });

  it('drops records belonging to another tenant', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({
      data: [iocRow(), iocRow({ id: 'foreign', tenantId: OTHER_TENANT })],
      total: 2,
    }));
    const fetchRecords = createIocExportFetcher('http://ioc-intelligence', logger);
    const result = await fetchRecords(TENANT, 'iocs', {}, 10);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('33333333-3333-3333-3333-333333333333');
  });

  it('drops records that fail schema validation', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({
      data: [iocRow(), { id: 'not-a-uuid', tenantId: TENANT }],
      total: 2,
    }));
    const fetchRecords = createIocExportFetcher('http://ioc-intelligence', logger);
    const result = await fetchRecords(TENANT, 'iocs', {}, 10);
    expect(result).toHaveLength(1);
  });

  it('maps IOC fields to the export record shape', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({ data: [iocRow()], total: 1 }));
    const fetchRecords = createIocExportFetcher('http://ioc-intelligence', logger);
    const [record] = await fetchRecords(TENANT, 'iocs', {}, 10);
    expect(record).toEqual({
      id: '33333333-3333-3333-3333-333333333333',
      type: 'ip',
      value: '1.2.3.4',
      severity: 'high',
      confidence: 80,
      tlp: 'amber',
      tags: ['botnet'],
      createdAt: '2026-01-01T00:00:00.000Z',
      lastSeen: '2026-01-02T00:00:00.000Z',
    });
  });

  it('throws 502 IOC_SERVICE_ERROR on a non-OK response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({}, false, 500));
    const fetchRecords = createIocExportFetcher('http://ioc-intelligence', logger);
    await expect(fetchRecords(TENANT, 'iocs', {}, 10)).rejects.toMatchObject({
      statusCode: 502, code: 'IOC_SERVICE_ERROR',
    });
  });
});
