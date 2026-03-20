# SKILL: Master Platform Guide
**ID:** 00-master | **Version:** 3.0
**Read after 00-claude-instructions and 00-architecture-roadmap.**

## MONOREPO STRUCTURE
```
/platform
  /apps
    /api-gateway            # JWT auth, rate limit, route to services
    /ingestion-service      # Skill 04
    /normalization-service  # Skill 05
    /enrichment-service     # Skill 06
    /ioc-service            # Skill 07
    /threat-actor-service   # Skill 08
    /malware-service        # Skill 09
    /vuln-service           # Skill 10
    /drp-service            # Skill 11
    /graph-service          # Skill 12
    /correlation-service    # Skill 13
    /hunting-service        # Skill 14
    /integration-service    # Skill 15
    /user-service           # Skill 16
    /customization-service  # Skill 17
    /onboarding-service     # Skill 18
    /billing-service        # Skill 19
    /admin-service          # Skill 22
    /frontend               # Skill 20 (React SPA)
  /packages
    /shared-types           # Zod schemas + TypeScript types (all modules import from here)
    /shared-normalization   # Normalization engine
    /shared-enrichment      # Enrichment client + AI prompts
    /shared-auth            # JWT middleware, RBAC checker
    /shared-cache           # Cache service (Redis)
    /shared-audit           # Audit logger
    /shared-utils           # Service client, event bus, error classes
  /docs                     # Skill 01 — all documentation lives here
  /infrastructure           # Docker, Nginx, scripts
```

## MANDATORY DATA FLOW
```
Feed → [04] Ingest → [05] Normalize → [06] AI Enrich
     → Store (PostgreSQL) + Index (Elasticsearch) + Graph (Neo4j)
     → [13] Correlate → Alerts → [15] Integrate (SIEM/ITSM)
     → [23] Cache (48hr Redis)
```

## SECURITY REQUIREMENTS
- Zero-trust: every request validated (JWT + tenant + rate limit)
- RBAC on every route via `rbac()` middleware
- All mutations → audit log (non-negotiable)
- Secrets in `.env` only — never committed
- Zod validation on every API input
- RLS in PostgreSQL (every query filtered by tenant_id)

## FILE SIZE LIMIT
Maximum **400 lines** per file. Split into smaller files if exceeded.
This keeps each file reviewable in one Claude context window without truncation.

## ERROR CLASS
```typescript
// Use this — never throw raw Error() in services
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code: string = 'INTERNAL_ERROR',
    public details?: unknown
  ) { super(message) }
}
// e.g.: throw new AppError(404, 'IOC not found', 'NOT_FOUND')
```

## STANDARD API RESPONSE SHAPES
```typescript
// Success list: { data: T[], total: number, page: number, limit: number }
// Success single: { data: T }
// Created: { data: T } with status 201
// No content: status 204
// Error: { error: { code: string, message: string, details?: unknown } }
```

---

## CANONICAL BULLMQ QUEUE NAMES
> Added from Strategic Architecture Review v1.0 — Update 2 (P0)

All BullMQ queues use the `etip:` prefix. Every service MUST import these
constants from `packages/shared-utils/src/queues.ts` — never hardcode strings.

```typescript
// packages/shared-utils/src/queues.ts
export const QUEUES = {
  FEED_FETCH:          'etip:feed-fetch',
  FEED_PARSE:          'etip:feed-parse',
  NORMALIZE:           'etip:normalize',
  DEDUPLICATE:         'etip:deduplicate',
  ENRICH_REALTIME:     'etip:enrich-realtime',
  ENRICH_BATCH:        'etip:enrich-batch',
  GRAPH_SYNC:          'etip:graph-sync',
  CORRELATE:           'etip:correlate',
  ALERT_EVALUATE:      'etip:alert-evaluate',
  INTEGRATION_PUSH:    'etip:integration-push',
  ARCHIVE:             'etip:archive',
  REPORT_GENERATE:     'etip:report-generate',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
```

## CANONICAL EVENT TYPES
> Added from Strategic Architecture Review v1.0 — Update 2 (P0)

All cross-module events use dot-notation naming. Import from
`packages/shared-utils/src/events.ts`. Never invent event names.

```typescript
// packages/shared-utils/src/events.ts
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
} as const;

export type EventType = (typeof EVENTS)[keyof typeof EVENTS];
```

## SERVICE-TO-SERVICE JWT PATTERN
> Added from Strategic Architecture Review v1.0 — Update 2 (P0)

Internal service calls use short-lived JWTs (60 s TTL) signed with a shared
service secret. This prevents unauthorized inter-service communication even
inside the Docker network.

```typescript
// packages/shared-auth/src/service-jwt.ts
import jwt from 'jsonwebtoken';
import { AppError } from '@etip/shared-utils';

const SERVICE_JWT_SECRET = process.env.TI_SERVICE_JWT_SECRET!;
const SERVICE_JWT_TTL = 60; // seconds

export interface ServiceTokenPayload {
  iss: string;   // calling service name (e.g. 'enrichment-service')
  aud: string;   // target service name  (e.g. 'graph-service')
  iat: number;
  exp: number;
}

/** Sign an internal service-to-service token (60 s TTL). */
export function signServiceToken(
  callerService: string,
  targetService: string
): string {
  return jwt.sign(
    { iss: callerService, aud: targetService },
    SERVICE_JWT_SECRET,
    { expiresIn: SERVICE_JWT_TTL }
  );
}

/** Verify an incoming service token. Throws AppError on failure. */
export function verifyServiceToken(
  token: string,
  expectedIssuer?: string
): ServiceTokenPayload {
  try {
    const decoded = jwt.verify(token, SERVICE_JWT_SECRET) as ServiceTokenPayload;
    if (expectedIssuer && decoded.iss !== expectedIssuer) {
      throw new AppError(403, 'Unexpected service issuer', 'SERVICE_AUTH_FAILED');
    }
    return decoded;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(401, 'Invalid service token', 'SERVICE_TOKEN_INVALID');
  }
}
```

**Usage in Fastify preHandler:**
```typescript
import { verifyServiceToken } from '@etip/shared-auth';

// Middleware — attach to internal-only routes
async function serviceAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers['x-service-token'] as string | undefined;
  if (!header) {
    return reply.status(401).send({ error: 'Missing x-service-token header' });
  }
  req.servicePayload = verifyServiceToken(header);
}
```

**Add to `.env.example`:**
```bash
TI_SERVICE_JWT_SECRET=internal-dev-secret-change-in-prod
```
