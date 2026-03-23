import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DRPGraphIntegration } from '../src/services/graph-integration.js';

// Mock shared-auth
vi.mock('@etip/shared-auth', () => ({
  signServiceToken: vi.fn().mockReturnValue('mock-service-token'),
}));

describe('DRP Service — #7 Graph Integration', () => {
  let graph: DRPGraphIntegration;

  const sampleAlerts = [
    {
      id: 'alert-1',
      type: 'typosquatting',
      detectedValue: 'evil-example.com',
      assetId: 'asset-1',
      severity: 'high',
      confidence: 0.85,
    },
    {
      id: 'alert-2',
      type: 'credential_leak',
      detectedValue: 'breach-2024',
      assetId: 'asset-2',
      severity: 'critical',
      confidence: 0.95,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    graph = new DRPGraphIntegration({
      graphServiceUrl: 'http://localhost:3012',
      syncEnabled: true,
      maxRetries: 1,
      retryDelayMs: 10,
    });
  });

  // 7.1 returns early when sync is disabled
  it('7.1 returns early when sync is disabled', async () => {
    const disabledGraph = new DRPGraphIntegration({
      graphServiceUrl: 'http://localhost:3012',
      syncEnabled: false,
      maxRetries: 1,
      retryDelayMs: 10,
    });

    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const result = await disabledGraph.pushAlerts('tenant-1', sampleAlerts);
    expect(result.created).toBe(0);
    expect(result.errors).toContain('Graph sync disabled');
    expect(mockFetch).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  // 7.2 returns early for empty alerts array
  it('7.2 returns early for empty alerts array', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const result = await graph.pushAlerts('tenant-1', []);
    expect(result.created).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  // 7.3 calls fetch with correct URL
  it('7.3 calls fetch with correct URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { nodesCreated: 2, relationshipsCreated: 2, nodesFailed: 0, relationshipsFailed: 0, errors: [] } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await graph.pushAlerts('tenant-1', sampleAlerts);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe('http://localhost:3012/api/v1/graph/batch');

    vi.unstubAllGlobals();
  });

  // 7.4 includes service token in headers
  it('7.4 includes service token in headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { nodesCreated: 2, relationshipsCreated: 2, nodesFailed: 0, relationshipsFailed: 0, errors: [] } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await graph.pushAlerts('tenant-1', sampleAlerts);

    const [, options] = mockFetch.mock.calls[0]!;
    expect(options.headers['Authorization']).toBe('Bearer mock-service-token');
    expect(options.headers['X-Service-Token']).toBe('mock-service-token');
    expect(options.headers['Content-Type']).toBe('application/json');

    vi.unstubAllGlobals();
  });

  // 7.5 sends correct node and relationship data
  it('7.5 sends correct node and relationship data', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { nodesCreated: 2, relationshipsCreated: 2, nodesFailed: 0, relationshipsFailed: 0, errors: [] } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await graph.pushAlerts('tenant-1', sampleAlerts);

    const [, options] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(options.body);

    // Verify nodes
    expect(body.nodes).toHaveLength(2);
    expect(body.nodes[0].id).toBe('alert-1');
    expect(body.nodes[0].type).toBe('drp_alert');
    expect(body.nodes[0].label).toBe('evil-example.com');
    expect(body.nodes[0].properties.alertType).toBe('typosquatting');
    expect(body.nodes[0].properties.severity).toBe('high');
    expect(body.nodes[0].properties.confidence).toBe(0.85);
    expect(body.nodes[0].properties.tenantId).toBe('tenant-1');

    // Verify relationships
    expect(body.relationships).toHaveLength(2);
    expect(body.relationships[0].fromNodeId).toBe('alert-1');
    expect(body.relationships[0].toNodeId).toBe('asset-1');
    expect(body.relationships[0].type).toBe('TARGETS');
    expect(body.relationships[0].confidence).toBe(0.85);
    expect(body.relationships[0].source).toBe('drp-service');

    vi.unstubAllGlobals();
  });

  // 7.6 returns created count on success
  it('7.6 returns created count on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          nodesCreated: 3,
          relationshipsCreated: 3,
          nodesFailed: 0,
          relationshipsFailed: 0,
          errors: [],
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await graph.pushAlerts('tenant-1', sampleAlerts);
    expect(result.created).toBe(6); // 3 nodes + 3 relationships
    expect(result.failed).toBe(0);
    expect(result.errors).toHaveLength(0);

    vi.unstubAllGlobals();
  });

  // 7.7 handles non-ok response gracefully
  it('7.7 handles non-ok response gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await graph.pushAlerts('tenant-1', sampleAlerts);
    expect(result.created).toBe(0);
    expect(result.failed).toBe(2); // number of alerts
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('500');

    vi.unstubAllGlobals();
  });

  // 7.8 retries on failure
  it('7.8 retries on failure', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 503,
          text: () => Promise.resolve('Service Unavailable'),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          data: { nodesCreated: 2, relationshipsCreated: 2, nodesFailed: 0, relationshipsFailed: 0, errors: [] },
        }),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await graph.pushAlerts('tenant-1', sampleAlerts);
    // With maxRetries=1, it attempts original + 1 retry = 2 calls
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.created).toBe(4);
    expect(result.failed).toBe(0);

    vi.unstubAllGlobals();
  });

  // 7.9 returns error on all retries exhausted
  it('7.9 returns error on all retries exhausted', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: () => Promise.resolve('Service Unavailable'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await graph.pushAlerts('tenant-1', sampleAlerts);
    // original + 1 retry = 2 calls, all fail
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.created).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('503');

    vi.unstubAllGlobals();
  });

  // 7.10 handles fetch exception gracefully
  it('7.10 handles fetch exception gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error: ECONNREFUSED'));
    vi.stubGlobal('fetch', mockFetch);

    const result = await graph.pushAlerts('tenant-1', sampleAlerts);
    expect(result.created).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('ECONNREFUSED');

    vi.unstubAllGlobals();
  });
});
