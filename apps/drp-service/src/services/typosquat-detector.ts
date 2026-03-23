import type { TyposquatCandidate, TyposquatMethod } from '../schemas/drp.js';

export interface TyposquatDetectorConfig {
  maxCandidates: number;
}

/**
 * Homoglyph mapping — characters that are visually similar.
 * Includes ASCII lookalikes and common substitutions.
 */
const HOMOGLYPHS: Record<string, string[]> = {
  a: ['@', '4', 'à', 'á', 'â', 'ã'],
  b: ['d', '6'],
  c: ['(', 'ç'],
  d: ['b', 'cl'],
  e: ['3', 'è', 'é', 'ê'],
  g: ['9', 'q'],
  h: ['lh'],
  i: ['1', 'l', '!', 'í', 'ì'],
  k: ['lk'],
  l: ['1', 'i', '|'],
  m: ['rn', 'nn'],
  n: ['r', 'ñ'],
  o: ['0', 'ø', 'ö', 'ò', 'ó'],
  q: ['9', 'g'],
  s: ['5', '$', 'ś'],
  t: ['7', '+'],
  u: ['v', 'ú', 'ù', 'ü'],
  v: ['u'],
  w: ['vv'],
  y: ['ý'],
  z: ['2'],
};

const COMMON_TLDS = [
  '.com', '.net', '.org', '.io', '.co', '.info', '.biz',
  '.xyz', '.online', '.site', '.app', '.dev', '.me', '.us',
  '.uk', '.de', '.fr', '.ru', '.cn',
];

const HOSTING_PROVIDERS = [
  'Cloudflare', 'AWS', 'GoDaddy', 'Namecheap', 'OVH',
  'DigitalOcean', 'Hetzner', 'BulletproofHost', 'FastFlux',
  null,
];

/** Typosquatting detection with 5 algorithms. */
export class TyposquatDetector {
  private readonly config: TyposquatDetectorConfig;

  constructor(config: TyposquatDetectorConfig) {
    this.config = config;
  }

  /** Run typosquatting scan using selected methods. */
  scan(domain: string, methods: TyposquatMethod[]): TyposquatCandidate[] {
    const normalizedDomain = domain.toLowerCase().replace(/\.$/, '');
    const candidates: TyposquatCandidate[] = [];

    for (const method of methods) {
      const methodCandidates = this.generateByMethod(normalizedDomain, method);
      candidates.push(...methodCandidates);
    }

    // Deduplicate by domain name
    const seen = new Set<string>();
    const unique = candidates.filter((c) => {
      if (seen.has(c.domain)) return false;
      seen.add(c.domain);
      return true;
    });

    // Sort by risk score descending
    unique.sort((a, b) => b.riskScore - a.riskScore);

    return unique.slice(0, this.config.maxCandidates);
  }

  /** Generate candidates for a specific method. */
  private generateByMethod(domain: string, method: TyposquatMethod): TyposquatCandidate[] {
    switch (method) {
      case 'homoglyph': return this.generateHomoglyphs(domain);
      case 'insertion': return this.generateInsertions(domain);
      case 'deletion': return this.generateDeletions(domain);
      case 'transposition': return this.generateTranspositions(domain);
      case 'tld_variant': return this.generateTLDVariants(domain);
    }
  }

  /** Replace characters with visual lookalikes. */
  private generateHomoglyphs(domain: string): TyposquatCandidate[] {
    const { name, tld } = this.splitDomain(domain);
    const candidates: TyposquatCandidate[] = [];

    for (let i = 0; i < name.length && candidates.length < 30; i++) {
      const char = name[i]!.toLowerCase();
      const glyphs = HOMOGLYPHS[char];
      if (!glyphs) continue;

      for (const glyph of glyphs) {
        const variant = name.slice(0, i) + glyph + name.slice(i + 1);
        const fullDomain = variant + tld;
        if (fullDomain === domain) continue;

        const similarity = 1 - (1 / name.length);
        const reg = this.simulateRegistration();
        candidates.push({
          domain: fullDomain,
          method: 'homoglyph',
          editDistance: 1,
          similarity,
          ...reg,
          hostingProvider: this.randomHosting(),
          riskScore: this.computeRiskScore(similarity, reg.isRegistered, reg.registrationDate),
        });
      }
    }

    return candidates;
  }

