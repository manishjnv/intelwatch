# Enterprise Integration Service (Module 15)

**Port:** 3015 | **Queue:** `etip:integration-push` | **Status:** 🔨 WIP | **Tests:** 174

## What It Does
Connects ETIP to external enterprise systems — SIEM (Splunk HEC, Sentinel, Elastic), SOAR webhooks, ticketing (ServiceNow, Jira), and STIX/TAXII 2.1 export. Pushes alerts/IOCs outbound and pulls events inbound for correlation.

## Pipeline
```
Alert/IOC created → BullMQ etip:integration-push → Integration Router
  → Check tenant integrations (enabled + matching trigger)
  → Transform via field mapping
  → Send to target (SIEM/webhook/ticket)
  → Log result (success/failure)
  → Retry on failure (3x exponential backoff)
  → Dead letter queue on exhausted retries
```

## Features
| Feature | File | Description |
|---------|------|-------------|
| Health check | routes/health.ts | GET /health, GET /ready |
| Integration CRUD | routes/integrations.ts | Create, list, update, delete integrations |
| SIEM adapters | services/siem-adapter.ts | Splunk HEC, Sentinel, Elastic SIEM push |
| Webhook service | services/webhook-service.ts | Outbound webhooks with retry + HMAC + DLQ |
| Ticketing | services/ticketing-service.ts | ServiceNow + Jira ticket creation + status sync |
| STIX/TAXII 2.1 | services/stix-export.ts | STIX bundle builder + TAXII server endpoints |
| Bulk export | services/bulk-export.ts | CSV/JSON/STIX bulk export |
| Field mapper | services/field-mapper.ts | Configurable field mapping with transforms |
| Integration store | services/integration-store.ts | In-memory store for configs, logs, DLQ, tickets |
| Event router (P0) | services/event-router.ts | BullMQ worker auto-dispatching etip:integration-push events |
| Field mapping defaults (P0) | services/integration-store.ts | Auto-populates default mappings per integration type |
| Credential encryption (P0) | services/credential-encryption.ts | AES-256-GCM encrypt/decrypt for stored credentials |
| Rate limiter (P0) | services/rate-limiter.ts | Per-integration token bucket rate limiting |
| Health dashboard (P0) | services/health-dashboard.ts | Uptime, success rate, last error per integration |

## API
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | - | Health check |
| GET | /ready | - | Readiness probe |
| POST | /api/v1/integrations | JWT | Create integration |
| GET | /api/v1/integrations | JWT | List integrations |
| GET | /api/v1/integrations/stats | JWT | Get integration stats |
| GET | /api/v1/integrations/:id | JWT | Get single integration |
| PUT | /api/v1/integrations/:id | JWT | Update integration |
| DELETE | /api/v1/integrations/:id | JWT | Delete integration |
| POST | /api/v1/integrations/:id/test | JWT | Test SIEM/ticketing connection |
| POST | /api/v1/integrations/:id/push | JWT | Push data to SIEM |
| GET | /api/v1/integrations/:id/logs | JWT | List integration logs |
| POST | /api/v1/integrations/:id/trigger | JWT | Trigger webhook |
| POST | /api/v1/integrations/:id/test-webhook | JWT | Test webhook delivery |
| GET | /api/v1/integrations/dlq | JWT | List dead letter queue |
| POST | /api/v1/integrations/dlq/:id/retry | JWT | Retry DLQ item |
| GET | /api/v1/integrations/taxii/discovery | - | TAXII 2.1 discovery |
| GET | /api/v1/integrations/taxii/collections | JWT | List TAXII collections |
| GET | /api/v1/integrations/taxii/collections/:id/objects | JWT | Get STIX bundle |
| POST | /api/v1/integrations/export | JWT | Bulk export (CSV/JSON/STIX) |
| POST | /api/v1/integrations/tickets | JWT | Create ticket from alert |
| GET | /api/v1/integrations/tickets | JWT | List tickets |
| POST | /api/v1/integrations/tickets/:id/sync | JWT | Sync ticket status |
| GET | /api/v1/integrations/health/dashboard | JWT | Integration health summary |
| GET | /api/v1/integrations/:id/health | JWT | Single integration health |

## Config
| Env Var | Default | Purpose |
|---------|---------|---------|
| TI_INTEGRATION_PORT | 3015 | Service port |
| TI_INTEGRATION_HOST | 0.0.0.0 | Bind address |
| TI_INTEGRATION_SIEM_RETRY_MAX | 3 | Max retry attempts for SIEM pushes |
| TI_INTEGRATION_SIEM_RETRY_DELAY_MS | 2000 | Base delay between retries (exponential) |
| TI_INTEGRATION_WEBHOOK_TIMEOUT_MS | 10000 | Webhook HTTP timeout |
| TI_INTEGRATION_WEBHOOK_MAX_PER_TENANT | 10 | Max webhooks per tenant |
| TI_INTEGRATION_TAXII_PAGE_SIZE | 100 | STIX/TAXII page size |
| TI_IOC_SERVICE_URL | http://localhost:3007 | IOC service for data queries |
| TI_GRAPH_SERVICE_URL | http://localhost:3012 | Graph service URL |
| TI_CORRELATION_SERVICE_URL | http://localhost:3013 | Correlation service URL |
| TI_INTEGRATION_ENCRYPTION_KEY | (dev default) | AES-256-GCM key for credential encryption |
| TI_INTEGRATION_RATE_LIMIT_PER_MIN | 60 | Default requests per minute per integration |
