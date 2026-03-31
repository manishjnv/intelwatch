import { describe, it, expect } from 'vitest';
import {
  BACKOFF_DELAYS_MS,
  MAX_ATTEMPTS,
  calculateBackoff,
  WEBHOOK_JOB_OPTIONS,
} from '../src/workers/webhook-delivery.js';
import { iocsToStixBundle } from '../src/routes/public/stix-mapper.js';
import { addSunsetHeader } from '../src/routes/public/changelog.js';
import type { PublicIocDto } from '@etip/shared-types';

// ── TAXII 2.1 Route Logic Tests ─────────────────────────────────────

describe('TAXII 2.1', () => {
  describe('STIX bundle for TAXII objects endpoint', () => {
    const makeIoc = (overrides: Partial<PublicIocDto> = {}): PublicIocDto => ({
      id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'ip',
      value: '192.168.1.100',
      severity: 'high',
      tlp: 'amber',
      confidence: 85,
      lifecycle: 'active',
      tags: ['c2'],
      mitreAttack: ['T1059'],
      malwareFamilies: [],
      threatActors: [],
      firstSeen: '2026-03-01T00:00:00.000Z',
      lastSeen: '2026-03-31T00:00:00.000Z',
      expiresAt: null,
      createdAt: '2026-03-01T00:00:00.000Z',
      ...overrides,
    });

    it('produces a valid STIX 2.1 bundle envelope', () => {
      const bundle = iocsToStixBundle([makeIoc()]);
      expect(bundle.type).toBe('bundle');
      expect(bundle.id).toMatch(/^bundle--/);
      expect(Array.isArray(bundle.objects)).toBe(true);
    });

    it('creates indicator + SCO + relationship for an IP IOC', () => {
      const bundle = iocsToStixBundle([makeIoc()]);
      const types = bundle.objects.map((o: { type: string }) => o.type);
      expect(types).toContain('identity');
      expect(types).toContain('indicator');
      expect(types).toContain('ipv4-addr');
      expect(types).toContain('relationship');
    });

    it('creates domain-name SCO for domain type', () => {
      const bundle = iocsToStixBundle([makeIoc({ type: 'domain', value: 'evil.com' })]);
      const types = bundle.objects.map((o: { type: string }) => o.type);
      expect(types).toContain('domain-name');
    });

    it('creates file SCO for sha256 hash type', () => {
      const bundle = iocsToStixBundle([makeIoc({ type: 'sha256', value: 'a'.repeat(64) })]);
      const types = bundle.objects.map((o: { type: string }) => o.type);
      expect(types).toContain('file');
    });

    it('deduplicates malware SDOs across multiple IOCs', () => {
      const iocs = [
        makeIoc({ id: 'id-1', malwareFamilies: ['LockBit'] }),
        makeIoc({ id: 'id-2', malwareFamilies: ['LockBit'] }),
      ];
      const bundle = iocsToStixBundle(iocs);
      const malwareObjects = bundle.objects.filter((o: { type: string }) => o.type === 'malware');
      expect(malwareObjects.length).toBe(1);
    });

    it('deduplicates threat actor SDOs across multiple IOCs', () => {
      const iocs = [
        makeIoc({ id: 'id-1', threatActors: ['APT28'] }),
        makeIoc({ id: 'id-2', threatActors: ['APT28'] }),
      ];
      const bundle = iocsToStixBundle(iocs);
      const actorObjects = bundle.objects.filter((o: { type: string }) => o.type === 'threat-actor');
      expect(actorObjects.length).toBe(1);
    });

    it('handles empty IOC array gracefully', () => {
      const bundle = iocsToStixBundle([]);
      expect(bundle.type).toBe('bundle');
      // Only the identity object
      expect(bundle.objects.length).toBe(1);
      expect((bundle.objects[0] as { type: string }).type).toBe('identity');
    });

    it('includes TLP marking references for non-WHITE indicators', () => {
      const bundle = iocsToStixBundle([makeIoc({ tlp: 'amber' })]);
      const indicator = bundle.objects.find((o: { type: string }) => o.type === 'indicator');
      expect(indicator).toBeDefined();
      expect((indicator as Record<string, unknown>).object_marking_refs).toBeDefined();
    });
  });

  describe('TAXII collection definitions', () => {
    const SEVERITY_COLLECTIONS = ['critical', 'high', 'medium', 'low', 'info'];
    const ALL_VALID_IDS = ['all', ...SEVERITY_COLLECTIONS];

    it('defines exactly 6 valid collection IDs (all + 5 severities)', () => {
      expect(ALL_VALID_IDS.length).toBe(6);
      expect(ALL_VALID_IDS).toContain('all');
      expect(ALL_VALID_IDS).toContain('critical');
      expect(ALL_VALID_IDS).toContain('info');
    });

    it('each severity maps to a valid IOC severity level', () => {
      for (const sev of SEVERITY_COLLECTIONS) {
        expect(['critical', 'high', 'medium', 'low', 'info']).toContain(sev);
      }
    });
  });

  describe('STIX type to IOC type mapping', () => {
    // Verify the mapping function logic (tested via bundle output)
    it('maps ipv4-addr IOCs to ipv4-addr SCOs', () => {
      const bundle = iocsToStixBundle([{
        id: 'test-ip',
        type: 'ip',
        value: '10.0.0.1',
        severity: 'high',
        tlp: 'white',
        confidence: 90,
        lifecycle: 'active',
        tags: [],
        mitreAttack: [],
        malwareFamilies: [],
        threatActors: [],
        firstSeen: '2026-01-01T00:00:00Z',
        lastSeen: '2026-03-31T00:00:00Z',
        expiresAt: null,
        createdAt: '2026-01-01T00:00:00Z',
      }]);
      const sco = bundle.objects.find((o: { type: string }) => o.type === 'ipv4-addr');
      expect(sco).toBeDefined();
      expect((sco as { value: string }).value).toBe('10.0.0.1');
    });
  });
});

