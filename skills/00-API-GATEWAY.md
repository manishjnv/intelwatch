# SKILL: API Gateway
**ID:** 00-api-gateway | **Version:** 1.0
**Module path:** `/apps/api-gateway/`

## MANDATORY (read before implementing)
1. **00-claude-instructions** — coding rules, token efficiency, definition of done
2. **00-architecture-roadmap** — tech stack, phases, constraints
3. **00-master** — shared packages, error classes, API response shapes
4. **SKILL_SECURITY.md** — zero-trust rules, mTLS, HMAC signing

---

## MODULE DESCRIPTION

The API Gateway is the single entry point for all client traffic. It handles
JWT validation, tenant extraction, RBAC enforcement, rate limiting, request
routing, audit logging, and all transport-layer security. No service is
accessible without passing through the gateway.

**Tech:** Fastify 4.x + `@fastify/jwt` + `@fastify/rate-limit` + Nginx (upstream)

---

## CURRENT IMPLEMENTATION (Phase 1 + Phase 5)

- JWT validation on every request (except `/auth/*` public endpoints)
- Tenant ID extraction → PostgreSQL RLS enforcement
- RBAC `rbac()` middleware on every route
- Tiered rate limiting: Free 100/hr · Starter 1K/hr · Pro 10K/hr · Enterprise unlimited
- `X-RateLimit-*` headers on all responses
- Standard response envelope: `{ data, meta, error }`
- `traceId` on every error response via Pino structured logging
- REST API versioned under `/api/v1`
- WebSocket gateway (`wss://...?token={jwt}`) — tenant-broadcast events
- Cloudflare DDoS + Nginx SSL termination (edge layer)
- TAXII 2.1 endpoints (`/taxii/api-roots/*`)
- Webhook HMAC signing on outbound payloads

---

## PHASE 5 ADDITIONS

### mTLS Client Certificate Authentication
> **Priority:** P1 — ships alongside SIEM connector work in Phase 5.
> Required by enterprise finance/gov customers for server-to-server calls.

```nginx
# /infrastructure/nginx/etip.conf additions
# Enable optional client cert verification on /api/v1/integrations/* routes
server {
  ssl_client_certificate /etc/ssl/etip/ca-bundle.crt;
  ssl_verify_client      optional;
  ssl_verify_depth       2;

  location /api/v1/integrations/ {
    proxy_set_header X-Client-Cert-DN   $ssl_client_s_dn;
    proxy_set_header X-Client-Cert-Verified $ssl_client_verify;
    proxy_pass http://etip_api;
  }
}
```

```typescript
// packages/shared-auth/src/mtls-middleware.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';

/**
 * For routes requiring mTLS: validate that Nginx passed a verified client cert.
 * Only enforced on /api/v1/integrations/* and TAXII endpoints when tenant
 * has mTLS enabled in their integration config.
 */
export async function mtlsGuard(req: FastifyRequest, reply: FastifyReply) {
  const verified = req.headers['x-client-cert-verified'];
  const dn       = req.headers['x-client-cert-dn'] as string | undefined;

  if (verified !== 'SUCCESS' || !dn) {
    throw new AppError(401, 'Client certificate required', 'MTLS_REQUIRED');
  }

  // Attach cert DN to request for downstream audit logging
  (req as any).clientCertDn = dn;
}
```

**Tenant config (in customization-service):**
```typescript
// tenants.integration_config JSONB
{
  "mtls": {
    "enabled": true,
    "allowedCertDNs": ["CN=splunk.acme.com,O=Acme Corp,C=US"]
  }
}
```

**Endpoints:**
```
POST /api/v1/admin/tenants/:id/mtls/certificates   → Upload allowed cert DN (super_admin)
GET  /api/v1/admin/tenants/:id/mtls/certificates   → List allowed cert DNs
DELETE /api/v1/admin/tenants/:id/mtls/certificates/:certId → Revoke cert DN
```

---

### HMAC Inbound Request Signing
> **Priority:** P1 — extends existing outbound webhook HMAC to inbound API calls.
> Customers calling the API from their servers can sign requests for proof of origin.

