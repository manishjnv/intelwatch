import { describe, it, expect } from 'vitest';
import { DomainEnricher } from '../src/services/domain-enricher.js';

describe('DRP Service — Domain Enricher', () => {
  // DE.1 disabled enricher returns null fields
  it('DE.1 disabled enricher returns null fields', async () => {
    const enricher = new DomainEnricher({ enabled: false });
    const result = await enricher.enrich('example.com');
    expect(result.domain).toBe('example.com');
    expect(result.whois).toBeNull();
    expect(result.dns).toBeNull();
    expect(result.ssl).toBeNull();
    expect(result.enrichedAt).toBeTruthy();
  });

  // DE.2 enabled enricher returns all sections
  it('DE.2 enabled enricher returns whois, dns, ssl', async () => {
    const enricher = new DomainEnricher({ enabled: true });
    const result = await enricher.enrich('test.com');
    expect(result.domain).toBe('test.com');
    expect(result.whois).not.toBeNull();
    expect(result.dns).not.toBeNull();
    // SSL may or may not be present (simulated 60% chance)
    expect(result.enrichedAt).toBeTruthy();
  });

  // DE.3 WHOIS data has expected fields
  it('DE.3 whois data structure is correct', async () => {
    const enricher = new DomainEnricher({ enabled: true });
    const result = await enricher.enrich('test.com');
    const w = result.whois!;
    expect(w).toHaveProperty('registrar');
    expect(w).toHaveProperty('registrationDate');
    expect(w).toHaveProperty('expirationDate');
    expect(w).toHaveProperty('nameservers');
    expect(w).toHaveProperty('registrationTermYears');
    expect(Array.isArray(w.nameservers)).toBe(true);
    expect(typeof w.registrationTermYears).toBe('number');
    expect(w.registrationTermYears).toBeGreaterThanOrEqual(1);
  });

  // DE.4 DNS data has expected fields
  it('DE.4 dns data structure is correct', async () => {
    const enricher = new DomainEnricher({ enabled: true });
    const result = await enricher.enrich('test.com');
    const d = result.dns!;
    expect(Array.isArray(d.aRecords)).toBe(true);
    expect(Array.isArray(d.mxRecords)).toBe(true);
    expect(Array.isArray(d.nsRecords)).toBe(true);
    expect(typeof d.hasWebsite).toBe('boolean');
    expect(typeof d.hasMail).toBe('boolean');
  });

  // DE.5 SSL data flags Let's Encrypt correctly
  it('DE.5 ssl data identifies LE certs', async () => {
    const enricher = new DomainEnricher({ enabled: true });
    // Run multiple times to get at least one SSL result
    let foundSsl = false;
    for (let i = 0; i < 20; i++) {
      const result = await enricher.enrich(`test${i}.com`);
      if (result.ssl?.issuer) {
        foundSsl = true;
        expect(typeof result.ssl.isLetsEncrypt).toBe('boolean');
        expect(typeof result.ssl.daysSinceIssued).toBe('number');
        if (result.ssl.isLetsEncrypt) {
          expect(result.ssl.issuer).toBe("Let's Encrypt");
        }
        break;
      }
    }
    expect(foundSsl).toBe(true);
  });

  // DE.6 enrichment returns ISO timestamp
  it('DE.6 enrichedAt is ISO timestamp', async () => {
    const enricher = new DomainEnricher({ enabled: true });
    const result = await enricher.enrich('example.com');
    expect(new Date(result.enrichedAt).toISOString()).toBe(result.enrichedAt);
  });

  // DE.7 multiple enrichments return independent results
  it('DE.7 multiple enrichments are independent', async () => {
    const enricher = new DomainEnricher({ enabled: true });
    const r1 = await enricher.enrich('alpha.com');
    const r2 = await enricher.enrich('beta.com');
    expect(r1.domain).toBe('alpha.com');
    expect(r2.domain).toBe('beta.com');
    // Independent — different domains
    expect(r1.domain).not.toBe(r2.domain);
  });
});
