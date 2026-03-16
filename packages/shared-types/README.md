# @etip/shared-types

Central type registry for the Enterprise Threat Intelligence Platform (ETIP). All services import entity schemas, API response types, and queue payloads from this package.

## Usage

```typescript
import {
  CanonicalIOCSchema, type CanonicalIOC,
  PaginationQuerySchema, type PaginatedResponse,
  CACHE_TTL, AI_MODELS, PLATFORM_CONSTANTS,
} from '@etip/shared-types';
```

## Modules

| File | Contents |
|------|----------|
| `ioc.ts` | CanonicalIOC, IocType (14 types), TLP, Severity, IOC lifecycle states |
| `intel.ts` | ThreatActor, Malware, Vulnerability, NormalizedIntel, EntityType |
| `api.ts` | PaginatedResponse, ErrorResponse, PaginationQuery, RequestContext |
| `queue.ts` | BullMQ job payloads for all 12 queues |
| `user.ts` | User, Tenant, Role, AuditLog, FeatureFlag, JwtPayload |
| `stix.ts` | STIX 2.1 SDO/SCO type mappings, TLP marking definitions |
| `config.ts` | AI_MODELS, CACHE_TTL, PLATFORM_CONSTANTS, FeedConfig, EnvConfig |
