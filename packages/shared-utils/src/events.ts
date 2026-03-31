/**
 * @module @etip/shared-utils/events
 * @description Canonical cross-module event types. Dot-notation naming.
 * All services MUST import from here — never invent event names.
 *
 * Source: 00-MASTER.md (Strategic Architecture Review v1.0 — Update 2)
 */

/** All cross-module event types */
export const EVENTS = {
  // Ingestion (04)
  FEED_FETCHED:              'feed.fetched',
  FEED_PARSED:               'feed.parsed',
  FEED_ERROR:                'feed.error',
  // Normalization (05)
  IOC_NORMALIZED:            'ioc.normalized',
  ENTITY_NORMALIZED:         'entity.normalized',
  // Enrichment (06)
  IOC_ENRICHED:              'ioc.enriched',
  ENRICHMENT_FAILED:         'enrichment.failed',
  ENRICHMENT_BUDGET_WARNING: 'enrichment.budget.warning',
  // Core Intel (07–10)
  IOC_CREATED:               'ioc.created',
  IOC_UPDATED:               'ioc.updated',
  IOC_EXPIRED:               'ioc.expired',
  ACTOR_UPDATED:             'actor.updated',
  MALWARE_DETECTED:          'malware.detected',
  VULN_PUBLISHED:            'vuln.published',
  // Advanced Intel (11–14)
  CORRELATION_MATCH:         'correlation.match',
  DRP_ALERT_CREATED:         'drp.alert.created',
  GRAPH_NODE_CREATED:        'graph.node.created',
  HUNT_COMPLETED:            'hunt.completed',
  // Downstream pipeline lifecycle
  ENRICHMENT_COMPLETE:       'enrichment.complete',
  ALERT_FIRED:               'alert.fired',
  INTEGRATION_PUSHED:        'integration.pushed',
  // Admin / Infrastructure (22)
  QUEUE_ALERT:               'queue.alert',
  QUEUE_ALERT_RESOLVED:      'queue.alert.resolved',
  // Global feed processing (DECISION-029)
  GLOBAL_IOC_UPDATED:        'global.ioc.updated',
  GLOBAL_IOC_CRITICAL:       'global.ioc.critical',
  // SCIM provisioning (I-12)
  SCIM_USER_PROVISIONED:     'scim.user.provisioned',
  SCIM_USER_DEPROVISIONED:   'scim.user.deprovisioned',
  // Billing (I-14)
  BILLING_PLAN_CHANGED:      'billing.plan.changed',
  // Audit & session security (I-15, I-16)
  AUDIT_INTEGRITY_VIOLATION: 'audit.integrity.violation',
  SESSION_SUSPICIOUS_GEO:    'session.suspicious.geo',
  // Offboarding lifecycle (I-19)
  OFFBOARDING_INITIATED:     'offboarding.initiated',
  OFFBOARDING_ARCHIVED:      'offboarding.archived',
  OFFBOARDING_PURGED:        'offboarding.purged',
  OFFBOARDING_CANCELLED:     'offboarding.cancelled',
  // Data retention (I-20)
  DATA_RETENTION_ENFORCED:   'data_retention.enforced',
  // Ownership transfer (I-21)
  DATA_OWNERSHIP_TRANSFERRED: 'data_ownership.transferred',
  // Break-glass emergency account (I-22)
  BREAK_GLASS_LOGIN:           'break_glass.login',
  BREAK_GLASS_FAILED:          'break_glass.failed',
  BREAK_GLASS_LOCKED:          'break_glass.locked',
  // Public API webhooks (I-23)
  WEBHOOK_DELIVERY_FAILED:     'webhook.delivery.failed',
  WEBHOOK_DELIVERY_DISABLED:   'webhook.delivery.disabled',
} as const;

/** Union type of all event type string literals */
export type EventType = (typeof EVENTS)[keyof typeof EVENTS];

/** Array of all event types (for subscription setup) */
export const ALL_EVENT_TYPES: EventType[] = Object.values(EVENTS);
