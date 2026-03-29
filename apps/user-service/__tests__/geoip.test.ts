/**
 * @module geoip.test
 * @description Tests for GeoIP lookup and session geo enrichment (I-16).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockCity = vi.fn();
const mockOpen = vi.fn().mockResolvedValue({ city: mockCity });

vi.mock('maxmind', () => ({ default: { open: mockOpen } }));

vi.mock('../src/prisma.js', () => ({
  prisma: {
    session: {
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'audit-1', ...args.data, createdAt: new Date() })),
      },
    })),
  },
}));

describe('lookupIP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TI_GEOIP_DB_PATH = '/fake/GeoLite2-City.mmdb';
  });

  afterEach(async () => {
    const { clearGeoCache } = await import('../src/geoip.js');
    clearGeoCache();
  });

  it('returns null geo for private IPs', async () => {
    const { lookupIP } = await import('../src/geoip.js');
    for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.1.1']) {
      const result = await lookupIP(ip);
      expect(result.geoCountry).toBeNull();
      expect(result.geoCity).toBeNull();
    }
  });

  it('returns null geo for empty IP', async () => {
    const { lookupIP } = await import('../src/geoip.js');
    const result = await lookupIP('');
    expect(result.geoCountry).toBeNull();
  });

  it('returns geo data for public IP', async () => {
    mockCity.mockReturnValueOnce({
      country: { isoCode: 'IN' },
      city: { names: { en: 'Mumbai' } },
      traits: { isp: 'Reliance Jio' },
    });

    const { lookupIP } = await import('../src/geoip.js');
    const result = await lookupIP('203.0.113.1');
    expect(result.geoCountry).toBe('IN');
    expect(result.geoCity).toBe('Mumbai');
    expect(result.geoIsp).toBe('Reliance Jio');
  });

  it('uses cache on second call', async () => {
    mockCity.mockReturnValueOnce({
      country: { isoCode: 'US' },
      city: { names: { en: 'NYC' } },
      traits: { isp: 'Comcast' },
    });

    const { lookupIP } = await import('../src/geoip.js');
    await lookupIP('8.8.8.8');
    await lookupIP('8.8.8.8');
    // mockCity should only be called once (second call hits cache)
    expect(mockCity).toHaveBeenCalledTimes(1);
  });

  it('handles reader error gracefully', async () => {
    mockCity.mockImplementationOnce(() => { throw new Error('bad IP'); });

    const { lookupIP } = await import('../src/geoip.js');
    const result = await lookupIP('999.999.999.999');
    expect(result.geoCountry).toBeNull();
  });
});

describe('enrichSessionGeo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TI_GEOIP_DB_PATH = '/fake/GeoLite2-City.mmdb';
  });

  afterEach(async () => {
    const { clearGeoCache } = await import('../src/geoip.js');
    clearGeoCache();
  });

  it('updates session with geo data', async () => {
    mockCity.mockReturnValueOnce({
      country: { isoCode: 'IN' },
      city: { names: { en: 'Delhi' } },
      traits: { isp: 'Airtel' },
    });

    const { prisma } = await import('../src/prisma.js');
    const { enrichSessionGeo } = await import('../src/geoip.js');
    await enrichSessionGeo('sess-1', 'user-1', 'tenant-1', '203.0.113.5');

    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { geoCountry: 'IN', geoCity: 'Delhi', geoIsp: 'Airtel' },
    });
  });

  it('skips enrichment for null IP', async () => {
    const { prisma } = await import('../src/prisma.js');
    const { enrichSessionGeo } = await import('../src/geoip.js');
    await enrichSessionGeo('sess-1', 'user-1', 'tenant-1', null);
    expect(prisma.session.update).not.toHaveBeenCalled();
  });

  it('creates audit log for suspicious country change', async () => {
    mockCity.mockReturnValueOnce({
      country: { isoCode: 'US' },
      city: { names: { en: 'NYC' } },
      traits: { isp: 'Comcast' },
    });

    const { prisma } = await import('../src/prisma.js');
    (prisma.session.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'prev-sess', geoCountry: 'IN', geoCity: 'Mumbai',
    });

    const { enrichSessionGeo } = await import('../src/geoip.js');
    await enrichSessionGeo('sess-2', 'user-1', 'tenant-1', '8.8.8.8');

    // Should create suspicious geo audit log (via $transaction)
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('no audit log when country is same', async () => {
    mockCity.mockReturnValueOnce({
      country: { isoCode: 'IN' },
      city: { names: { en: 'Delhi' } },
      traits: {},
    });

    const { prisma } = await import('../src/prisma.js');
    (prisma.session.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'prev-sess', geoCountry: 'IN', geoCity: 'Mumbai',
    });

    const { enrichSessionGeo } = await import('../src/geoip.js');
    // Reset $transaction call count
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockClear();
    await enrichSessionGeo('sess-3', 'user-1', 'tenant-1', '203.0.113.10');

    // $transaction should NOT be called (no suspicious login)
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('no suspicious check when no previous session', async () => {
    mockCity.mockReturnValueOnce({
      country: { isoCode: 'US' },
      city: { names: { en: 'LA' } },
      traits: {},
    });

    const { prisma } = await import('../src/prisma.js');
    (prisma.session.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const { enrichSessionGeo } = await import('../src/geoip.js');
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockClear();
    await enrichSessionGeo('sess-4', 'user-1', 'tenant-1', '1.1.1.1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('no suspicious check when previous session has no country', async () => {
    mockCity.mockReturnValueOnce({
      country: { isoCode: 'JP' },
      city: { names: { en: 'Tokyo' } },
      traits: {},
    });

    const { prisma } = await import('../src/prisma.js');
    (prisma.session.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'prev-sess', geoCountry: null, geoCity: null,
    });

    const { enrichSessionGeo } = await import('../src/geoip.js');
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockClear();
    await enrichSessionGeo('sess-5', 'user-1', 'tenant-1', '203.0.113.20');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
