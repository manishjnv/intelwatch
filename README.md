# IntelWatch ETIP v4.0

**Enterprise Threat Intelligence Platform**

A modular, multi-tenant threat intelligence platform built with Node.js, TypeScript, Fastify, and React.

## Architecture

```
/packages           ← Shared libraries (types, utils, cache, auth)
/apps               ← Microservices (api-gateway, ingestion, enrichment, etc.)
/docs               ← Documentation
/infrastructure     ← Docker, Nginx, CI/CD
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 LTS |
| Framework | Fastify 4.x |
| Language | TypeScript 5.x (strict) |
| Validation | Zod 3.x |
| Queue | BullMQ 4.x + Redis 7.x |
| Database | PostgreSQL (RLS) + Elasticsearch 8.x + Neo4j 5.x |
| Cache | Redis 7.x |
| AI | Anthropic Claude API |
| Frontend | React 18 + Vite + Tailwind + shadcn/ui |

## Shared Packages (Phase 1)

| Package | Description | Tests |
|---------|-------------|-------|
| `@etip/shared-types` | Zod schemas for all entities, API envelopes, queue payloads | 55 |
| `@etip/shared-utils` | Constants, AppError, date helpers, hash, IP validation, STIX IDs | 58 |
| `@etip/shared-cache` | Redis client, CacheService, TTL constants, key patterns | 40 |

## Getting Started

```bash
# Prerequisites: Node.js 20+, pnpm 9+
pnpm install
pnpm test         # 153 tests
pnpm typecheck    # 0 errors
pnpm build        # Compile all packages
```

## License

UNLICENSED — Proprietary
