import { describe, it, expect } from 'vitest';
import { parseCPE, formatCPE, matchCPE, isValidCPE } from '../src/cpe.js';

const LOG4J_CPE = 'cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*';
const EXCHANGE_CPE = 'cpe:2.3:a:microsoft:exchange_server:2019:cumulative_update_10:*:*:*:*:*:*';
const LINUX_CPE = 'cpe:2.3:o:linux:linux_kernel:5.15.0:*:*:*:*:*:*:*';

describe('parseCPE', () => {
  it('parses Apache Log4j CPE correctly', () => {
    const result = parseCPE(LOG4J_CPE);
    expect(result).not.toBeNull();
    expect(result!.part).toBe('a');
    expect(result!.vendor).toBe('apache');
    expect(result!.product).toBe('log4j');
    expect(result!.version).toBe('2.14.1');
  });

  it('parses Microsoft Exchange CPE correctly', () => {
    const result = parseCPE(EXCHANGE_CPE);
    expect(result).not.toBeNull();
    expect(result!.vendor).toBe('microsoft');
    expect(result!.product).toBe('exchange_server');
    expect(result!.version).toBe('2019');
    expect(result!.update).toBe('cumulative_update_10');
  });

  it('parses Linux Kernel CPE (OS type)', () => {
    const result = parseCPE(LINUX_CPE);
    expect(result).not.toBeNull();
    expect(result!.part).toBe('o');
    expect(result!.vendor).toBe('linux');
    expect(result!.product).toBe('linux_kernel');
  });

  it('returns null for invalid URI (no prefix)', () => {
    expect(parseCPE('not-a-cpe-uri')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCPE('')).toBeNull();
  });

  it('returns null for wrong field count', () => {
    expect(parseCPE('cpe:2.3:a:apache:log4j')).toBeNull();
  });

  it('returns null for invalid part value', () => {
    expect(parseCPE('cpe:2.3:x:vendor:product:1.0:*:*:*:*:*:*:*')).toBeNull();
  });

  it('handles escaped colons in vendor name', () => {
    const cpe = 'cpe:2.3:a:vendor\\:name:product:1.0:*:*:*:*:*:*:*';
    const result = parseCPE(cpe);
    expect(result).not.toBeNull();
    expect(result!.vendor).toBe('vendor\\:name');
  });
});

describe('formatCPE', () => {
  it('formats full components into CPE URI', () => {
    const result = formatCPE({ part: 'a', vendor: 'apache', product: 'log4j', version: '2.14.1' });
    expect(result).toBe(LOG4J_CPE);
  });

  it('fills missing fields with wildcard', () => {
    const result = formatCPE({ vendor: 'apache', product: 'log4j' });
    expect(result).toContain('apache:log4j');
    expect(result.endsWith(':*')).toBe(true);
  });

  it('round-trips: parse → format → parse', () => {
    const parsed = parseCPE(LOG4J_CPE);
    const formatted = formatCPE(parsed!);
    const reparsed = parseCPE(formatted);
    expect(reparsed).toEqual(parsed);
  });
});

describe('matchCPE', () => {
  it('exact match returns true', () => {
    expect(matchCPE(LOG4J_CPE, LOG4J_CPE)).toBe(true);
  });

  it('wildcard version matches any version', () => {
    const wildcard = 'cpe:2.3:a:apache:log4j:*:*:*:*:*:*:*:*';
    expect(matchCPE(LOG4J_CPE, wildcard)).toBe(true);
  });

  it('wildcard product matches any product', () => {
    const wildcard = 'cpe:2.3:a:apache:*:*:*:*:*:*:*:*:*';
    expect(matchCPE(LOG4J_CPE, wildcard)).toBe(true);
  });

  it('different vendor does not match', () => {
    const other = 'cpe:2.3:a:oracle:log4j:2.14.1:*:*:*:*:*:*:*';
    expect(matchCPE(LOG4J_CPE, other)).toBe(false);
  });

  it('returns false for invalid CPE inputs', () => {
    expect(matchCPE('invalid', LOG4J_CPE)).toBe(false);
    expect(matchCPE(LOG4J_CPE, 'invalid')).toBe(false);
  });
});

describe('isValidCPE', () => {
  it('returns true for valid CPE', () => {
    expect(isValidCPE(LOG4J_CPE)).toBe(true);
    expect(isValidCPE(LINUX_CPE)).toBe(true);
  });

  it('returns false for invalid CPE', () => {
    expect(isValidCPE('not-a-cpe')).toBe(false);
    expect(isValidCPE('')).toBe(false);
  });
});
