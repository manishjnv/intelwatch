# Feed Engine — `module-feeds`

Standalone **Feed Engine** module for the [IntelWatch](https://github.com/manishjnv/ti-platform) Threat Intelligence Platform.

This module handles all threat feed ingestion: fetching, normalizing, deduplicating, and scoring intel from 12 external sources. It runs as an independent FastAPI service and integrates with the main IntelWatch platform via a simple HTTP contract.

---

## Feeds Included (12 connectors)

| Feed | Source | Interval | API Key? |
|------|--------|----------|----------|
| NVD | nvd.nist.gov | 30 min | Optional |
| CISA KEV | cisa.gov | 6 hrs | No |
| URLhaus | urlhaus.abuse.ch | 1 hr | No |
| AlienVault OTX | otx.alienvault.com | 2 hrs | Yes |
| ThreatFox | threatfox.abuse.ch | 1 hr | No |
| MalwareBazaar | bazaar.abuse.ch | 2 hrs | No |
| VirusTotal | virustotal.com | 4 hrs | Yes |
| Shodan | shodan.io | 12 hrs | Yes |
| AbuseIPDB | abuseipdb.com | 4 hrs | Yes |
| CISA Advisories | cisa.gov | 6 hrs | No |
| Exploit-DB | exploit-db.com | 12 hrs | No |
| MITRE ATT&CK | attack.mitre.org | Weekly | No |

---

## Architecture

```
module-feeds/
  app/
    main.py          — FastAPI app, lifespan, platform registration
    config.py        — Settings (pydantic-settings, reads .env)
    models.py        — FeedSyncState, FeedConfig (feed.* PostgreSQL schema)
    schemas.py       — Pydantic request/response schemas
    routes/
      health.py      — GET /manifest, GET /health
      feeds.py       — GET /feeds, POST /feeds/{name}/trigger, PATCH /feeds/{name}/config
    services/
      registry.py    — CONNECTOR_REGISTRY (name → class)
      feeds/         — 12 connector classes + BaseFeedConnector
    worker.py        — RQ worker + run_feed() task
    scheduler.py     — APScheduler that queues jobs per feed interval
  migrations/
    001_init.sql     — CREATE SCHEMA feed + tables (auto-applied on startup)
  tests/
    conftest.py      — pytest fixtures (mocked DB + API client)
    test_routes.py   — Route smoke tests
```

---

## Quick Start (Dev)

```bash
# 1. Clone
git clone https://github.com/manishjnv/module-feeds.git
cd module-feeds

# 2. Configure
cp .env.example .env
# Edit .env — fill in API keys, point PLATFORM_URL at the main platform

# 3. Run everything
docker compose up -d

# API:       http://localhost:8001/docs
# Health:    http://localhost:8001/health
# Manifest:  http://localhost:8001/manifest
```

---

## API Endpoints

All endpoints except `/`, `/health`, and `/manifest` require the `X-Module-Key` header.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Root / status |
| `GET` | `/health` | Health check |
| `GET` | `/manifest` | Module contract (read by platform) |
| `GET` | `/feeds` | List all feeds with status |
| `POST` | `/feeds/{name}/trigger` | Manually trigger a feed sync |
| `POST` | `/feeds/trigger-all` | Trigger all enabled feeds |
| `PATCH` | `/feeds/{name}/config` | Update feed config (interval, enabled) |

---

## Platform Integration

On startup the module calls:

```http
POST {PLATFORM_URL}/api/v1/modules/register
X-Module-Key: {MODULE_API_KEY}

{ "url": "http://feed-engine:8001" }
```

The platform stores the URL and calls `/manifest` to discover capabilities. All subsequent API calls from the platform include `X-Module-Key` + `X-User-ID`/`X-User-Role` headers for auth context.

---

## DB Schema

The module uses a **dedicated `feed.*` PostgreSQL schema** isolated from the main platform's `public.*` schema. Tables are created automatically from `migrations/001_init.sql` on first startup.

Intel items are written to the shared `public.intel_items` table so the main platform can read them without any API round-trips.

---

## Tests

```bash
pip install -r requirements.txt pytest pytest-asyncio httpx
pytest tests/ -v
```

---

## Adding a New Feed

1. Create `app/services/feeds/my_feed.py` extending `BaseFeedConnector`
2. Add it to `CONNECTOR_REGISTRY` in `app/services/registry.py`
3. Add a scheduled job in `app/scheduler.py`
4. Add it to `migrations/001_init.sql` seed rows
