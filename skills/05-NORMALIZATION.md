# SKILL: Normalization Engine
**ID:** 05-normalization | **Version:** 3.0

## MANDATORY (read before implementing)
1. **00-claude-instructions** — coding rules, token efficiency, definition of done
2. **00-architecture-roadmap** — tech stack, data flow, phase you're in
3. **00-master** — project structure, error classes, API response shapes
4. **02-testing** — write tests FIRST, then implement
5. **01-docs** — update documentation AFTER implementing

## MANDATORY PIPELINE INTEGRATION
Every entity stored in this module MUST:
1. Be normalized via `shared-normalization` package FIRST
2. Be queued for AI enrichment via `shared-enrichment` package
3. Be indexed in Elasticsearch after storage
4. Have a Neo4j node created/updated (via graph-service)
5. Publish the appropriate event to the event bus
6. All values displayed as clickable EntityChip (20-ui-ux)
7. Have tooltips and inline help on all UI elements

## MODULE DESCRIPTION
Central shared package (/packages/shared-normalization). ALL modules call this before storing. Canonical schemas (Zod): CanonicalIOC, CanonicalThreatActor, CanonicalMalware, CanonicalVulnerability. IOC type auto-detector (regex patterns for IP/domain/hash/URL/email/CVE). Deduplication via composite SHA256 hash (type:value:tenantId) — upsert on conflict. Timestamp normalizer (Unix/ISO/string). TLP/PAP mapper. Confidence normalizer (0-1 or 0-100 or string → 0-100 number). MITRE ATT&CK ID extractor (regex T\d{4}(?:\.\d{3})?). Tags standardizer.

## FILE STRUCTURE (max 400 lines per file)
```
/apps/05-normalization-service/src/
  index.ts              # Fastify app setup, plugins, routes registration
  routes.ts             # Route definitions only (import controllers)
  controller.ts         # HTTP layer — parse request, call service, format response
  service.ts            # Business logic (split into multiple files if >400 lines)
  schema.ts             # Zod schemas for this module's entities
  repository.ts         # Database queries (Prisma)
  queue.ts              # BullMQ worker/producer for this module
  README.md             # Module overview (updated after each build)
```

## UI REQUIREMENTS (from 20-ui-ux)
- All entity values (IPs, domains, actor names, CVEs, hashes) = EntityChip (clickable, highlighted)
- InvestigationPanel opens on entity click (relationship sidebar)
- Page-specific compact stats bar at top of module view
- All form fields have InlineHelp messages
- All features have TooltipHelp icons
- Collapsible sections on detail views
- 3D card effect (IntelCard) on interactive cards
- Mobile responsive (375px card view, desktop table view)
- Skeleton screens on all loading states
- Empty state with actionable CTA

## TESTING REQUIREMENTS (from 02-testing)
- Write test outlines BEFORE implementing
- Unit tests: all service methods (happy + error paths)
- Integration tests: all CRUD endpoints, auth enforcement, tenant isolation
- Minimum 80% coverage
- Run `npm run test:coverage` before marking done

## CANONICAL IOC SCHEMA (ZOD)
```typescript
export const CanonicalIOC = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  type: z.enum(['ip','ipv6','domain','fqdn','url','email','md5','sha1','sha256','sha512','asn','cidr','cve','bitcoin_address']),
  value: z.string(),
  normalized_value: z.string(),
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
  tlp: z.enum(['WHITE','GREEN','AMBER','RED']).default('AMBER'),
  confidence: z.number().min(0).max(100).default(50),
  severity: z.enum(['INFO','LOW','MEDIUM','HIGH','CRITICAL']).default('MEDIUM'),
  tags: z.array(z.string()).default([]),
  mitreAttack: z.array(z.string()).default([]),
  malwareFamilies: z.array(z.string()).default([]),
  threatActors: z.array(z.string()).default([]),
  sourceRefs: z.array(z.object({ feedId: z.string(), feedName: z.string() })),
  rawData: z.unknown().optional(),
  normalizedAt: z.string().datetime(),
  schemaVersion: z.literal('3.0')
})
```

## IOC TYPE DETECTOR
```typescript
const PATTERNS: Record<string, RegExp> = {
  ipv6: /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/,
  ip: /^(\d{1,3}\.){3}\d{1,3}$/,
  sha512: /^[a-fA-F0-9]{128}$/,
  sha256: /^[a-fA-F0-9]{64}$/,
  sha1: /^[a-fA-F0-9]{40}$/,
  md5: /^[a-fA-F0-9]{32}$/,
  cve: /^CVE-\d{4}-\d{4,}$/i,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  url: /^https?:\/\/.+/,
  domain: /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
}
// Check patterns in ORDER (most specific first)
```

