/**
 * @module @etip/shared-utils/tests/helpers
 * @description Tests for date helpers, hash, IP validation, STIX ID, and sleep.
 */
import { describe, it, expect } from 'vitest';
import {
  formatDate,
  parseDate,
  getDateKey,
  subDays,
  addDays,
  daysBetween,
  isOlderThan,
  nowISO,
  sha256,
  md5,
  buildDedupeKey,
  isPrivateIP,
  isValidIPv4,
  isValidIPv6,
  isValidIP,
  classifyIP,
  generateStixId,
  isValidStixId,
  extractStixType,
  sleep,
  retryWithBackoff,
} from '../src/index.js';

// ── Date Helpers Tests ─────────────────────────────────────────────

describe('formatDate', () => {
  it('formats Date object to ISO string', () => {
    const date = new Date('2024-06-15T12:00:00.000Z');
    expect(formatDate(date)).toBe('2024-06-15T12:00:00.000Z');
  });

  it('passes through valid ISO string', () => {
    const iso = '2024-06-15T12:00:00.000Z';
    expect(formatDate(iso)).toBe(iso);
  });

  it('converts Unix timestamp in seconds', () => {
    const result = formatDate(1718452800);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('converts Unix timestamp in milliseconds', () => {
    const result = formatDate(1718452800000);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('throws on invalid date string', () => {
    expect(() => formatDate('not-a-date')).toThrow('Invalid date string');
  });
});

describe('parseDate', () => {
  it('parses ISO string', () => {
    const date = parseDate('2024-06-15T12:00:00.000Z');
    expect(date).toBeInstanceOf(Date);
    expect(date.getFullYear()).toBe(2024);
  });

  it('parses Unix seconds', () => {
    const date = parseDate(1718452800);
    expect(date).toBeInstanceOf(Date);
  });

  it('throws on unparseable string', () => {
    expect(() => parseDate('garbage')).toThrow('Cannot parse date');
  });
});

describe('getDateKey', () => {
  it('returns YYYY-MM-DD format', () => {
    const key = getDateKey(new Date('2024-06-15T12:00:00.000Z'));
    expect(key).toBe('2024-06-15');
  });

  it('defaults to today', () => {
    const key = getDateKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('subDays', () => {
  it('subtracts days correctly', () => {
    const base = new Date('2024-06-15T12:00:00.000Z');
    const result = subDays(10, base);
    expect(result.toISOString()).toContain('2024-06-05');
  });

  it('does not mutate the original date', () => {
    const base = new Date('2024-06-15T12:00:00.000Z');
    subDays(5, base);
    expect(base.toISOString()).toContain('2024-06-15');
  });
});

describe('addDays', () => {
  it('adds days correctly', () => {
    const base = new Date('2024-06-15T12:00:00.000Z');
    const result = addDays(5, base);
    expect(result.toISOString()).toContain('2024-06-20');
  });
});

describe('daysBetween', () => {
  it('calculates positive difference', () => {
    const days = daysBetween('2024-06-01', '2024-06-11');
    expect(days).toBe(10);
  });

  it('accepts Date objects', () => {
    const a = new Date('2024-01-01');
    const b = new Date('2024-01-31');
    expect(daysBetween(a, b)).toBe(30);
  });
});

describe('isOlderThan', () => {
  it('returns true for old dates', () => {
    const old = new Date('2020-01-01');
    expect(isOlderThan(old, 30)).toBe(true);
  });

  it('returns false for recent dates', () => {
    expect(isOlderThan(new Date(), 30)).toBe(false);
  });
});

describe('nowISO', () => {
  it('returns ISO 8601 string', () => {
    expect(nowISO()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

// ── Hash Tests ─────────────────────────────────────────────────────

describe('sha256', () => {
  it('returns 64-char hex string', () => {
    const hash = sha256('hello');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('is deterministic', () => {
    expect(sha256('test')).toBe(sha256('test'));
  });

  it('produces different hashes for different inputs', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});

describe('md5', () => {
  it('returns 32-char hex string', () => {
    const hash = md5('hello');
    expect(hash).toHaveLength(32);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });
});

describe('buildDedupeKey', () => {
  it('produces consistent hash for same inputs', () => {
    const key1 = buildDedupeKey('ip', '192.168.1.1', 'tenant-1');
    const key2 = buildDedupeKey('ip', '192.168.1.1', 'tenant-1');
    expect(key1).toBe(key2);
    expect(key1).toHaveLength(64);
  });

  it('produces different hash for different tenants', () => {
    const key1 = buildDedupeKey('ip', '8.8.8.8', 'tenant-1');
    const key2 = buildDedupeKey('ip', '8.8.8.8', 'tenant-2');
    expect(key1).not.toBe(key2);
  });

  it('produces different hash for different types', () => {
    const key1 = buildDedupeKey('ip', '8.8.8.8', 'tenant-1');
    const key2 = buildDedupeKey('domain', '8.8.8.8', 'tenant-1');
    expect(key1).not.toBe(key2);
  });
});

// ── IP Validation Tests ────────────────────────────────────────────

describe('isPrivateIP', () => {
  it('identifies RFC 1918 addresses', () => {
    expect(isPrivateIP('10.0.0.1')).toBe(true);
    expect(isPrivateIP('10.255.255.255')).toBe(true);
    expect(isPrivateIP('172.16.0.1')).toBe(true);
    expect(isPrivateIP('172.31.255.255')).toBe(true);
    expect(isPrivateIP('192.168.0.1')).toBe(true);
    expect(isPrivateIP('192.168.255.255')).toBe(true);
  });

  it('identifies loopback', () => {
    expect(isPrivateIP('127.0.0.1')).toBe(true);
    expect(isPrivateIP('127.255.255.255')).toBe(true);
  });

  it('identifies link-local', () => {
    expect(isPrivateIP('169.254.1.1')).toBe(true);
  });

  it('identifies multicast', () => {
    expect(isPrivateIP('224.0.0.1')).toBe(true);
    expect(isPrivateIP('255.255.255.255')).toBe(true);
  });

  it('rejects public IPs', () => {
    expect(isPrivateIP('8.8.8.8')).toBe(false);
    expect(isPrivateIP('1.1.1.1')).toBe(false);
    expect(isPrivateIP('203.0.113.1')).toBe(false);
  });

  it('returns false for invalid strings', () => {
    expect(isPrivateIP('not-an-ip')).toBe(false);
    expect(isPrivateIP('999.999.999.999')).toBe(false);
    expect(isPrivateIP('')).toBe(false);
  });

  it('identifies 172.15.x as public (below /12 range)', () => {
    expect(isPrivateIP('172.15.0.1')).toBe(false);
  });

  it('identifies 172.32.x as public (above /12 range)', () => {
    expect(isPrivateIP('172.32.0.1')).toBe(false);
  });
});

describe('isValidIPv4', () => {
  it('validates correct IPs', () => {
    expect(isValidIPv4('0.0.0.0')).toBe(true);
    expect(isValidIPv4('255.255.255.255')).toBe(true);
    expect(isValidIPv4('192.168.1.1')).toBe(true);
  });

  it('rejects out-of-range octets', () => {
    expect(isValidIPv4('256.0.0.0')).toBe(false);
    expect(isValidIPv4('1.2.3.999')).toBe(false);
  });

  it('rejects malformed strings', () => {
    expect(isValidIPv4('1.2.3')).toBe(false);
    expect(isValidIPv4('1.2.3.4.5')).toBe(false);
    expect(isValidIPv4('abc.def.ghi.jkl')).toBe(false);
  });
});

describe('isValidIPv6', () => {
  it('validates correct IPv6', () => {
    expect(isValidIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
    expect(isValidIPv6('::1')).toBe(true);
    expect(isValidIPv6('fe80::1')).toBe(true);
  });

  it('rejects non-IPv6 strings', () => {
    expect(isValidIPv6('192.168.1.1')).toBe(false);
    expect(isValidIPv6('hello')).toBe(false);
  });
});

describe('isValidIP', () => {
  it('accepts both IPv4 and IPv6', () => {
    expect(isValidIP('8.8.8.8')).toBe(true);
    expect(isValidIP('::1')).toBe(true);
  });
});

describe('classifyIP', () => {
  it('classifies public IPs', () => {
    expect(classifyIP('8.8.8.8')).toBe('public');
  });

  it('classifies private IPs', () => {
    expect(classifyIP('192.168.1.1')).toBe('private');
  });

  it('classifies invalid strings', () => {
    expect(classifyIP('not-ip')).toBe('invalid');
  });
});

// ── STIX ID Tests ──────────────────────────────────────────────────

describe('generateStixId', () => {
  it('produces valid STIX ID format', () => {
    const id = generateStixId('indicator');
    expect(id).toMatch(/^indicator--[0-9a-f-]{36}$/);
  });

  it('produces unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateStixId('malware')));
    expect(ids.size).toBe(100);
  });
});

describe('isValidStixId', () => {
  it('validates correct STIX IDs', () => {
    expect(isValidStixId('indicator--550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidStixId('threat-actor--550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects invalid formats', () => {
    expect(isValidStixId('bad-id')).toBe(false);
    expect(isValidStixId('indicator-550e8400')).toBe(false);
    expect(isValidStixId('')).toBe(false);
  });
});

describe('extractStixType', () => {
  it('extracts type from valid ID', () => {
    expect(extractStixType('indicator--550e8400-e29b-41d4-a716-446655440000')).toBe('indicator');
    expect(extractStixType('threat-actor--abcdef12-1234-5678-9abc-def012345678')).toBe('threat-actor');
  });

  it('returns null for invalid ID', () => {
    expect(extractStixType('invalid')).toBeNull();
  });
});

// ── Sleep Tests ────────────────────────────────────────────────────

describe('sleep', () => {
  it('resolves after delay', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });
});

describe('retryWithBackoff', () => {
  it('returns on first success', async () => {
    let calls = 0;
    const result = await retryWithBackoff(async () => {
      calls++;
      return 'ok';
    }, 3, 10);
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries on failure then succeeds', async () => {
    let calls = 0;
    const result = await retryWithBackoff(async () => {
      calls++;
      if (calls < 3) throw new Error('fail');
      return 'ok';
    }, 3, 10);
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('throws after all retries exhausted', async () => {
    await expect(
      retryWithBackoff(async () => { throw new Error('always fail'); }, 2, 10)
    ).rejects.toThrow('always fail');
  });
});
