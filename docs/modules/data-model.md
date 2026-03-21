# Data Model Reference

**Source:** `prisma/schema.prisma` | **DB:** PostgreSQL 16 | **ORM:** Prisma 5

## Tables

### Ioc (table: `iocs`)

Core intelligence entity — every normalized IOC from all feeds.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Auto-generated primary key |
| tenantId | UUID | FK → tenants (RLS scoped) |
| feedSourceId | UUID? | FK → feed_sources (nullable, SetNull on delete) |
| iocType | IocType enum | ip, domain, hash_sha256, cve, url, email, etc. |
| value | Text | Original raw value from feed |
| normalizedValue | Text | Canonical form (lowercased, refanged, URL-deduped) |
| dedupeHash | VarChar(64) | UNIQUE. SHA-256 of `type:normalizedValue:tenantId` |
| severity | Severity enum | info, low, medium, high, critical (auto-classified, never downgrades) |
| tlp | TLP enum | white, green, amber, red (never downgrades) |
| confidence | Int (0-100) | Composite score: 0.35 feed + 0.35 corroboration + 0.30 AI, with type-specific decay |
| lifecycle | IocLifecycle enum | new → active → aging → expired → archived. Also: false_positive, revoked, reactivated |
| tags | String[] | Free-form tags (merged on upsert) |
| mitreAttack | String[] | MITRE ATT&CK IDs: T1059, T1486, etc. |
| malwareFamilies | String[] | LockBit, Emotet, Cobalt Strike, etc. |
| threatActors | String[] | APT28, Lazarus, Volt Typhoon, etc. |
| enrichmentData | JSON | ConfidenceBreakdown + VT/AbuseIPDB results + velocity + history |
| enrichedAt | DateTime? | When last enriched by AI enrichment service |
| firstSeen | DateTime | When IOC was first ingested |
| lastSeen | DateTime | When IOC was last sighted (updated on re-sighting) |
| expiresAt | DateTime? | Optional explicit expiry |

**Indexes:** tenantId, tenantId+iocType, tenantId+severity, tenantId+lifecycle, normalizedValue, firstSeen, lastSeen

### enrichmentData JSON structure

```typescript
{
  // Confidence signals
  feedReliability: number,      // 0-100 from feed source
  corroboration: number,        // 0-100 from independent source count
  aiScore: number,              // 0-100 from calibrated confidence
  decayFactor: number,          // 0-1 exponential decay
  decayRate: number,            // type-specific: hash 0.001, IP 0.05
  daysSinceFirstSeen: number,

  // Tracking
  sightingCount: number,
  sourceFeedIds: string[],
  batchPenalty: number,         // 1.0 normal, 0.5 for bulk dumps
  confidenceFloor: number,     // type-specific minimum
  confidenceCeiling: number,   // type-specific maximum
  velocityScore: number,       // 0-100 campaign speed
  sightingTimestamps: [{feedId, timestamp}],
  confidenceHistory: [{date, score, source}],  // capped at 20

  // External enrichment (from AI Enrichment service)
  vtResult?: { malicious, suspicious, harmless, undetected, totalEngines, detectionRate, tags },
  abuseipdbResult?: { abuseConfidenceScore, totalReports, isp, countryCode, isTor },
  enrichedAt?: string,
  enrichmentStatus?: 'enriched' | 'partial' | 'failed' | 'skipped',
  externalRiskScore?: number,  // VT 50% + AbuseIPDB 30% + base 20%
}
```

### FeedSource (table: `feed_sources`)

RSS/STIX/API feed configuration + health metrics.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| tenantId | UUID | FK → tenants |
| name | VarChar(255) | Display name |
| feedType | FeedType enum | rss, stix, taxii, misp, rest_api, csv_upload, etc. |
| url | Text? | Feed URL |
| schedule | VarChar(100)? | Cron expression (e.g., `*/30 * * * *`) |
| enabled | Boolean | Active/disabled |
| feedReliability | Int (0-100) | Source reliability score (used in confidence calc) |
| lastFetchAt | DateTime? | Last successful fetch |
| consecutiveFailures | Int | Error counter (resets on success) |
| totalItemsIngested | Int | Lifetime article count |

### Article (table: `articles`)

Ingested article with pipeline processing state.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| tenantId | UUID | FK → tenants |
| feedSourceId | UUID | FK → feed_sources |
| title | VarChar(1000) | Article headline |
| content | Text | Full article body |
| pipelineStatus | PipelineStatus | ingested → triaged → extracted → enriched → persisted |
| isCtiRelevant | Boolean | Triage result: is this CTI? |
| triageResult | JSON | Haiku AI triage output |
| extractionResult | JSON | Sonnet AI extraction output (threat actors, malware, MITRE) |

## Enums

| Enum | Values | Used By |
|------|--------|---------|
| IocType | ip, ipv6, domain, fqdn, url, email, hash_md5, hash_sha1, hash_sha256, hash_sha512, cve, asn, cidr, bitcoin_address, unknown | Ioc.iocType |
| IocLifecycle | new, active, aging, expired, archived, false_positive, revoked, reactivated | Ioc.lifecycle |
| Severity | info, low, medium, high, critical | Ioc.severity |
| TLP | white, green, amber, red | Ioc.tlp |
| FeedType | rss, stix, taxii, misp, rest_api, nvd, csv_upload, json_upload, webhook, email_imap | FeedSource.feedType |
| PipelineStatus | ingested, triaged, extracted, enriched, deduplicated, persisted, failed | Article.pipelineStatus |
| ArticleType | threat_report, vulnerability_advisory, news, blog, irrelevant | Article.articleType |

## Lifecycle State Machine

```
NEW → ACTIVE (on second sighting)
ACTIVE → AGING (30 days no sighting, via cron)
AGING → EXPIRED (60 days no sighting, via cron)
EXPIRED → ARCHIVED (90 days, via cron)

AGING/EXPIRED → REACTIVATED (IOC re-sighted — APT infra recycling)
REACTIVATED → ACTIVE (on next sighting)

ACTIVE → FALSE_POSITIVE (analyst decision — never auto-overridden)
ANY → REVOKED (feed retraction — never auto-overridden)
FALSE_POSITIVE/REVOKED → ARCHIVED (terminal)
```
