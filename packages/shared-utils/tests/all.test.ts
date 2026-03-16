import { describe, it, expect } from 'vitest';
import {
  QUEUES, ALL_QUEUE_NAMES, EVENTS, ALL_EVENT_TYPES,
  AppError, Errors,
  formatDate, parseDate, getDateKey, subDays, addDays, daysBetween, isOlderThan, nowISO,
  sha256, md5, buildDedupeKey,
  isPrivateIP, isValidIPv4, isValidIPv6, isValidIP, classifyIP,
  generateStixId, isValidStixId, extractStixType,
  sleep, retryWithBackoff,
} from '../src/index.js';

describe('QUEUES', () => {
  it('has 12 queues', () => { expect(Object.keys(QUEUES)).toHaveLength(12); });
  it('all start with etip:', () => { for (const n of Object.values(QUEUES)) expect(n).toMatch(/^etip:/); });
  it('ALL_QUEUE_NAMES matches', () => { expect(ALL_QUEUE_NAMES).toHaveLength(12); });
  it('unique', () => { expect(new Set(Object.values(QUEUES)).size).toBe(12); });
});

describe('EVENTS', () => {
  it('has 18 events', () => { expect(Object.keys(EVENTS)).toHaveLength(18); });
  it('dot notation', () => { for (const e of Object.values(EVENTS)) expect(e).toMatch(/^[a-z]+\.[a-z]+/); });
  it('unique', () => { expect(new Set(Object.values(EVENTS)).size).toBe(18); });
});

describe('AppError', () => {
  it('creates with all props', () => {
    const e = new AppError(404, 'Not found', 'NF', { id: '1' });
    expect(e.statusCode).toBe(404); expect(e.code).toBe('NF'); expect(e.details).toEqual({ id: '1' });
    expect(e.name).toBe('AppError'); expect(e).toBeInstanceOf(Error);
  });
  it('defaults code', () => { expect(new AppError(500, 'x').code).toBe('INTERNAL_ERROR'); });
  it('toJSON', () => {
    const j = new AppError(422, 'Bad', 'V', { f: 'x' }).toJSON();
    expect(j.error.code).toBe('V'); expect(j.error.details).toEqual({ f: 'x' });
  });
  it('toJSON omits undef details', () => { expect(new AppError(500, 'x').toJSON().error).not.toHaveProperty('details'); });
  it('isAppError', () => { expect(AppError.isAppError(new AppError(400, 'x'))).toBe(true); expect(AppError.isAppError(new Error('x'))).toBe(false); });
});

describe('Errors factory', () => {
  it('notFound', () => { const e = Errors.notFound('IOC', '1'); expect(e.statusCode).toBe(404); expect(e.message).toBe('IOC 1 not found'); });
  it('unauthorized', () => { expect(Errors.unauthorized().statusCode).toBe(401); });
  it('forbidden', () => { expect(Errors.forbidden().statusCode).toBe(403); });
  it('validation', () => { expect(Errors.validation('bad', { f: 1 }).details).toEqual({ f: 1 }); });
  it('conflict', () => { expect(Errors.conflict('dup').statusCode).toBe(409); });
  it('rateLimit', () => { expect(Errors.rateLimit(60).details).toEqual({ retryAfter: 60 }); });
  it('serviceUnavailable', () => { expect(Errors.serviceUnavailable('Redis').message).toContain('Redis'); });
  it('invalidStateTransition', () => { expect(Errors.invalidStateTransition('A', 'B').code).toBe('INVALID_STATE_TRANSITION'); });
});

describe('Date helpers', () => {
  it('formatDate Date', () => { expect(formatDate(new Date('2024-06-15T12:00:00Z'))).toBe('2024-06-15T12:00:00.000Z'); });
  it('formatDate string', () => { expect(formatDate('2024-06-15T12:00:00Z')).toMatch(/2024-06-15/); });
  it('formatDate unix sec', () => { expect(formatDate(1718452800)).toMatch(/^\d{4}/); });
  it('formatDate throws on bad', () => { expect(() => formatDate('nope')).toThrow(); });
  it('parseDate string', () => { expect(parseDate('2024-06-15T12:00:00Z').getFullYear()).toBe(2024); });
  it('parseDate throws', () => { expect(() => parseDate('garbage')).toThrow(); });
  it('getDateKey', () => { expect(getDateKey(new Date('2024-06-15T12:00:00Z'))).toBe('2024-06-15'); });
  it('subDays', () => { expect(subDays(10, new Date('2024-06-15T12:00:00Z')).toISOString()).toContain('2024-06-05'); });
  it('addDays', () => { expect(addDays(5, new Date('2024-06-15T12:00:00Z')).toISOString()).toContain('2024-06-20'); });
  it('daysBetween', () => { expect(daysBetween('2024-06-01', '2024-06-11')).toBe(10); });
  it('isOlderThan true', () => { expect(isOlderThan(new Date('2020-01-01'), 30)).toBe(true); });
  it('isOlderThan false', () => { expect(isOlderThan(new Date(), 30)).toBe(false); });
  it('nowISO format', () => { expect(nowISO()).toMatch(/^\d{4}-\d{2}-\d{2}T/); });
});