```typescript
// packages/shared-auth/src/hmac-middleware.ts
import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@etip/shared-utils';

const HMAC_TOLERANCE_SECONDS = 300; // 5 min replay window

/**
 * Validate inbound HMAC-signed requests.
 * Header format:
 *   X-Signature: sha256=<hmac_hex>
 *   X-Timestamp:  <unix_epoch_seconds>
 *
 * Signing string: `${timestamp}\n${method}\n${path}\n${rawBody}`
 * Secret: tenant's API key secret (same as used for webhook signing)
 */
export async function hmacGuard(req: FastifyRequest, reply: FastifyReply) {
  const signature = req.headers['x-signature'] as string | undefined;
  const timestamp = req.headers['x-timestamp'] as string | undefined;

  if (!signature || !timestamp) return; // HMAC is optional — falls back to JWT

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > HMAC_TOLERANCE_SECONDS) {
    throw new AppError(401, 'Request timestamp out of tolerance', 'HMAC_REPLAY');
  }

  const rawBody = (req as any).rawBody as string ?? '';
  const signingString = `${timestamp}\n${req.method}\n${req.url}\n${rawBody}`;
  const tenantSecret  = await getTenantHmacSecret(req.user?.tenantId ?? '');

  const expected = 'sha256=' + crypto
    .createHmac('sha256', tenantSecret)
    .update(signingString)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new AppError(401, 'Invalid request signature', 'HMAC_INVALID');
  }
}
```

**SDK helper snippet (published to customers):**
```typescript
// How customers sign requests from their servers
function signRequest(method: string, path: string, body: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signingString = `${timestamp}\n${method}\n${path}\n${body}`;
  const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(signingString).digest('hex');
  return { 'X-Signature': signature, 'X-Timestamp': timestamp };
}
```

---

## PHASE 7 ADDITIONS

### Circuit Breaker Per Downstream Service
> **Priority:** P0 — ships with k6 load testing in Phase 7.
> Library: `opossum` npm package. Prevents cascading failures under load.

```typescript
// packages/shared-utils/src/circuit-breaker.ts
import CircuitBreaker from 'opossum';
import { logger } from './logger';

const BREAKER_OPTIONS = {
  timeout:            3000,   // 3s per request before failure
  errorThresholdPercentage: 50,  // open after 50% failures in rolling window
  resetTimeout:       30000,  // try again after 30s
  volumeThreshold:    10,     // min 10 calls before stats matter
};

/**
 * Wrap every inter-service HTTP call in a circuit breaker.
 * One breaker instance per downstream service, shared across requests.
 */
export function createServiceBreaker<T>(
  name: string,
  fn: (...args: any[]) => Promise<T>
): CircuitBreaker {
  const breaker = new CircuitBreaker(fn, { ...BREAKER_OPTIONS, name });

  breaker.on('open',    () => logger.warn({ service: name }, 'Circuit breaker OPEN'));
  breaker.on('halfOpen',() => logger.info({ service: name }, 'Circuit breaker HALF-OPEN'));
  breaker.on('close',   () => logger.info({ service: name }, 'Circuit breaker CLOSED'));
  breaker.fallback(()  => { throw new AppError(503, `${name} is unavailable`, 'SERVICE_UNAVAILABLE'); });

  return breaker;
}

// Usage in api-gateway/src/service-clients.ts:
// export const iocBreaker    = createServiceBreaker('ioc-service',    iocClient.get);
// export const graphBreaker  = createServiceBreaker('graph-service',  graphClient.get);
// export const huntBreaker   = createServiceBreaker('hunt-service',   huntClient.get);
// ... one per downstream service
```

**Health endpoint addition:**
```typescript
// GET /health returns circuit breaker state per service
{
  "status": "degraded",
  "services": {
    "ioc-service":    { "state": "closed",   "failures": 0 },
    "graph-service":  { "state": "open",     "failures": 12 },
    "hunt-service":   { "state": "halfOpen", "failures": 5 }
  }
}
```

