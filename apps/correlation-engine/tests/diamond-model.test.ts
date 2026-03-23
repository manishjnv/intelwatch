import { describe, it, expect, beforeEach } from 'vitest';
import { DiamondModelService } from '../src/services/diamond-model.js';

describe('Correlation Engine — #7 DiamondModelService', () => {
  let svc: DiamondModelService;

  beforeEach(() => {
    svc = new DiamondModelService();
  });

  it('1. classifies threat_actor as adversary', () => {
    const result = svc.classifyEntity('a1', 'threat_actor', 'APT29');
    expect(result.facet).toBe('adversary');
  });

  it('2. classifies malware as capability', () => {
    const result = svc.classifyEntity('m1', 'malware', 'Cobalt Strike');
    expect(result.facet).toBe('capability');
  });

  it('3. classifies IOC ip as infrastructure', () => {
    const result = svc.classifyEntity('i1', 'ioc', '1.2.3.4', 'ip');
    expect(result.facet).toBe('infrastructure');
  });

  it('4. classifies IOC domain as infrastructure', () => {
    const result = svc.classifyEntity('i2', 'ioc', 'evil.com', 'domain');
    expect(result.facet).toBe('infrastructure');
  });

  it('5. classifies IOC email as adversary', () => {
    const result = svc.classifyEntity('i3', 'ioc', 'hacker@evil.com', 'email');
    expect(result.facet).toBe('adversary');
  });

  it('6. classifies IOC sha256 as capability', () => {
    const result = svc.classifyEntity('i4', 'ioc', 'abc123', 'sha256');
    expect(result.facet).toBe('capability');
  });

  it('7. isCompleteDiamond returns true when all 4 facets present', () => {
    const mappings = [
      svc.classifyEntity('a', 'threat_actor', 'APT29'),          // adversary
      svc.classifyEntity('m', 'malware', 'Cobalt Strike'),       // capability
      svc.classifyEntity('i', 'ioc', '1.2.3.4', 'ip'),          // infrastructure
      svc.classifyEntity('v', 'ioc', 'target@corp.com', 'email'), // adversary — NOT victim
    ];
    // This won't have victim, so isCompleteDiamond should be false
    expect(svc.isCompleteDiamond(mappings)).toBe(false);
  });

  it('8. facetDistribution counts entities per facet', () => {
    const mappings = [
      svc.classifyEntity('a1', 'threat_actor', 'APT29'),
      svc.classifyEntity('a2', 'threat_actor', 'APT28'),
      svc.classifyEntity('m1', 'malware', 'Cobalt Strike'),
      svc.classifyEntity('i1', 'ioc', '1.2.3.4', 'ip'),
    ];
    const dist = svc.facetDistribution(mappings);
    expect(dist.adversary).toBe(2);
    expect(dist.capability).toBe(1);
    expect(dist.infrastructure).toBe(1);
    expect(dist.victim).toBe(0);
  });
});
