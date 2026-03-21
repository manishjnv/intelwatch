# AI Enrichment Service API — Port 3006

## Endpoints

### GET /health
- **Auth:** None
- **Response:** `{ status: "ok", service: "ai-enrichment" }`

### POST /api/v1/enrichment/trigger
- **Auth:** JWT Bearer
- **Body:** `{ iocId: "uuid" }`
- **Response:** `202 { data: { iocId, status: "queued", message: "Enrichment job queued" } }`
- **Note:** Queues IOC for enrichment with priority 1. IOC must exist and belong to caller's tenant.

### GET /api/v1/enrichment/stats
- **Auth:** JWT Bearer
- **Response:** `{ data: { total: N, enriched: N, pending: N } }`

### GET /api/v1/enrichment/pending
- **Auth:** JWT Bearer
- **Query:** `page`, `limit`
- **Response:** `{ data: [{id, iocType, normalizedValue, confidence, severity, createdAt}], total, page, limit }`