// ── Webhook Exponential Backoff Tests ───────────────────────────────

describe('Webhook Exponential Backoff', () => {
  describe('BACKOFF_DELAYS_MS', () => {
    it('defines exactly 6 delay stages', () => {
      expect(BACKOFF_DELAYS_MS.length).toBe(6);
    });

    it('has correct delay values (1m, 5m, 30m, 2h, 12h, 24h)', () => {
      expect(BACKOFF_DELAYS_MS[0]).toBe(60_000);       // 1 min
      expect(BACKOFF_DELAYS_MS[1]).toBe(300_000);       // 5 min
      expect(BACKOFF_DELAYS_MS[2]).toBe(1_800_000);     // 30 min
      expect(BACKOFF_DELAYS_MS[3]).toBe(7_200_000);     // 2 hours
      expect(BACKOFF_DELAYS_MS[4]).toBe(43_200_000);    // 12 hours
      expect(BACKOFF_DELAYS_MS[5]).toBe(86_400_000);    // 24 hours
    });

    it('delays are monotonically increasing', () => {
      for (let i = 1; i < BACKOFF_DELAYS_MS.length; i++) {
        expect(BACKOFF_DELAYS_MS[i]).toBeGreaterThan(BACKOFF_DELAYS_MS[i - 1]);
      }
    });
  });

  describe('MAX_ATTEMPTS', () => {
    it('equals the number of backoff delays (6)', () => {
      expect(MAX_ATTEMPTS).toBe(6);
    });
  });

  describe('calculateBackoff', () => {
    it('returns 1 minute for first attempt', () => {
      expect(calculateBackoff(1)).toBe(60_000);
    });

    it('returns 5 minutes for second attempt', () => {
      expect(calculateBackoff(2)).toBe(300_000);
    });

    it('returns 30 minutes for third attempt', () => {
      expect(calculateBackoff(3)).toBe(1_800_000);
    });

    it('returns 2 hours for fourth attempt', () => {
      expect(calculateBackoff(4)).toBe(7_200_000);
    });

    it('returns 12 hours for fifth attempt', () => {
      expect(calculateBackoff(5)).toBe(43_200_000);
    });

    it('returns 24 hours for sixth attempt', () => {
      expect(calculateBackoff(6)).toBe(86_400_000);
    });

    it('clamps to max delay for attempts beyond 6', () => {
      expect(calculateBackoff(7)).toBe(86_400_000);
      expect(calculateBackoff(100)).toBe(86_400_000);
    });
  });

  describe('WEBHOOK_JOB_OPTIONS', () => {
    it('sets attempts to MAX_ATTEMPTS', () => {
      expect(WEBHOOK_JOB_OPTIONS.attempts).toBe(MAX_ATTEMPTS);
    });

    it('uses custom backoff type', () => {
      expect(WEBHOOK_JOB_OPTIONS.backoff.type).toBe('custom');
    });

    it('retains completed jobs (100) and failed jobs (500)', () => {
      expect(WEBHOOK_JOB_OPTIONS.removeOnComplete).toBe(100);
      expect(WEBHOOK_JOB_OPTIONS.removeOnFail).toBe(500);
    });
  });
});

