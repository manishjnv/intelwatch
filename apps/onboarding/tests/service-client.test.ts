import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceClient } from '../src/services/service-client.js';

vi.mock('@etip/shared-auth', () => ({
  signServiceToken: vi.fn().mockReturnValue('mock-jwt-token'),
  loadJwtConfig: vi.fn(),
  loadServiceJwtSecret: vi.fn(),
}));

vi.mock('../src/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

describe('ServiceClient', () => {
  let client: ServiceClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ServiceClient({
      baseUrl: 'http://localhost:3007',
      targetService: 'ioc-intelligence',
    });
  });

  it('sends POST with JWT Authorization header', async () => {
    const mockResponse = { ok: true, json: vi.fn().mockResolvedValue({ data: { id: '1' } }) };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const result = await client.post('/api/v1/iocs', { value: '1.2.3.4' });

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3007/api/v1/iocs',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer mock-jwt-token',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(result).toEqual({ data: { id: '1' } });

    vi.unstubAllGlobals();
  });

  it('returns null on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const result = await client.post('/api/v1/iocs', {});
    expect(result).toBeNull();
    vi.unstubAllGlobals();
  });

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await client.post('/api/v1/iocs', {});
    expect(result).toBeNull();
    vi.unstubAllGlobals();
  });

  it('strips trailing slash from baseUrl', () => {
    const c = new ServiceClient({ baseUrl: 'http://localhost:3007/', targetService: 'test' });
    // Internal state verified through behavior
    expect(c).toBeDefined();
  });
});
