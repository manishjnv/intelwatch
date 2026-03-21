# Threat Actor Intelligence Service (Module 08)

**Port:** 3008 | **Phase:** 3 | **Status:** WIP | **Tests:** 190

## What It Does
Manages threat actor profiles with aliases, motivations, TTPs (MITRE ATT&CK), targeted sectors, origin country, and attribution confidence scoring. Links actors to IOCs via the IOC table's `threatActors` string array. Provides MITRE ATT&CK technique grouping, timeline visualization data, and CSV/JSON export.

## Pipeline
```
Ingestion → Normalization (threatActors field on IOC) → Actor profile CRUD
  → Actor ↔ IOC linkage (computed from IOC.threatActors array)
  → MITRE ATT&CK mapping → Attribution scoring → Search → Export
```

## Features
| Feature | File | Description |
|---------|------|-------------|
| Health check | routes/health.ts | GET /health, GET /ready |
| Actor CRUD | routes/actors.ts, service.ts, repository.ts | Create, read, update, soft-delete actor profiles |
| Actor profiles | schemas/actor.ts | Name, aliases, type, motivation, sophistication, TTPs, sectors, regions |
| IOC linkage | service.ts | Query IOCs by actor name/aliases from IOC table |
| MITRE ATT&CK | scoring.ts, service.ts | TTP grouping by tactic, sophistication scoring |
| Actor search | repository.ts | Full-text search across names, aliases, descriptions, tags, TTPs |
| Actor timeline | service.ts | IOC activity bucketed by day with severity/type breakdown |
| Actor export | service.ts, scoring.ts | CSV and JSON export with filters |
| Attribution scoring | scoring.ts | 4-signal weighted: infra 35%, malware 30%, TTP 20%, victim 15% |
| Actor stats | repository.ts | Aggregates by type, motivation, sophistication, avg confidence |
| TLP ratchet | repository.ts | TLP never-downgrade on update |
| Alias dedup check | service.ts | Prevents duplicate actor names per tenant |
| **A1: Explainable attribution** | scoring.ts, service.ts | 4-signal breakdown with evidence trail (infra/malware/TTP/victim) |
| **A2: Alias clustering** | scoring.ts, service.ts | Auto-detect potential duplicate actors via Jaccard similarity (≥0.6) |
| **A3: Corroboration** | scoring.ts, service.ts | Multi-feed confidence boost (+5/feed, cap 20) |
| **B1: Dormancy detection** | scoring.ts, service.ts | Active/dormant/resurgent classification from IOC activity |
| **C2: Link strength** | scoring.ts, service.ts | IOC-actor link quality 0-100 (strong/moderate/weak) |
| **A4: Attribution decay** | accuracy.ts, service.ts | Type-aware confidence decay (IP 14d, hash 365d half-life) |
| **B2: TTP evolution** | accuracy.ts, service.ts | New/abandoned/consistent TTPs + evolution velocity |
| **C1: Infra sharing** | accuracy.ts, service.ts | Cross-actor IOC overlap detection (coordination/tool_sharing) |
| **D1: Provenance** | accuracy.ts, service.ts | Enriched export record with all accuracy signals |
| **D2: MITRE heatmap** | accuracy.ts, service.ts | Per-tactic coverage data for ATT&CK matrix rendering |
| **A5: Diamond Model** | accuracy-p2.ts, service-p2.ts | Adversary/capability/infrastructure/victim with completeness score |
| **B3: False flag detection** | accuracy-p2.ts, service-p2.ts | TTP overlap alerts (≥70% → false_flag_likely or tool_sharing) |
| **C3: Victimology prediction** | accuracy-p2.ts, service-p2.ts | Sector frequency analysis → predicted next targets |
| **D3: Actor comparison** | accuracy-p2.ts, service-p2.ts | Side-by-side comparison with shared/unique breakdown |
| **D4: Feed accuracy** | accuracy-p2.ts, service-p2.ts | Per-feed actor count, avg confidence, IOC count |