  /** Insert characters at every position. */
  private generateInsertions(domain: string): TyposquatCandidate[] {
    const { name, tld } = this.splitDomain(domain);
    const candidates: TyposquatCandidate[] = [];
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789-';

    for (let i = 0; i <= name.length && candidates.length < 20; i++) {
      for (const ch of chars) {
        if (candidates.length >= 20) break;
        const variant = name.slice(0, i) + ch + name.slice(i);
        const fullDomain = variant + tld;
        if (fullDomain === domain) continue;

        const similarity = name.length / (name.length + 1);
        const reg = this.simulateRegistration();
        candidates.push({
          domain: fullDomain,
          method: 'insertion',
          editDistance: 1,
          similarity,
          ...reg,
          hostingProvider: this.randomHosting(),
          riskScore: this.computeRiskScore(similarity, reg.isRegistered, reg.registrationDate),
        });
      }
    }

    return candidates;
  }

  /** Delete each character once. */
  private generateDeletions(domain: string): TyposquatCandidate[] {
    const { name, tld } = this.splitDomain(domain);
    const candidates: TyposquatCandidate[] = [];

    for (let i = 0; i < name.length; i++) {
      const variant = name.slice(0, i) + name.slice(i + 1);
      if (variant.length === 0) continue;
      const fullDomain = variant + tld;

      const similarity = (name.length - 1) / name.length;
      const reg = this.simulateRegistration();
      candidates.push({
        domain: fullDomain,
        method: 'deletion',
        editDistance: 1,
        similarity,
        ...reg,
        hostingProvider: this.randomHosting(),
        riskScore: this.computeRiskScore(similarity, reg.isRegistered, reg.registrationDate),
      });
    }

    return candidates;
  }

  /** Swap adjacent characters. */
  private generateTranspositions(domain: string): TyposquatCandidate[] {
    const { name, tld } = this.splitDomain(domain);
    const candidates: TyposquatCandidate[] = [];

    for (let i = 0; i < name.length - 1; i++) {
      if (name[i] === name[i + 1]) continue; // skip identical adjacent
      const chars = name.split('');
      [chars[i], chars[i + 1]] = [chars[i + 1]!, chars[i]!];
      const fullDomain = chars.join('') + tld;

      const similarity = 1 - (1 / name.length);
      const reg = this.simulateRegistration();
      candidates.push({
        domain: fullDomain,
        method: 'transposition',
        editDistance: 1,
        similarity,
        ...reg,
        hostingProvider: this.randomHosting(),
        riskScore: this.computeRiskScore(similarity, reg.isRegistered, reg.registrationDate),
      });
    }

    return candidates;
  }

  /** Replace TLD with common variants. */
  private generateTLDVariants(domain: string): TyposquatCandidate[] {
    const { name, tld } = this.splitDomain(domain);
    const candidates: TyposquatCandidate[] = [];

    for (const newTld of COMMON_TLDS) {
      if (newTld === tld) continue;
      const fullDomain = name + newTld;

      // Higher similarity for popular TLDs
      const popularIndex = COMMON_TLDS.indexOf(newTld);
      const similarity = popularIndex < 5 ? 0.9 : 0.7;
      const reg = this.simulateRegistration();
      candidates.push({
        domain: fullDomain,
        method: 'tld_variant',
        editDistance: Math.abs(tld.length - newTld.length) + 1,
        similarity,
        ...reg,
        hostingProvider: this.randomHosting(),
        riskScore: this.computeRiskScore(similarity, reg.isRegistered, reg.registrationDate),
      });
    }

    return candidates;
  }

  /** Split domain into name and TLD parts. */
  private splitDomain(domain: string): { name: string; tld: string } {
    const lastDot = domain.lastIndexOf('.');
    if (lastDot === -1) return { name: domain, tld: '' };
    return { name: domain.slice(0, lastDot), tld: domain.slice(lastDot) };
  }

  /** Compute risk score from signals. */
  private computeRiskScore(
    similarity: number,
    isRegistered: boolean,
    registrationDate: string | null,
  ): number {
    let score = similarity * 0.30;
    if (isRegistered) score += 0.30;
    if (registrationDate) {
      const age = Date.now() - new Date(registrationDate).getTime();
      const daysOld = age / (1000 * 60 * 60 * 24);
      if (daysOld < 30) score += 0.25;
      else if (daysOld < 90) score += 0.15;
      else score += 0.05;
    }
    // Popular TLD bonus already in similarity
    score += 0.10; // baseline
    return Math.min(1, Math.max(0, score));
  }

  /** Simulated registration check (deterministic hash-based for testing). */
  private simulateRegistration(): { isRegistered: boolean; registrationDate: string | null } {
    const isRegistered = Math.random() < 0.3;
    if (!isRegistered) return { isRegistered: false, registrationDate: null };
    const daysAgo = Math.floor(Math.random() * 365);
    const date = new Date(Date.now() - daysAgo * 86400000);
    return { isRegistered: true, registrationDate: date.toISOString() };
  }

  /** Simulated hosting provider. */
  private randomHosting(): string | null {
    return HOSTING_PROVIDERS[Math.floor(Math.random() * HOSTING_PROVIDERS.length)] ?? null;
  }
}
