# AI Enrichment Service

**Full documentation:** [docs/modules/ai-enrichment.md](../../docs/modules/ai-enrichment.md)

Port 3006 | 314 tests | VT + AbuseIPDB + Haiku AI + GSB + IPinfo → risk scoring → store on IOC

## Features

| Feature | File | Description |
|---------|------|-------------|
| VT Lookup | providers/virustotal.ts | VirusTotal free API — IP, domain, hash, URL |
| AbuseIPDB Lookup | providers/abuseipdb.ts | AbuseIPDB — IP/IPv6 reputation |
| Haiku AI Triage | providers/haiku-triage.ts | Claude Haiku IOC classification |
| Rule-Based Scorer | rule-based-scorer.ts | Budget fallback — deterministic VT+AbuseIPDB scoring |
| Redis Cache (#6) | cache.ts | Type-specific TTLs (hash=7d, IP=1h, domain=24h) |
| Cost Tracker | cost-tracker.ts | Per-IOC per-provider cost transparency |
| STIX 2.1 Labels (#9) | stix-labels.ts | Auto-generate STIX indicator labels |
| Quality Score (#10) | quality-score.ts | Enrichment completeness meta-score (0-100) |
| Prompt Caching (#11) | providers/haiku-triage.ts | cache_control ephemeral — 90% token savings |
| Geolocation (#12) | service.ts | Country/ISP/Tor from AbuseIPDB for IP IOCs |
| Batch API (#13) | batch-enrichment.ts | Anthropic Batch API — 50% cost for 10+ IOCs |
| Cost Persistence (#14) | cost-persistence.ts | Redis flush/reload for cost data survival |
| Re-enrichment (#15) | workers/re-enrich-scheduler.ts | Cron for stale IOCs — type-specific TTLs |
| Google Safe Browsing | providers/google-safe-browsing.ts | GSB v4 — URL/domain/fqdn threat detection |
| IPinfo.io Geolocation | providers/ipinfo.ts | IP/IPv6 geolocation, ASN, VPN/proxy/Tor detection |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/v1/enrichment/trigger | JWT | Trigger enrichment for IOC |
| GET | /api/v1/enrichment/stats | JWT | Enrichment statistics |
| GET | /api/v1/enrichment/pending | JWT | List IOCs pending enrichment |
| POST | /api/v1/enrichment/batch | JWT | Submit batch enrichment (#13) |
| GET | /api/v1/enrichment/batch/:batchId | JWT | Check batch status (#13) |
| GET | /api/v1/enrichment/cost/stats | JWT | Aggregate cost stats |
| GET | /api/v1/enrichment/cost/ioc/:iocId | JWT | Per-IOC cost breakdown |
| GET | /api/v1/enrichment/cost/budget | JWT | Tenant budget status |

## Config

| Var | Default | Purpose |
|-----|---------|---------|
| TI_AI_ENABLED | false | Master switch for enrichment |
| TI_ANTHROPIC_API_KEY | '' | Haiku API key |
| TI_HAIKU_MODEL | claude-haiku-4-5-20251001 | Haiku model ID |
| TI_ENRICHMENT_DAILY_BUDGET_USD | 5.00 | Daily cost limit |
| TI_ENRICHMENT_CACHE_ENABLED | true | Redis cache toggle |
| TI_BATCH_ENABLED | false | Batch API toggle (#13) |
| TI_BATCH_MIN_SIZE | 10 | Minimum batch size (#13) |
| TI_REENRICH_INTERVAL_MS | 3600000 | Re-enrichment scan interval (#15) |
| TI_COST_PERSISTENCE_ENABLED | true | Cost Redis persistence (#14) |
| TI_GSB_API_KEY | '' | Google Safe Browsing API key |
| TI_GSB_RATE_LIMIT_PER_DAY | 8000 | GSB daily rate limit |
| TI_IPINFO_TOKEN | '' | IPinfo.io API token (free: 50k/mo) |
| TI_IPINFO_RATE_LIMIT_PER_DAY | 1200 | IPinfo daily rate limit (strategy budget) |
