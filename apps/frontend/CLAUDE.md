# Frontend Module

React 18 SPA with TypeScript, Vite, Tailwind CSS, shadcn/ui.
Status: 🔨 Shell only — Tier 3 FREE. Active development welcome.

## UI Rules (non-negotiable)
- Dark mode is DEFAULT. All components must support both themes.
- Every entity name/IP/domain/hash/CVE/actor name = clickable → opens detail panel
- Every page has: top stats bar (platform-wide) + page-specific compact stats bar
- All important data has severity color coding
- Every feature has tooltip (hover) + inline help (? icon)
- Loading states: skeleton screens (never spinners alone)
- Empty states: actionable CTAs (never blank pages)
- 3D card hover effects via Framer Motion on interactive elements
- Collapsible sections on all detail views

## Responsive Breakpoints (test all)
375px (mobile), 768px (tablet), 1280px (laptop), 1920px (desktop)

## State Management
- Server state: TanStack Query v5 (cache, sync, pagination)
- Client state: Zustand v4 (lightweight global)
- Forms: React Hook Form + Zod resolver
- URL state: React Router v6

## Component Patterns
- Functional components only. No class components.
- shadcn/ui primitives as base. Custom components extend them.
- Keep components under 200 lines. Extract hooks to /hooks, utils to /utils.
- Co-locate: component + test + styles in same directory

## Build
- Vite 5.x with HMR
- TypeScript strict
- Tailwind CSS 3.x utility-first
- Path aliases: @/ → src/

## Scope Rule
This module is 🔨 WIP (Tier 3 FREE). Modifications welcome but:
- Don't change the routing structure without plan mode
- Don't add new dependencies without justification
- Keep shared types in @etip/shared-types, not local