## DEDUPLICATION
```typescript
// Composite hash = type:normalized_value:tenantId
const dedupeHash = sha256(`${type}:${normalizedValue}:${tenantId}`)
// Use prisma.ioc.upsert(where: { dedupeHash }, update: { lastSeen, sourceRefs: push })
```

---

## INTEL NORMALIZER CLASS (8 METHODS)
> Added from Strategic Architecture Review v1.0 — Updates 5 & 8 (P0)

Canonical normalization class in `packages/shared-normalization/src/normalizer.ts`.
All modules MUST call `IntelNormalizer` before storing any entity.

```typescript
// packages/shared-normalization/src/normalizer.ts
import { createHash } from 'crypto';
import { CanonicalIOC } from '@etip/shared-types';

export class IntelNormalizer {
  /**
   * 1. detectType — Priority-ordered IOC type detection.
   * Most specific patterns first to avoid false positives.
   */
  detectType(value: string): CanonicalIOC['type'] | null {
    const trimmed = this.defang(value, 'fang'); // re-fang before detection
    const ORDERED_PATTERNS: Array<[CanonicalIOC['type'], RegExp]> = [
      ['cve',              /^CVE-\d{4}-\d{4,}$/i],
      ['ipv6',             /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/],
      ['cidr',             /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/],
      ['sha512',           /^[a-fA-F0-9]{128}$/],
      ['sha256',           /^[a-fA-F0-9]{64}$/],
      ['sha1',             /^[a-fA-F0-9]{40}$/],
      ['md5',              /^[a-fA-F0-9]{32}$/],
      ['email',            /^[^\s@]+@[^\s@]+\.[^\s@]+$/],
      ['url',              /^https?:\/\/.+/],
      ['bitcoin_address',  /^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,62}$/],
      ['asn',              /^AS\d{1,10}$/i],
      ['ip',               /^(\d{1,3}\.){3}\d{1,3}$/],
      ['fqdn',             /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.){2,}[a-zA-Z]{2,}$/],
      ['domain',           /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/],
    ];
    for (const [type, regex] of ORDERED_PATTERNS) {
      if (regex.test(trimmed)) return type;
    }
    return null;
  }

  /**
   * 2. defang / fang — Toggle between safe display and raw form.
   */
  defang(value: string, direction: 'defang' | 'fang' = 'defang'): string {
    if (direction === 'defang') {
      return value
        .replace(/\./g, '[.]')
        .replace(/^https?/i, 'hxxp')
        .replace(/:(\/\/)/g, '[://]');
    }
    return value
      .replace(/\[\.\/]/g, '.')
      .replace(/hxxps?/gi, m => m.replace('xx', 'tt'))
      .replace(/\[:\/\/]/g, '://');
  }

  /**
   * 3. normalizeValue — Lowercase, trim, strip protocol for domains.
   */
  normalizeValue(value: string, type: CanonicalIOC['type']): string {
    let normalized = value.trim().toLowerCase();
    if (type === 'domain' || type === 'fqdn') {
      normalized = normalized.replace(/^(https?:\/\/)/i, '').replace(/\/$/, '');
    }
    if (type === 'email') {
      const [local, domain] = normalized.split('@');
      normalized = `${local}@${domain}`;
    }
    if (type === 'url') {
      try { normalized = new URL(normalized).href; } catch { /* keep as-is */ }
    }
    return normalized;
  }

  /**
   * 4. isPrivateIP — Filter RFC1918, loopback, link-local, multicast.
   */
  isPrivateIP(ip: string): boolean {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return false;
    return (
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      parts[0] >= 224
    );
  }

  /**
   * 5. extractMitreAttack — Pull T-codes from unstructured text.
   */
  extractMitreAttack(text: string): string[] {
    const regex = /T\d{4}(?:\.\d{3})?/g;
    const matches = text.match(regex) || [];
    return [...new Set(matches)];
  }

  /**
   * 6. normalizeConfidence — Coerce any confidence representation to 0–100.
   */
  normalizeConfidence(raw: number | string): number {
    if (typeof raw === 'string') {
      const map: Record<string, number> = {
        none: 0, low: 25, medium: 50, high: 75, very_high: 90, confirmed: 100,
      };
      return map[raw.toLowerCase()] ?? 50;
    }
    if (raw >= 0 && raw <= 1) return Math.round(raw * 100);
    return Math.max(0, Math.min(100, Math.round(raw)));
  }

  /**
   * 7. normalizeTLP — Accept any TLP representation → canonical enum.
   */
  normalizeTLP(raw: string): 'WHITE' | 'GREEN' | 'AMBER' | 'RED' {
    const upper = raw.toUpperCase().replace('TLP:', '').replace('TLP_', '').trim();
    const valid = ['WHITE', 'GREEN', 'AMBER', 'RED'] as const;
    return (valid.includes(upper as any) ? upper : 'AMBER') as typeof valid[number];
  }

  /**
   * 8. buildDedupeKey — Deterministic SHA-256 composite key.
   */
  buildDedupeKey(type: string, normalizedValue: string, tenantId: string): string {
    return createHash('sha256')
      .update(`${type}:${normalizedValue}:${tenantId}`)
      .digest('hex');
  }
}
```