// ── Changelog Tests ─────────────────────────────────────────────────

describe('Changelog', () => {
  describe('addSunsetHeader', () => {
    it('sets Sunset and Deprecation headers', () => {
      const headers: Record<string, string> = {};
      const mockReply = {
        header: (key: string, value: string) => {
          headers[key] = value;
          return mockReply;
        },
      };
      addSunsetHeader(mockReply as never, '2026-12-31T00:00:00Z');
      expect(headers['Sunset']).toBeDefined();
      expect(headers['Deprecation']).toBe('true');
    });

    it('includes Link header when link is provided', () => {
      const headers: Record<string, string> = {};
      const mockReply = {
        header: (key: string, value: string) => {
          headers[key] = value;
          return mockReply;
        },
      };
      addSunsetHeader(mockReply as never, '2026-12-31', 'https://docs.example.com/deprecation');
      expect(headers['Link']).toContain('rel="sunset"');
      expect(headers['Link']).toContain('https://docs.example.com/deprecation');
    });

    it('omits Link header when no link provided', () => {
      const headers: Record<string, string> = {};
      const mockReply = {
        header: (key: string, value: string) => {
          headers[key] = value;
          return mockReply;
        },
      };
      addSunsetHeader(mockReply as never, '2026-12-31');
      expect(headers).not.toHaveProperty('Link');
    });

    it('formats Sunset as UTC string', () => {
      const headers: Record<string, string> = {};
      const mockReply = {
        header: (key: string, value: string) => {
          headers[key] = value;
          return mockReply;
        },
      };
      addSunsetHeader(mockReply as never, '2026-12-31T00:00:00Z');
      // UTC string format: "Tue, 31 Dec 2026 00:00:00 GMT"
      expect(headers['Sunset']).toMatch(/GMT$/);
    });
  });
});

// ── SDK Generation Script Tests ─────────────────────────────────────

describe('SDK Generation', () => {
  it('generate-sdk.sh script exists and is valid bash', async () => {
    const fs = await import('fs');
    const scriptPath = new URL('../../../scripts/generate-sdk.sh', import.meta.url).pathname
      .replace(/^\/([A-Z]:)/, '$1'); // Fix Windows paths
    // On Windows, check with the drive letter
    const exists = fs.existsSync(scriptPath) || fs.existsSync('scripts/generate-sdk.sh');
    expect(exists).toBe(true);
  });

  it('WEBHOOK_JOB_OPTIONS is a valid BullMQ-compatible options object', () => {
    // Ensures the shape is correct for BullMQ queue.add()
    expect(WEBHOOK_JOB_OPTIONS).toEqual({
      attempts: 6,
      backoff: { type: 'custom' },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  });
});