describe('Hash', () => {
  it('sha256 length', () => { expect(sha256('hello')).toHaveLength(64); });
  it('sha256 deterministic', () => { expect(sha256('x')).toBe(sha256('x')); });
  it('sha256 differs', () => { expect(sha256('a')).not.toBe(sha256('b')); });
  it('md5 length', () => { expect(md5('hello')).toHaveLength(32); });
  it('buildDedupeKey consistent', () => { expect(buildDedupeKey('ip', '1.1.1.1', 't1')).toBe(buildDedupeKey('ip', '1.1.1.1', 't1')); });
  it('buildDedupeKey tenant isolation', () => { expect(buildDedupeKey('ip', '1.1', 't1')).not.toBe(buildDedupeKey('ip', '1.1', 't2')); });
});

describe('IP validation', () => {
  it('private RFC1918', () => { expect(isPrivateIP('10.0.0.1')).toBe(true); expect(isPrivateIP('172.16.0.1')).toBe(true); expect(isPrivateIP('192.168.0.1')).toBe(true); });
  it('loopback', () => { expect(isPrivateIP('127.0.0.1')).toBe(true); });
  it('link-local', () => { expect(isPrivateIP('169.254.1.1')).toBe(true); });
  it('multicast', () => { expect(isPrivateIP('224.0.0.1')).toBe(true); });
  it('public', () => { expect(isPrivateIP('8.8.8.8')).toBe(false); expect(isPrivateIP('1.1.1.1')).toBe(false); });
  it('invalid', () => { expect(isPrivateIP('nope')).toBe(false); });
  it('172.15 public', () => { expect(isPrivateIP('172.15.0.1')).toBe(false); });
  it('isValidIPv4', () => { expect(isValidIPv4('192.168.1.1')).toBe(true); expect(isValidIPv4('256.0.0.0')).toBe(false); expect(isValidIPv4('1.2.3')).toBe(false); });
  it('isValidIPv6', () => { expect(isValidIPv6('::1')).toBe(true); expect(isValidIPv6('192.168.1.1')).toBe(false); });
  it('isValidIP both', () => { expect(isValidIP('8.8.8.8')).toBe(true); expect(isValidIP('::1')).toBe(true); });
  it('classifyIP', () => { expect(classifyIP('8.8.8.8')).toBe('public'); expect(classifyIP('192.168.1.1')).toBe('private'); expect(classifyIP('nope')).toBe('invalid'); });
});

describe('STIX ID', () => {
  it('generateStixId format', () => { expect(generateStixId('indicator')).toMatch(/^indicator--[0-9a-f-]{36}$/); });
  it('unique', () => { const ids = new Set(Array.from({ length: 50 }, () => generateStixId('m'))); expect(ids.size).toBe(50); });
  it('isValidStixId', () => { expect(isValidStixId('indicator--550e8400-e29b-41d4-a716-446655440000')).toBe(true); expect(isValidStixId('bad')).toBe(false); });
  it('extractStixType', () => { expect(extractStixType('indicator--550e8400-e29b-41d4-a716-446655440000')).toBe('indicator'); expect(extractStixType('bad')).toBeNull(); });
});

describe('sleep', () => {
  it('resolves after delay', async () => { const s = Date.now(); await sleep(30); expect(Date.now() - s).toBeGreaterThanOrEqual(20); });
});

describe('retryWithBackoff', () => {
  it('first success', async () => { let c = 0; const r = await retryWithBackoff(async () => { c++; return 'ok'; }, 3, 10); expect(r).toBe('ok'); expect(c).toBe(1); });
  it('retry then succeed', async () => { let c = 0; const r = await retryWithBackoff(async () => { c++; if (c < 3) throw new Error('f'); return 'ok'; }, 3, 10); expect(r).toBe('ok'); expect(c).toBe(3); });
  it('throws after exhaustion', async () => { await expect(retryWithBackoff(async () => { throw new Error('fail'); }, 2, 10)).rejects.toThrow('fail'); });
});
