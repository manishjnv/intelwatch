# Ingestion Service API — Port 3004

## Endpoints

### GET /health
- **Auth:** None
- **Response:** `{ status: "ok", service: "ingestion" }`

### GET /api/v1/feeds
- **Auth:** JWT Bearer
- **Query:** `page`, `limit`, `status`, `feedType`, `search`
- **Response:** `{ data: Feed[], pagination: { page, limit, total, totalPages } }`

### POST /api/v1/feeds
- **Auth:** JWT Bearer
- **Body:** `{ name, url, feedType: "rss", schedule: "*/30 * * * *", enabled: true }`
- **Response:** `201 { data: Feed }`

### PUT /api/v1/feeds/:id
- **Auth:** JWT Bearer
- **Body:** Partial feed fields
- **Response:** `{ data: Feed }`

### DELETE /api/v1/feeds/:id
- **Auth:** JWT Bearer
- **Response:** `204`

### GET /api/v1/articles
- **Auth:** JWT Bearer
- **Query:** `page`, `limit`, `feedSourceId`, `search`
- **Response:** `{ data: Article[], total, page, limit }`
