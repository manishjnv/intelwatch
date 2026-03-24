# Alerting Service (Module 23)

**Port:** 3023 | **Status:** ✅ Deployed | **Tests:** 306 (22 files) | **Endpoints:** 35

Real-time alert rule engine with notification channels, escalation policies, and alert lifecycle management.

## Features

| Feature | File | Description |
|---------|------|-------------|
| Alert Rules | services/rule-store.ts | CRUD + toggle, 5 types (threshold/pattern/anomaly/absence/composite) |
| Alert Lifecycle | services/alert-store.ts | FSM: open→ack→resolve/suppress/escalate, bulk ops |
| Notification Channels | services/channel-store.ts | Email, Slack, webhook with HMAC-SHA256 signing |
| Escalation Policies | services/escalation-store.ts | Multi-step auto-escalate with repeat |
| Rule Engine | services/rule-engine.ts | Event buffer, 5 condition types, composite AND/OR |
| Deduplication | services/dedup-store.ts | SHA-256 fingerprint, 5-min dedup window |
| Alert History | services/alert-history.ts | Immutable audit trail per alert |
| Alert Grouping | services/alert-group-store.ts | Incident fingerprint, 30-min group window |
| Rule Templates | services/rule-templates.ts | 6 built-in templates (IOC rate, feed absence, APT, anomaly, CVE, DRP) |
| Maintenance Windows | services/maintenance-store.ts | Suppress rules during scheduled windows |
| Notification Retry | services/notifier.ts | Exponential backoff (1s/4s/16s), 3 retries |
| Alert Search | services/alert-store.ts | Full-text across title/description/ruleName |
| BullMQ Worker | workers/alert-worker.ts | Consumes etip-alert-evaluate queue |

## API Endpoints (35)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v1/alerts/rules | Create alert rule |
| GET | /api/v1/alerts/rules | List rules (pagination, filters) |
| GET | /api/v1/alerts/rules/:id | Get rule detail |
| PUT | /api/v1/alerts/rules/:id | Update rule |
| DELETE | /api/v1/alerts/rules/:id | Delete rule |
| PUT | /api/v1/alerts/rules/:id/toggle | Enable/disable rule |
| POST | /api/v1/alerts/rules/:id/test | Dry-run rule |
| GET | /api/v1/alerts | List alerts |
| GET | /api/v1/alerts/:id | Get alert detail |
| POST | /api/v1/alerts/:id/acknowledge | Acknowledge alert |
| POST | /api/v1/alerts/:id/resolve | Resolve alert |
| POST | /api/v1/alerts/:id/suppress | Suppress alert |
| POST | /api/v1/alerts/:id/escalate | Manual escalation |
| GET | /api/v1/alerts/:id/history | Alert timeline |
| GET | /api/v1/alerts/search | Full-text search |
| POST | /api/v1/alerts/bulk-acknowledge | Bulk ack |
| POST | /api/v1/alerts/bulk-resolve | Bulk resolve |
| GET | /api/v1/alerts/stats | Alert statistics |
| POST | /api/v1/alerts/channels | Create channel |
| GET | /api/v1/alerts/channels | List channels |
| PUT | /api/v1/alerts/channels/:id | Update channel |
| DELETE | /api/v1/alerts/channels/:id | Delete channel |
| POST | /api/v1/alerts/channels/:id/test | Test notification |
| POST | /api/v1/alerts/escalations | Create escalation policy |
| GET | /api/v1/alerts/escalations | List policies |
| PUT | /api/v1/alerts/escalations/:id | Update policy |
| DELETE | /api/v1/alerts/escalations/:id | Delete policy |
| GET | /api/v1/alerts/templates | List rule templates |
| GET | /api/v1/alerts/templates/:id | Get template |
| POST | /api/v1/alerts/templates/:id/apply | Create rule from template |
| GET | /api/v1/alerts/groups | List alert groups |
| GET | /api/v1/alerts/groups/:id | Get group detail |
| POST | /api/v1/alerts/groups/:id/resolve | Resolve group |
| POST | /api/v1/alerts/maintenance-windows | Create window |
| GET | /api/v1/alerts/maintenance-windows | List windows |
| PUT | /api/v1/alerts/maintenance-windows/:id | Update window |
| DELETE | /api/v1/alerts/maintenance-windows/:id | Delete window |

## Config

| Var | Default | Purpose |
|-----|---------|---------|
| TI_SERVICE_PORT | 3023 | Service port |
| TI_ALERT_MAX_PER_TENANT | 5000 | Max alerts per tenant |
| TI_ALERT_RETENTION_DAYS | 90 | Alert retention |
| TI_REDIS_URL | redis://localhost:6379/0 | Redis for BullMQ |

## Queue

Consumes: `QUEUES.ALERT_EVALUATE` (`etip-alert-evaluate`)
