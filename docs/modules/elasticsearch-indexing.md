# Module 20: Elasticsearch IOC Indexing Service
**Port:** 3020 | **Phase:** 7 | **Status:** ✅ Deployed | **Tests:** 57

## Overview
BullMQ worker consumes `etip:ioc-indexed` events from normalization pipeline and indexes IOC documents into Elasticsearch using per-tenant index pattern `etip_{tenantId}_iocs`. Provides full-text + faceted search, aggregations, and reindex capabilities.

## Features

| Feature | File | Description |
|---------|------|-------------|
| EsIndexClient | src/es-client.ts | ping, ensureIndex, indexDoc, updateDoc, deleteDoc, search, bulkIndex, countDocs |
| IocIndexer | src/ioc-indexer.ts | indexIOC, updateIOC, deleteIOC, reindexTenant — high-level document ops |
| IocSearchService | src/search-service.ts | Full-text search, faceted filters (type/severity/TLP), aggregations, index stats |
| IocIndexWorker | src/worker.ts | BullMQ consumer on etip-ioc-indexed — routes index/update/delete actions |
| Multi-tenant isolation | src/es-client.ts | Index pattern etip_{tenantId}_iocs — one index per tenant |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/v1/search/iocs | JWT | Full-text + faceted IOC search with pagination |
| GET | /api/v1/search/iocs/stats | JWT | Index stats (doc count, size, shard status) per tenant |
| POST | /api/v1/search/reindex | JWT (admin) | Trigger full reindex for a tenant |
| GET | /health | none | Service health + esConnected + queueDepth |
| GET | /ready | none | Readiness probe |

## Config (TI_ env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| TI_ES_URL | http://elasticsearch:9200 | Elasticsearch connection URL |
| TI_REDIS_URL | redis://redis:6379 | BullMQ queue connection |
| TI_SERVICE_JWT_SECRET | — | Service-to-service JWT verification |
| TI_PORT | 3020 | Service listen port |

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