## COMPOSITE CONFIDENCE FORMULA
> Added from Strategic Architecture Review v1.0 — Update 8 (P0)

Confidence is never a single number from a single source. Use this weighted
formula across all available signals.

```typescript
// packages/shared-normalization/src/confidence.ts

export interface ConfidenceInputs {
  feedReliability: number;   // 0–100: source feed’s historical accuracy
  corroborationCount: number; // how many independent feeds reported this IOC
  aiConfidence: number;       // 0–100: Claude enrichment confidence
  communityScore: number;     // 0–100: collective/community rating
  ageDays: number;            // days since firstSeen
}

const WEIGHTS = {
  feedReliability:    0.25,
  corroboration:      0.25,
  aiConfidence:       0.30,
  communityScore:     0.20,
} as const;

/**
 * Compute composite confidence with exponential time-decay.
 *
 * Formula:
 *   base = (feedReliability * 0.25)
 *        + (corroborationBonus * 0.25)
 *        + (aiConfidence * 0.30)
 *        + (communityScore * 0.20)
 *
 *   decayFactor = e^(-ageDays / 180)   // half-life ≈ 125 days
 *   finalConfidence = clamp(base * decayFactor, 0, 100)
 */
export function computeCompositeConfidence(inputs: ConfidenceInputs): number {
  const corroborationBonus = Math.min(100, inputs.corroborationCount * 20);

  const base =
    inputs.feedReliability   * WEIGHTS.feedReliability +
    corroborationBonus       * WEIGHTS.corroboration +
    inputs.aiConfidence      * WEIGHTS.aiConfidence +
    inputs.communityScore    * WEIGHTS.communityScore;

  const decayFactor = Math.exp(-inputs.ageDays / 180);
  return Math.round(Math.max(0, Math.min(100, base * decayFactor)));
}
```

## IOC LIFECYCLE STATE MACHINE
> Added from Strategic Architecture Review v1.0 — Update 8 (P0)

Every IOC follows a strict lifecycle. Transitions are enforced in code —
no state can be skipped.

```
  NEW → ACTIVE → AGING → EXPIRED → ARCHIVED
   │       │                        │
   │       └────→ FALSE_POSITIVE ──┘
   │                                 │
   └───────→ REVOKED ────────────┘
```

```typescript
// packages/shared-normalization/src/ioc-lifecycle.ts

export const IOC_STATES = [
  'NEW', 'ACTIVE', 'AGING', 'EXPIRED',
  'ARCHIVED', 'FALSE_POSITIVE', 'REVOKED',
] as const;
export type IOCState = typeof IOC_STATES[number];

/** Valid transitions map: from → allowed targets */
export const IOC_TRANSITIONS: Record<IOCState, readonly IOCState[]> = {
  NEW:             ['ACTIVE', 'REVOKED'],
  ACTIVE:          ['AGING', 'FALSE_POSITIVE', 'REVOKED'],
  AGING:           ['EXPIRED', 'ACTIVE'],           // re-activation on new sighting
  EXPIRED:         ['ARCHIVED', 'ACTIVE'],           // re-activation on new sighting
  ARCHIVED:        [],                               // terminal (retrieve via archive API)
  FALSE_POSITIVE:  ['ARCHIVED'],
  REVOKED:         ['ARCHIVED'],
} as const;

/** Automatic state rules (evaluated by cron / BullMQ scheduled job) */
export const IOC_AUTO_TRANSITIONS = {
  NEW_TO_ACTIVE_AFTER_ENRICHMENT: true,  // after enrichment-service completes
  ACTIVE_TO_AGING_DAYS:           30,    // no new sighting for 30 days
  AGING_TO_EXPIRED_DAYS:          60,    // no new sighting for 60 days
  EXPIRED_TO_ARCHIVED_DAYS:       90,    // 90 days after expiry
} as const;

import { AppError } from '@etip/shared-utils';

/** Enforce valid state transition. Throws on illegal transition. */
export function transitionIOCState(
  currentState: IOCState,
  targetState: IOCState
): IOCState {
  const allowed = IOC_TRANSITIONS[currentState];
  if (!allowed.includes(targetState)) {
    throw new AppError(
      400,
      `Invalid IOC state transition: ${currentState} → ${targetState}`,
      'INVALID_STATE_TRANSITION'
    );
  }
  return targetState;
}
```
