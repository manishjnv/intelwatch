# Ingestion Service — Feature Documentation

**Module:** apps/ingestion | **Port:** 3004 | **Status:** ✅ Deployed | **Tests:** 276

## What It Does

Fetches threat intelligence from RSS feeds, processes articles through an 11-module pipeline, extracts IOCs, and queues them for normalization.

## Pipeline Flow

```
RSS Feed → Scheduler (cron) → Feed Fetch Worker (BullMQ)
  → Triage (Haiku AI — is this CTI-relevant?)
  → IOC Extraction (regex + optional Sonnet AI)
  → Context Extraction (sentence windowing around IOCs)
  → Deduplication (Bloom filter + Jaccard + optional LLM)
  → Per-IOC Processing:
      Corroboration → Source Triangulation → Confidence Calibration
      → IOC Reactivation → Lead-Time Scoring → Attribution Tracking
  → Cost Tracking (per-stage AI spend)
  → Feed Reliability Update
  → Persist Article + IOC contexts to DB
  → Queue IOCs → QUEUES.NORMALIZE
```

## Key Features

| Feature | File | What it does |
|---------|------|-------------|
| RSS Connector | `src/connectors/rss-connector.ts` | Parses RSS/Atom feeds via rss-parser |
| Feed Scheduler | `src/workers/scheduler.ts` | node-cron syncs active feeds every 5 min |
| Feed Fetch Worker | `src/workers/feed-fetch.ts` | BullMQ worker, fetches + runs pipeline |
| Triage | `src/services/triage.ts` | Rule-based + optional Haiku AI relevance filter |
| IOC Extraction | `src/services/extraction.ts` | 20+ IOC patterns + optional Sonnet deep extraction |
| Context Extractor | `src/services/context-extractor.ts` | Sentence/paragraph windowing around IOCs |
| Dedup | `src/services/dedup.ts` | 3-layer: Bloom filter → Jaccard → LLM |
| Corroboration | `src/services/corroboration.ts` | Cross-feed IOC sighting tracking |
| Source Triangulation | `src/services/source-triangulation.ts` | Independence-weighted confidence |
| Confidence Calibrator | `src/services/confidence-calibrator.ts` | Per-tenant precision calibration |
| IOC Reactivation | `src/services/ioc-reactivation.ts` | Detect expired IOCs reappearing |
| Lead-Time Scorer | `src/services/lead-time-scorer.ts` | Track which feed reports first |
| Attribution Tracker | `src/services/attribution-tracker.ts` | Preserve provenance chain |
| Cost Tracker | `src/services/cost-tracker.ts` | Per-stage AI cost (tokens + USD) |
| Reliability | `src/services/reliability.ts` | Feed source reliability scoring |
| AI Gate | `src/services/ai-gate.ts` | Master switch + per-tenant + budget control |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | None | Health check |
| GET | /api/v1/feeds | JWT | List feeds (paginated, filterable) |
| POST | /api/v1/feeds | JWT | Create feed |
| PUT | /api/v1/feeds/:id | JWT | Update feed |
| DELETE | /api/v1/feeds/:id | JWT | Delete feed |
| GET | /api/v1/articles | JWT | List articles (paginated) |

## Configuration

| Env Var | Default | Purpose |
|---------|---------|---------|
| TI_INGESTION_PORT | 3004 | Service port |
| TI_AI_ENABLED | false | Master AI switch |
| TI_AI_DAILY_BUDGET_USD | 0.50 | Per-tenant daily limit |
| TI_AI_MAX_TRIAGE_PER_FETCH | 10 | Haiku calls per fetch |
| TI_AI_MAX_EXTRACTION_PER_FETCH | 5 | Sonnet calls per fetch |