---

### App-Layer Bot / Scraper Fingerprinting
> **Priority:** P2 — protects rate-limit quotas from automated abuse.
> Ships after load testing baselines established (Phase 7).

```typescript
// packages/shared-auth/src/bot-fingerprint.ts

/**
 * Lightweight behavioral fingerprinting for API requests.
 * Not a CAPTCHA replacement — a rate-limit defence layer.
 * Scores each request 0–100; high scores trigger rate-limit fast-path.
 */
export function scoreBotRisk(req: FastifyRequest): number {
  let score = 0;

  const ua = req.headers['user-agent'] ?? '';
  // Known headless browser signatures
  if (/HeadlessChrome|PhantomJS|Puppeteer|Playwright|selenium/i.test(ua)) score += 50;
  // Missing common browser headers
  if (!req.headers['accept-language']) score += 15;
  if (!req.headers['accept-encoding']) score += 10;
  // Suspiciously generic or blank user-agent
  if (!ua || ua.length < 20) score += 20;
  // Direct IP (no browser would skip the Host header)
  if (!req.headers['host']) score += 20;

  return Math.min(score, 100);
}

// Usage in rate-limit middleware:
// if (scoreBotRisk(req) >= 70) apply 10x stricter rate limit bucket
```

---

## PHASE 9 ADDITIONS

### GraphQL Gateway Endpoint
> **Priority:** P1 — add after Phase 4 graph-service + hunting-service are mature.
> Library: `@fastify/mercurius` (GraphQL server for Fastify).

```typescript
// apps/api-gateway/src/graphql/schema.ts
// Exposes: IOCs, ThreatActors, Graph relationships, Correlation results
// All resolvers call existing REST service clients — no direct DB access
// Subscriptions: map to existing WebSocket events (ioc.created, alert.triggered)
//
// Route: POST /api/v1/graphql
// Auth:  same JWT + RBAC middleware as REST — permission checked per resolver field
// Rate: GraphQL requests counted at query-complexity level, not per-HTTP-request

// Key types:
// type IOC { id, value, type, severity, enrichment, relatedActors, relatedMalware }
// type ThreatActor { id, name, aliases, ttps, campaigns, targetedSectors }
// type GraphNode { id, type, label, properties, edges }
// type Subscription { iocCreated: IOC, alertTriggered: Alert }
```

**Endpoints:**
```
POST /api/v1/graphql            → GraphQL query / mutation
GET  /api/v1/graphql            → GraphiQL IDE (dev + staging only, disabled in prod)
POST /api/v1/graphql/subscriptions → WebSocket-based GraphQL subscriptions
```

---

## FILE STRUCTURE

```
/apps/api-gateway/src/
  index.ts              # Fastify setup, plugin registration, server start
  routes.ts             # Route proxy definitions to downstream services
  middleware/
    jwt.ts              # JWT validation + user extraction
    rbac.ts             # Permission check per route
    rate-limit.ts       # Tiered + per-tenant rate limiting
    mtls.ts             # Phase 5: mTLS client cert validation
    hmac.ts             # Phase 5: inbound HMAC request signing
    bot-fingerprint.ts  # Phase 7: behavioral bot scoring
    circuit-breaker.ts  # Phase 7: per-service opossum breakers
  graphql/
    schema.ts           # Phase 9: GraphQL type definitions
    resolvers.ts        # Phase 9: resolver → service client mappings
    subscriptions.ts    # Phase 9: WebSocket GraphQL subscriptions
  health.ts             # /health + /ready endpoints with breaker states
  README.md
```

## TESTING REQUIREMENTS
- Unit tests: each middleware function (happy + all error branches)
- Integration tests: JWT expiry, RBAC denial, rate limit enforcement, mTLS rejection
- Load tests (Phase 7, k6): 1000 RPS sustained · p99 < 50ms at gateway layer
- Circuit breaker tests: verify 503 returned when downstream mock returns 500 × threshold
- Minimum 80% coverage
