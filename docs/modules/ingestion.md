# Ingestion Service

**Port:** 3004 | **Queue:** etip-feed-fetch | **Status:** ✅ Deployed | **Tests:** 486

## What It Does

Fetches threat intelligence from RSS feeds, processes articles through an 11-module pipeline, extracts IOCs with 20+ regex patterns, and queues normalized IOCs for downstream processing.

## Pipeline

```
Feed Source (RSS/NVD/STIX/REST/MISP) → Scheduler (cron 5min sync)
  → Feed Fetch Worker (BullMQ)
  → Triage (rule-based + optional Haiku AI)
  → IOC Extraction (regex + optional Sonnet AI)
  → Context Extraction (sentence windowing)
  → Deduplication (Bloom + Jaccard + optional LLM)
  → Per-IOC: Corroboration → Triangulation → Calibration
           → Reactivation → Lead-Time → Attribution
  → Cost Tracking → Feed Reliability Update
  → Persist Article + IOC contexts
  → Queue IOCs → QUEUES.NORMALIZE
```

## Features

| Feature | File | Description |
|---------|------|-------------|
| RSS Connector | connectors/rss.ts | RSS/Atom feed parsing |
| NVD Connector | connectors/nvd.ts | NVD 2.0 REST API — CVE feeds with pagination + rate limiting |
| STIX/TAXII Connector | connectors/taxii.ts | TAXII 2.1 — collection discovery, basic auth, STIX indicator mapping |
| REST API Connector | connectors/rest-api.ts | Generic JSON REST — configurable fieldMap + responseArrayPath |
| MISP Connector | connectors/misp.ts | MISP REST API + flat file feed — 15 improvements: Object support, sighting confidence, warning list filtering, galaxy enrichment, to_ids filter, incremental fetch, exponential backoff, response size guard, attribute dedup, flat file feed, UUID passthrough, IPv6 detection, first_seen/last_seen, composite context |
| Scheduler | workers/scheduler.ts | node-cron feed sync every 5 min |
| Feed Fetch Worker | workers/feed-fetch.ts | BullMQ worker: fetch → pipeline → persist |
| Pipeline | workers/pipeline.ts | 5-stage article processing |
| IOC Patterns | workers/ioc-patterns.ts | 20+ IOC regex detection |
| Triage | services/triage.ts | Rule-based + Haiku relevance filter |
| Extraction | services/extraction.ts | Regex + Sonnet deep IOC extraction |
| Context Extractor | services/context-extractor.ts | Sentence windowing around IOCs |
| Dedup | services/dedup.ts | Bloom filter → Jaccard → LLM |
| Corroboration | services/corroboration.ts | Cross-feed sighting tracking |
| Source Triangulation | services/source-triangulation.ts | Independence-weighted confidence |
| Confidence Calibrator | services/confidence-calibrator.ts | Per-tenant precision bands |
| IOC Reactivation | services/ioc-reactivation.ts | Expired IOC re-sighting |
| Lead-Time Scorer | services/lead-time-scorer.ts | First-reporter tracking |
| Attribution Tracker | services/attribution-tracker.ts | Provenance chain |
| Cost Tracker | services/cost-tracker.ts | Per-stage AI spend (tokens + USD) |
| Reliability | services/reliability.ts | Feed reliability scoring |
| AI Gate | services/ai-gate.ts | Master switch + per-tenant + budget |

## API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | - | Health check |
| GET | /api/v1/feeds | JWT | List feeds (paginated, filterable) |
| POST | /api/v1/feeds | JWT | Create feed |
| PUT | /api/v1/feeds/:id | JWT | Update feed |
| DELETE | /api/v1/feeds/:id | JWT | Delete feed |
| GET | /api/v1/articles | JWT | List articles (paginated) |

## Config

| Env Var | Default | Purpose |
|---------|---------|---------|
| TI_INGESTION_PORT | 3004 | Service port |
| TI_AI_ENABLED | false | Master AI switch |
| TI_AI_DAILY_BUDGET_USD | 0.50 | Per-tenant daily limit |
| TI_AI_MAX_TRIAGE_PER_FETCH | 10 | Haiku calls per fetch |
| TI_AI_MAX_EXTRACTION_PER_FETCH | 5 | Sonnet calls per fetch |
| TI_NVD_API_KEY | (optional) | NVD API key for higher rate limits (50 req/30s vs 5) |
| TI_TAXII_URL | (optional) | STIX/TAXII 2.1 server discovery URL |
| TI_TAXII_USER | (optional) | TAXII basic auth username |
| TI_TAXII_PASSWORD | (optional) | TAXII basic auth password |
