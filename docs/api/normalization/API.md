# Normalization Service API — Port 3005

## Endpoints

### GET /health
- **Auth:** None
- **Response:** `{ status: "ok", service: "normalization" }`

### GET /api/v1/iocs
- **Auth:** JWT Bearer
- **Query:** `page`, `limit`, `type` (ip/domain/hash_sha256/cve/...), `severity` (info/low/medium/high/critical), `lifecycle` (new/active/aging/expired/...), `tlp` (white/green/amber/red), `search`, `feedSourceId`, `minConfidence` (0-100), `sortBy` (lastSeen/firstSeen/confidence/createdAt), `sortOrder` (asc/desc)
- **Response:** `{ data: Ioc[], total, page, limit }`

### GET /api/v1/iocs/:id
- **Auth:** JWT Bearer
- **Response:** `{ data: Ioc }` or `404`

### GET /api/v1/iocs/stats
- **Auth:** JWT Bearer
- **Response:** `{ data: { total, byType: {ip: N, ...}, byLifecycle: {new: N, ...}, bySeverity: {low: N, ...} } }`