## API
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | - | Health check |
| GET | /ready | - | Readiness check |
| GET | /api/v1/actors | JWT+RBAC | List actors (paginated, filtered, sorted) |
| POST | /api/v1/actors | JWT+RBAC | Create actor profile |
| GET | /api/v1/actors/search | JWT+RBAC | Full-text search |
| GET | /api/v1/actors/stats | JWT+RBAC | Aggregate statistics |
| GET | /api/v1/actors/export | JWT+RBAC | Export CSV/JSON |
| GET | /api/v1/actors/:id | JWT+RBAC | Get actor by ID |
| PUT | /api/v1/actors/:id | JWT+RBAC | Update actor |
| DELETE | /api/v1/actors/:id | JWT+RBAC | Soft-delete actor |
| GET | /api/v1/actors/:id/iocs | JWT+RBAC | Linked IOCs |
| GET | /api/v1/actors/:id/timeline | JWT+RBAC | Activity timeline |
| GET | /api/v1/actors/:id/mitre | JWT+RBAC | MITRE ATT&CK summary |
| GET | /api/v1/actors/:id/attribution | JWT+RBAC | A1: Explainable attribution (4-signal breakdown) |
| GET | /api/v1/actors/:id/aliases | JWT+RBAC | A2: Alias similarity suggestions |
| GET | /api/v1/actors/:id/corroboration | JWT+RBAC | A3: Multi-feed corroboration analysis |
| GET | /api/v1/actors/:id/dormancy | JWT+RBAC | B1: Dormancy status classification |
| GET | /api/v1/actors/:id/links | JWT+RBAC | C2: Scored IOC-actor links |
| GET | /api/v1/actors/:id/decay | JWT+RBAC | A4: Attribution confidence decay |
| GET | /api/v1/actors/:id/ttp-evolution | JWT+RBAC | B2: TTP evolution tracking |
| GET | /api/v1/actors/:id/shared-infra | JWT+RBAC | C1: Cross-actor infrastructure sharing |
| GET | /api/v1/actors/:id/provenance | JWT+RBAC | D1: Actor provenance export |
| GET | /api/v1/actors/:id/mitre-heatmap | JWT+RBAC | D2: MITRE ATT&CK heatmap data |
| GET | /api/v1/actors/:id/diamond | JWT+RBAC | A5: Diamond Model (4-facet completeness) |
| GET | /api/v1/actors/:id/false-flags | JWT+RBAC | B3: False flag detection |
| GET | /api/v1/actors/:id/predictions | JWT+RBAC | C3: Victimology prediction |
| GET | /api/v1/actors/compare?a=&b= | JWT+RBAC | D3: Actor comparison report |
| GET | /api/v1/actors/feed-accuracy | JWT+RBAC | D4: Per-feed actor accuracy |

## Prisma Model
`ThreatActorProfile` in `prisma/schema.prisma` — table `threat_actor_profiles`
- Enums: ActorType, ActorMotivation, ActorSophistication
- Unique constraint: (tenantId, name)
- Indexes: tenantId, active, actorType, motivation, country

## Config
| Env Var | Default | Purpose |
|---------|---------|---------|
| TI_THREAT_ACTOR_INTEL_PORT | 3008 | Service port |
| TI_THREAT_ACTOR_INTEL_HOST | 0.0.0.0 | Service host |
| TI_DATABASE_URL | - | PostgreSQL connection |
| TI_REDIS_URL | - | Redis connection |
| TI_JWT_SECRET | - | JWT signing secret |
| TI_SERVICE_JWT_SECRET | - | Service-to-service JWT |
| TI_CORS_ORIGINS | http://localhost:3002 | Allowed CORS origins |
| TI_RATE_LIMIT_MAX_REQUESTS | 100 | Rate limit per window |
| TI_LOG_LEVEL | info | Pino log level |

## Dependencies
- @etip/shared-types
- @etip/shared-utils
- @etip/shared-auth
- @prisma/client (ThreatActorProfile model)
- Reads from: IOC table (actor ↔ IOC linkage)
