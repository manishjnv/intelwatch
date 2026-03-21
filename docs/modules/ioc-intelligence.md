# IOC Intelligence Service (Module 07)

**Port:** 3007 | **Queue:** N/A (reads from DB) | **Status:** 🔨 WIP | **Tests:** 105

## What It Does
Analyst-facing CRUD, search, pivot, lifecycle management, export, and bulk operations for IOCs.
Reads from the existing `iocs` table (normalization writes, this module reads + updates metadata).
Enriches IOC detail with computed accuracy signals (trend, actionability, density, recency).

## Pipeline
```
Normalization :3005 → writes IOCs to DB
IOC Intelligence :3007 → reads IOCs, provides analyst CRUD/search/pivot/export
                        → computes accuracy signals on read (A1-A5)
                        → propagates FP decisions to related IOCs (B1)
```

## Features
| Feature | File | Description |
|---------|------|-------------|
| Health check | routes/health.ts | GET /health, GET /ready |
| Config | config.ts | Zod-validated env vars (port 3007) |
| Auth | plugins/auth.ts | JWT + RBAC middleware |
| Error handler | plugins/error-handler.ts | AppError + ZodError handler |
| Zod schemas | schemas/ioc.ts | 9 schemas: list, create, update, bulk, search, export, params, override, profile |
| Repository | repository.ts | Prisma queries: CRUD, search, pivot, export, stats, subnet, feed stats |
| Service | service.ts | CRUD + lifecycle FSM + FP propagation + feed accuracy + enhanced export |
| IOC routes | routes/iocs.ts | 12 endpoints wired to service with auth + RBAC |
| Scoring (A1) | scoring.ts | Infrastructure density: /24 subnet IOC count → C2/shared/low |
| Scoring (A2) | scoring.ts | Confidence trend: linear regression on history → rising/falling/stable |
| Scoring (A3) | scoring.ts | Actionability: ransomware 30% + APT 25% + MITRE 20% + enrichment 15% + velocity 10% |
| Scoring (A4) | scoring.ts | Relationship inference: URL→domain, email→domain (pure string parsing) |
| Scoring (A5) | scoring.ts | Recency boost: 1.0 + 0.5×e^(-days/7) multiplied with confidence |
| FP propagation (B1) | service.ts | On false_positive → tag related IOCs with fp_review_suggested |
| Analyst override (B2) | repository.ts | Store confidence override with reason + audit trail in enrichmentData |
| Feed accuracy (B3) | service.ts + routes | Per-feed report: total, avgConfidence, FP rate, revoked count |
| Provenance export (D1) | service.ts | Include confidence breakdown in JSON/CSV export |
| Export profiles (D2) | scoring.ts + service.ts | high_fidelity (≥80), monitoring (≥40), research (all) |

## API
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | - | Health check |
| GET | /ready | - | Readiness check |
| GET | /api/v1/ioc | JWT | Paginated list with 10 filter params |
| POST | /api/v1/ioc | JWT+RBAC | Create manual IOC (analyst-submitted) |
| POST | /api/v1/ioc/bulk | JWT+RBAC | Bulk: set_severity, set_lifecycle, add/remove/set tags |
| GET | /api/v1/ioc/stats | JWT | Counts by type/severity/lifecycle + avg confidence |
| POST | /api/v1/ioc/search | JWT | Full-text search across value, tags, actors, malware |
| POST | /api/v1/ioc/export | JWT | CSV/JSON with profiles (D2) + provenance (D1) |
| GET | /api/v1/ioc/feed-accuracy | JWT | B3: Per-feed accuracy report |
| GET | /api/v1/ioc/:id | JWT | Detail with computed signals (A1-A5) |
| PUT | /api/v1/ioc/:id | JWT+RBAC | Update + B1 FP propagation + B2 analyst override |
| DELETE | /api/v1/ioc/:id | JWT+RBAC | Soft delete (lifecycle → revoked) |
| GET | /api/v1/ioc/:id/pivot | JWT | Related IOCs + A4 inferred relationships |
| GET | /api/v1/ioc/:id/timeline | JWT | Confidence history + lifecycle events |

## Accuracy Improvements Implemented
| ID | Name | What It Does | Unique? |
|----|------|-------------|---------|
| A1 | Infrastructure density | /24 subnet IOC count → C2 block (+10) or low density (-5) | Yes |
| A2 | Confidence trend | Linear regression on history → rising/falling/stable with slope | Yes |
| A3 | Actionability score | Separate "should I block?" score weighted by ransomware/APT/MITRE | Yes |
| A4 | Relationship inference | URL→domain, email→domain extraction for pivot enrichment | Partial |
| A5 | Recency-weighted ranking | Exponential decay boost for fresh IOCs in search ranking | Yes |
| B1 | FP propagation | On false_positive, tag same-feed and same-/24 IOCs for review | Yes |
| B2 | Analyst override | Confidence override with reason + audit trail in enrichmentData | Partial |
| B3 | Feed accuracy report | Per-feed: totalIocs, avgConfidence, FP rate, revoked count | Yes |
| D1 | Provenance export | Full confidence breakdown (feed/corroboration/AI/decay) in export | Yes |
| D2 | Export profiles | high_fidelity (≥80), monitoring (≥40), research (all) presets | Yes |
| D3 | Timeline | Confidence history + lifecycle events (from Chunk 1) | Partial |

## Config
| Env Var | Default | Purpose |
|---------|---------|---------|
| TI_IOC_INTELLIGENCE_PORT | 3007 | Service port |
| TI_IOC_INTELLIGENCE_HOST | 0.0.0.0 | Bind address |
| TI_DATABASE_URL | - | PostgreSQL connection |
| TI_REDIS_URL | - | Redis connection |
| TI_JWT_SECRET | - | JWT signing secret |
| TI_SERVICE_JWT_SECRET | - | Service-to-service JWT |
