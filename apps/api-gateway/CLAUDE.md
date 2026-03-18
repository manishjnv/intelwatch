# API Gateway Module

Routes all external requests. Handles JWT auth, rate limiting, tenant isolation.
Status: ✅ Deployed — Tier 1 FROZEN. Bug fixes only, no structural changes without /rca-check.

## Route Registration
All routes in src/routes/. Each file exports a Fastify plugin.
Register in src/routes/index.ts barrel export.

## Middleware Order (strict — never reorder)
1. requestId → 2. tenantExtract → 3. authenticate → 4. rateLimit → 5. rbac → 6. handler

## Key Files
- src/index.ts — Fastify server bootstrap (port 3001)
- src/routes/ — Route handlers
- src/middleware/ — Auth, rate limit, RBAC, tenant extraction
- src/plugins/ — Fastify plugins (cors, helmet, etc.)

## Dependencies
Imports: @etip/shared-types, @etip/shared-utils, @etip/shared-auth
References: user-service for auth verification

## API Response Format
All responses follow standard shapes from 00-MASTER.
Health endpoint: GET /health → { status, service, uptime, timestamp }

## Scope Rule
This module is ✅ Deployed (Tier 1 FROZEN). Only modify for:
- Bug fixes with test coverage
- Adding new route registrations (for new services)
- Never change middleware order or auth flow without explicit approval
