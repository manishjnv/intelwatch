# SKILL: Centralized Documentation System
**ID:** 01-docs | **Version:** 3.0
**Run after EVERY implementation — documentation is part of "done".**

---

## PURPOSE
Maintain a living, always-accurate documentation system. Every feature built must be documented immediately after implementation. Stale docs are worse than no docs.

---

## DOCUMENTATION STRUCTURE

```
/docs
  CHANGELOG.md                    ← Version history (update every build)
  ARCHITECTURE.md                 → Link to 00-architecture-roadmap SKILL.md
  README.md                       ← Platform overview + quickstart

  /features
    /{module-name}
      IMPLEMENTATION.md           ← How this feature was built (decisions, patterns)
      API.md                      ← All endpoints for this module
      SCHEMA.md                   ← Data models and Zod schemas
      TESTING.md                  ← Test coverage report + test cases list
      CHANGELOG.md                ← Module-specific change history

  /guides
    SETUP.md                      ← Local dev setup
    DEPLOYMENT.md                 ← VPS deployment guide
    FEED_INTEGRATION.md           ← Adding new intelligence feeds
    INTEGRATION_GUIDE.md          ← SIEM/ITSM integration guide

  /api
    openapi.yaml                  ← Auto-generated OpenAPI spec (Fastify swagger)

  /decisions
    ADR-001-database-choice.md    ← Architecture Decision Records
    ADR-002-caching-strategy.md
    ADR-003-archival-approach.md
    ...
```

---

## IMPLEMENTATION.md TEMPLATE

Copy this template for every new module/feature:

```markdown
# {Module Name} — Implementation Notes
**Module ID:** {id}
**Status:** In Progress | Complete | Deprecated
**Last Updated:** {date}
**Built in Phase:** {phase number}

## What Was Built
{1–2 sentences describing what this feature does}

## Key Implementation Decisions
1. **{Decision 1}** — {why this approach was chosen}
2. **{Decision 2}** — {why this approach was chosen}

## Files Created / Modified
| File | Purpose |
|---|---|
| `apps/{service}/src/{file}.ts` | {purpose} |

## Data Flow
{Step-by-step description of how data flows through this module}

## External Dependencies
- {Service/API}: {why used, how configured}

## Known Limitations / Technical Debt
- {Any known issues or future improvements}

## Testing Coverage
- Unit tests: {coverage %}
- Integration tests: {number of tests}
- E2E tests: {number of tests}

## API Endpoints Added
| Method | Path | Description |
|---|---|---|
| GET | /api/v1/{path} | {description} |
```

---

## CHANGELOG.md FORMAT

```markdown
# CHANGELOG

## [Unreleased]
### Added
- {feature description}
### Changed
- {change description}
### Fixed
- {bug fix description}

## [1.2.0] - 2025-03-15
### Added
- IOC pivot search with N-hop graph traversal (#42)
- AI-powered correlation rules engine (#38)
### Fixed
- Dashboard cache not invalidating on new IOC high severity (#44)
```

---

## API.md TEMPLATE

```markdown
# {Module} API Reference
**Base URL:** `/api/v1/{module}`
**Auth:** Bearer JWT required on all endpoints unless noted

## Endpoints

### GET /{resource}
**Description:** {what it returns}
**Auth:** Required | Optional | None
**Query Params:**
| Param | Type | Required | Description |
|---|---|---|---|
| page | number | No | Page number (default: 1) |
| limit | number | No | Items per page (default: 50, max: 500) |

**Response 200:**
```json
{
  "data": [...],
  "total": 1234,
  "page": 1,
  "limit": 50
}
```

**Response 400:**
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
```
```

---

## ARCHITECTURE DECISION RECORD (ADR) TEMPLATE

```markdown
# ADR-{NNN}: {Title}
**Status:** Proposed | Accepted | Deprecated | Superseded
**Date:** {date}
**Deciders:** {who made the decision}

## Context
{What situation required a decision}

## Decision
{What was decided}

## Rationale
{Why this option was chosen over alternatives}

## Alternatives Considered
1. **{Alternative A}** — rejected because {reason}
2. **{Alternative B}** — rejected because {reason}

## Consequences
**Positive:** {benefits}
**Negative:** {trade-offs}
```

---

## AUTO-DOCUMENTATION TOOLING

```typescript
// Fastify Swagger — auto-generates OpenAPI spec from route schemas
import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'

await app.register(swagger, {
  openapi: {
    info: { title: 'ETIP API', version: '1.0.0' },
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
    security: [{ bearerAuth: [] }]
  }
})

await app.register(swaggerUI, { routePrefix: '/api/docs' })
```

---

## POST-BUILD DOCUMENTATION CHECKLIST

After implementing any feature, verify:
- [ ] `IMPLEMENTATION.md` created/updated for the module
- [ ] `API.md` updated with new endpoints
- [ ] `SCHEMA.md` updated with new/changed models
- [ ] Root `CHANGELOG.md` updated with version entry
- [ ] Module `CHANGELOG.md` updated
- [ ] If architectural decision was made → create `ADR-{NNN}.md`
- [ ] OpenAPI spec regenerated (`npm run docs:generate`)
- [ ] Module `README.md` reflects current state
- [ ] `TESTING.md` updated with coverage report

---

## DOCUMENTATION QUALITY RULES
1. Docs must be updated **in the same commit** as the code they document
2. Never document future planned features in IMPLEMENTATION.md — only what exists
3. All code examples in docs must be **working, copy-pasteable code**
4. Every API endpoint must have at least one **request and response example**
5. Breaking changes must be flagged with `⚠️ BREAKING` in CHANGELOG
