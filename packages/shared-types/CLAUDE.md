# Shared Types Package

Central type definitions and Zod schemas for the entire platform.
Status: ✅ Deployed — Tier 1 FROZEN. Changes require cross-module impact analysis.

## What Goes Here
- Zod schemas that define API contracts
- TypeScript types derived from Zod (z.infer)
- Shared enums (severity levels, IOC types, entity statuses)
- Shared constants (only those needed by multiple modules)

## What Does NOT Go Here
- Service-specific types (keep in the service)
- Implementation details
- Utility functions (those go in shared-utils)

## Export Pattern
All types exported via src/index.ts barrel export.
Every module imports: `import { IocType, SeverityLevel } from '@etip/shared-types'`

## File Naming
- `{entity}.types.ts` — types + Zod schemas for an entity
- `common.types.ts` — shared pagination, response shapes
- `enums.ts` — all shared enums

## Scope Rule
This is Tier 1 FROZEN. Modifying it affects ALL downstream services.
Before any change:
1. List every module that imports from @etip/shared-types
2. Verify the change is backward-compatible (additive only)
3. If breaking: coordinate across all affected modules in same PR
4. NEVER remove or rename an exported type without checking consumers
