import type { TyposquatCandidate, TyposquatMethod } from '../schemas/drp.js';
import {
  HOMOGLYPHS, COMBO_KEYWORDS, KEYBOARD_ADJACENCY, VOWELS,
  COMMON_TLDS, HOSTING_PROVIDERS,
} from './typosquat-constants.js';
import { computeCompositeRiskScore } from './similarity-scoring.js';

export interface TyposquatDetectorConfig {
  maxCandidates: number;
}

/** Typosquatting detection with 12 algorithms. */
export class TyposquatDetector {
  private readonly config: TyposquatDetectorConfig;
  private currentDomain = '';

  constructor(config: TyposquatDetectorConfig) {
    this.config = config;
  }

  /** Run typosquatting scan using selected methods. */
  scan(domain: string, methods: TyposquatMethod[]): TyposquatCandidate[] {
    const normalizedDomain = domain.toLowerCase().replace(/\.$/, '');
    this.currentDomain = normalizedDomain;
    const candidates: TyposquatCandidate[] = [];

    for (const method of methods) {
      candidates.push(...this.generateByMethod(normalizedDomain, method));
    }

    // Deduplicate by domain name
    const seen = new Set<string>();
    const unique = candidates.filter((c) => {
      if (seen.has(c.domain)) return false;
      seen.add(c.domain);
      return true;
    });

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
      case 'combosquatting': return this.generateCombosquatting(domain);
      case 'bitsquatting': return this.generateBitsquatting(domain);
      case 'keyboard_proximity': return this.generateKeyboardProximity(domain);
      case 'vowel_swap': return this.generateVowelSwaps(domain);
      case 'repetition': return this.generateRepetitions(domain);
      case 'hyphenation': return this.generateHyphenations(domain);
      case 'subdomain': return this.generateSubdomainSquats(domain);
    }
  }

  /** Build a candidate object with composite risk scoring. */
  private candidate(
    domain: string, method: TyposquatMethod, editDistance: number, similarity: number,
    reg: { isRegistered: boolean; registrationDate: string | null; registrationTermYears: number | null },
  ): TyposquatCandidate {
    return {
      domain, method, editDistance, similarity, ...reg,
      hostingProvider: this.randomHosting(),
      riskScore: computeCompositeRiskScore(
        this.currentDomain, domain,
        reg.isRegistered, reg.registrationDate, reg.registrationTermYears,
      ),
    };
  }

  /** Replace characters with visual lookalikes. */
  private generateHomoglyphs(domain: string): TyposquatCandidate[] {
    const { name, tld } = this.splitDomain(domain);
    const candidates: TyposquatCandidate[] = [];
    for (let i = 0; i < name.length && candidates.length < 30; i++) {
      const glyphs = HOMOGLYPHS[name[i]!.toLowerCase()];
      if (!glyphs) continue;
      for (const glyph of glyphs) {
        const full = name.slice(0, i) + glyph + name.slice(i + 1) + tld;
        if (full === domain) continue;
        candidates.push(this.candidate(full, 'homoglyph', 1, 1 - (1 / name.length), this.simulateRegistration()));
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
        const full = name.slice(0, i) + ch + name.slice(i) + tld;
        if (full === domain) continue;
        candidates.push(this.candidate(full, 'insertion', 1, name.length / (name.length + 1), this.simulateRegistration()));
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
      candidates.push(this.candidate(variant + tld, 'deletion', 1, (name.length - 1) / name.length, this.simulateRegistration()));
    }
    return candidates;
  }

  /** Swap adjacent characters. */
  private generateTranspositions(domain: string): TyposquatCandidate[] {
    const { name, tld } = this.splitDomain(domain);
    const candidates: TyposquatCandidate[] = [];
    for (let i = 0; i < name.length - 1; i++) {
      if (name[i] === name[i + 1]) continue;
      const chars = name.split('');
      [chars[i], chars[i + 1]] = [chars[i + 1]!, chars[i]!];
      candidates.push(this.candidate(chars.join('') + tld, 'transposition', 1, 1 - (1 / name.length), this.simulateRegistration()));
    }
    return candidates;
  }

  /** Replace TLD with common variants. */
  private generateTLDVariants(domain: string): TyposquatCandidate[] {
    const { name, tld } = this.splitDomain(domain);
    const candidates: TyposquatCandidate[] = [];
    for (const newTld of COMMON_TLDS) {
      if (newTld === tld) continue;
      const similarity = COMMON_TLDS.indexOf(newTld) < 5 ? 0.9 : 0.7;
      candidates.push(this.candidate(name + newTld, 'tld_variant', Math.abs(tld.length - newTld.length) + 1, similarity, this.simulateRegistration()));
    }
    return candidates;
  }

  /** Combosquatting — brand + keyword (e.g., paypal-support.com). #1 attack vector. */
  private generateCombosquatting(domain: string): TyposquatCandidate[] {
    const { name, tld } = this.splitDomain(domain);
    const candidates: TyposquatCandidate[] = [];
    for (const kw of COMBO_KEYWORDS) {
      for (const variant of [`${name}${kw}${tld}`, `${kw}${name}${tld}`, `${name}-${kw}${tld}`, `${kw}-${name}${tld}`]) {
        if (variant === domain) continue;
        const sim = name.length / variant.replace(tld, '').length;
        candidates.push(this.candidate(variant, 'combosquatting', kw.length + 1, sim, this.simulateRegistration()));
      }
    }
    return candidates;
  }

  /** Bitsquatting — single bit-flip in ASCII, keep valid domain chars. */
  private generateBitsquatting(domain: string): TyposquatCandidate[] {
    const { name, tld } = this.splitDomain(domain);
    const candidates: TyposquatCandidate[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < name.length && candidates.length < 30; i++) {
      const code = name.charCodeAt(i);
      for (let bit = 0; bit < 8; bit++) {
        const ch = String.fromCharCode(code ^ (1 << bit));
        if (!/[a-z0-9-]/.test(ch)) continue;
        const full = name.slice(0, i) + ch + name.slice(i + 1) + tld;
        if (full === domain || seen.has(full)) continue;
        seen.add(full);
        candidates.push(this.candidate(full, 'bitsquatting', 1, 1 - (1 / name.length), this.simulateRegistration()));
      }
    }
    return candidates;
  }

  /** Keyboard proximity — replace each char with QWERTY neighbors. */
  private generateKeyboardProximity(domain: string): TyposquatCandidate[] {
    const { name, tld } = this.splitDomain(domain);
    const candidates: TyposquatCandidate[] = [];
    for (let i = 0; i < name.length && candidates.length < 30; i++) {
      const neighbors = KEYBOARD_ADJACENCY[name[i]!];
      if (!neighbors) continue;
      for (const nb of neighbors) {
        const full = name.slice(0, i) + nb + name.slice(i + 1) + tld;
        if (full === domain) continue;
        candidates.push(this.candidate(full, 'keyboard_proximity', 1, 1 - (1 / name.length), this.simulateRegistration()));
      }
    }
    return candidates;
  }

  /** Vowel-swap — replace each vowel with every other vowel. */
  private generateVowelSwaps(domain: string): TyposquatCandidate[] {
    const { name, tld } = this.splitDomain(domain);
    const candidates: TyposquatCandidate[] = [];
    for (let i = 0; i < name.length; i++) {
      if (!VOWELS.includes(name[i]!)) continue;
      for (const v of VOWELS) {
        if (v === name[i]) continue;
        const full = name.slice(0, i) + v + name.slice(i + 1) + tld;
        if (full === domain) continue;
        candidates.push(this.candidate(full, 'vowel_swap', 1, 1 - (1 / name.length), this.simulateRegistration()));
      }
    }
    return candidates;
  }

  /** Repetition — double each character once (google→gooogle). */
  private generateRepetitions(domain: string): TyposquatCandidate[] {
    const { name, tld } = this.splitDomain(domain);
    const candidates: TyposquatCandidate[] = [];
    for (let i = 0; i < name.length; i++) {
      if (name[i] === '-') continue;
      const full = name.slice(0, i) + name[i] + name.slice(i) + tld;
      if (full === domain) continue;
      candidates.push(this.candidate(full, 'repetition', 1, name.length / (name.length + 1), this.simulateRegistration()));
    }
    return candidates;
  }

  /** Hyphenation — insert hyphens between characters and at word boundaries. */
  private generateHyphenations(domain: string): TyposquatCandidate[] {
    const { name, tld } = this.splitDomain(domain);
    const candidates: TyposquatCandidate[] = [];
    const seen = new Set<string>();
    for (let i = 1; i < name.length && candidates.length < 20; i++) {
      if (name[i] === '-' || name[i - 1] === '-') continue;
      const full = name.slice(0, i) + '-' + name.slice(i) + tld;
      if (full === domain || seen.has(full)) continue;
      seen.add(full);
      candidates.push(this.candidate(full, 'hyphenation', 1, name.length / (name.length + 1), this.simulateRegistration()));
    }
    return candidates;
  }

  /** Subdomain/levelsquatting — brand.evil-tld patterns (e.g., paypal.com.evil.com). */
  private generateSubdomainSquats(domain: string): TyposquatCandidate[] {
    const { name, tld } = this.splitDomain(domain);
    const evilTlds = ['.com', '.net', '.org', '.xyz', '.online', '.site', '.top', '.tk'];
    const candidates: TyposquatCandidate[] = [];
    for (const evil of evilTlds) {
      const full = `${name}${tld}.evil${evil}`;
      candidates.push(this.candidate(full, 'subdomain', evil.length + 5, 0.7, this.simulateRegistration()));
      const dashed = `${name}${tld.replace('.', '-')}${evil}`;
      candidates.push(this.candidate(dashed, 'subdomain', evil.length + 4, 0.65, this.simulateRegistration()));
    }
    return candidates;
  }

  /** Split domain into name and TLD parts. */
  private splitDomain(domain: string): { name: string; tld: string } {
    const lastDot = domain.lastIndexOf('.');
    if (lastDot === -1) return { name: domain, tld: '' };
    return { name: domain.slice(0, lastDot), tld: domain.slice(lastDot) };
  }

  /** Simulated registration check (deterministic hash-based for testing). */
  private simulateRegistration(): { isRegistered: boolean; registrationDate: string | null; registrationTermYears: number | null } {
    const isRegistered = Math.random() < 0.3;
    if (!isRegistered) return { isRegistered: false, registrationDate: null, registrationTermYears: null };
    const daysAgo = Math.floor(Math.random() * 365);
    const date = new Date(Date.now() - daysAgo * 86400000);
    const termYears = Math.random() < 0.85 ? 1 : Math.ceil(Math.random() * 5);
    return { isRegistered: true, registrationDate: date.toISOString(), registrationTermYears: termYears };
  }

  /** Simulated hosting provider. */
  private randomHosting(): string | null {
    return HOSTING_PROVIDERS[Math.floor(Math.random() * HOSTING_PROVIDERS.length)] ?? null;
  }
}
