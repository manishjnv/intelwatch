# Module 20: Elasticsearch IOC Indexing Service
**Port:** 3020 | **Phase:** 7 | **Status:** ✅ Deployed | **Tests:** 116

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

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/v1/search/iocs | JWT | Full-text + faceted IOC search with pagination (wildcard or per-type index) |
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
