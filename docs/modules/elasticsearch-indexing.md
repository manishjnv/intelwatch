# Module 20: Elasticsearch IOC Indexing Service
**Port:** 3020 | **Phase:** 7 | **Status:** ✅ Deployed | **Tests:** 166 (S152)

## Overview
BullMQ worker consumes `etip:ioc-indexed` events from normalization pipeline and indexes IOC documents into Elasticsearch using per-IOC-type indices (`etip_{tenantId}_iocs_{category}`). Provides full-text + faceted search, aggregations, reindex, and ILM lifecycle management.

## Features

| Feature | File | Description |
|---------|------|-------------|
| EsIndexClient | src/es-client.ts | ping, ensureIndex, ensureTypeIndex, indexDoc, updateDoc, deleteDoc, search, bulkIndex, bulkIndexMultiType, countDocs, setupIlmPolicy, setupIndexTemplate, reindexByQuery |
| IocIndexer | src/ioc-indexer.ts | indexIOC, updateIOC, deleteIOC, reindexTenant — routes to per-type indices |
| IocSearchService | src/search-service.ts | Full-text search with wildcard cross-type or targeted per-type index, faceted filters (type/severity/TLP), aggregations, index stats across 6 indices |
| IocIndexWorker | src/worker.ts | BullMQ consumer on etip-ioc-indexed — routes index/update/delete actions |
| Per-IOC-type indices | src/index-naming.ts | 14 IOC types → 6 index categories (ip/domain/hash/email/cve/other) |
| Type-specific mappings | src/mappings.ts | IP→geo_point/asn, hash→AV detections, CVE→EPSS/CVSS, domain→registrar/safeBrowsing |
| ILM lifecycle | src/ilm.ts | hot(0-7d) → warm(7-30d, forcemerge+readonly) → cold(30-90d, freeze) → delete(90d+) |
| Migration service | src/migration.ts | Reindex from legacy single index to per-type indices via ES _reindex API |
| Multi-tenant isolation | src/index-naming.ts | Index pattern etip_{tenantId}_iocs_{category} — per-type index per tenant |
| Shared contract (S152) | src/schemas.ts (re-exports `@etip/shared-utils/search-index`) | Worker validates every job against the shared `IocIndexJobSchema` + payload/tenant/iocId consistency; invalid jobs are dropped (logged), not thrown |
| Hash type fix (S152) | src/index-naming.ts | `hash_md5/sha1/sha256/sha512` → `hash` category (previously fell through to `other`); unmapped types → `other` |
| Update/delete robustness (S152) | src/es-client.ts, src/ioc-indexer.ts | `update` on a missing doc: index it if the payload is a full valid document, else warn + complete (no throw). `delete` targets the tenant wildcard via `deleteByQuery {ids}` so the IOC's type doesn't need to be known; 404 treated as success |
| Search hardening (S152) | src/es-client.ts | `simple_query_string` (was `query_string`, which 503'd on `a:b`/`http://x`) on value/normalizedValue/tags + exact-match boost on normalizedValue; `revoked`/`false_positive` hidden unless `includeInactive=true` |
| Tenant-safe index names (S152) | src/index-naming.ts | `assertSafeTenantId()` called before building any index name |
| Reindex tenant lock (S152) | src/routes/reindex.ts | Forces the doc's own `tenantId` rather than trusting the request body |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/v1/search/iocs | JWT | Full-text + faceted IOC search with pagination (wildcard or per-type index). `?includeInactive=true` (S152) shows revoked/false_positive docs, hidden by default. Tenant isolation: nginx-verified `x-tenant-id` + `tenant-guard.ts` (already in place from Step 0B — no separate JWT plugin added in S152) |
| GET | /api/v1/search/iocs/stats | JWT | Index stats (doc count across 6 type indices) per tenant |
| POST | /api/v1/search/reindex | JWT (admin) | Trigger full reindex for a tenant |
| POST | /api/v1/admin/migrate-indices/:tenantId | JWT (admin) | Migrate legacy single index to per-type indices |
| GET | /health | none | Service health + esConnected + queueDepth |
| GET | /ready | none | Readiness probe |

## Config (TI_ env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| TI_ES_URL | http://elasticsearch:9200 | Elasticsearch connection URL |
| TI_REDIS_URL | redis://redis:6379 | BullMQ queue connection |
| TI_SERVICE_JWT_SECRET | — | Service-to-service JWT verification |
| TI_PORT | 3020 | Service listen port |

## Index Categories

| Category | IOC Types | Extra Mappings |
|----------|-----------|----------------|
| ip | ip, ipv6, cidr, asn | geo (geo_point), asn, orgName, country, isScanner, abuseScore |
| domain | domain, fqdn, url | registrar, whoisCreated, isCdn, isPhishing, safeBrowsingVerdict |
| hash | md5, sha1, sha256, sha512 | fileType, fileSize, avDetections, avTotal, signatureNames |
| email | email | (common fields only) |
| cve | cve | cvssScore, epssScore, epssPercentile, isKEV, exploitStatus |
| other | bitcoin_address + unknown | (common fields only) |

## ILM Policy (`etip-ioc-lifecycle`)

| Phase | Min Age | Actions |
|-------|---------|---------|
| Hot | 0ms | priority 100 |
| Warm | 7d | forcemerge 1 segment, 0 replicas, read-only, priority 50 |
| Cold | 30d | freeze, priority 0 |
| Delete | 90d | delete |

## Queue

| Queue | Constant | Events handled |
|-------|----------|----------------|
| etip-ioc-indexed | QUEUES.IOC_INDEX (.replace(/:/g,'-')) | index / update / delete actions from normalization |

## Deploy Checklist (COMPLETE — Session 50)

- [x] Add service block to docker-compose.etip.yml (port 3020, depends on elasticsearch + redis)
- [x] Add build + recreate + health check steps to .github/workflows/deploy.yml
- [x] Add nginx upstream etip_es_indexing_backend + location /api/v1/search
- [x] Add COPY apps/elasticsearch-indexing-service/package.json to Dockerfile deps stage
- [x] Verify TI_ES_URL and TI_REDIS_URL set in VPS .env
- [x] RCA #42: BullMQ colon restriction fixed (dash replacement)
