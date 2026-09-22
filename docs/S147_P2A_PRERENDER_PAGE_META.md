# S147 — P2(a): Prerender Pipeline + Per-Route Page Meta (SEO plan 2.1)

**Date:** 2026-09-23 · **Branch:** `feat/seo-phase2a-prerender` (stacked on `feat/vps-hardening-seo-phase1`)
**Status:** ✅ **Deployed and verified 2026-09-23.** PR #21 merged as `9708a3c`; CI/CD run 35782468154 green (test → images → deploy).
**Module:** frontend only. No backend or shared-package changes.

## 1. Goal
Public pages must reach crawlers, including non-JS ones, as real HTML with correct per-route `<head>` tags, without a framework migration. This session builds the infrastructure. The only public page today is `/` (landing). Phase 2(b)–(d) add `/pricing`, `/features/*` and the other public pages by appending entries to one route table.

## 2. Design decisions
| Decision | Choice | Why |
|---|---|---|
| Prerender engine | **React `renderToPipeableStream` in Node** (SSR bundle via `vite build --ssr`), not Playwright as SEO_PLAN §3 proposed | No new dependency. No Chromium in the `node:20-slim` build stage (the plan flagged that as a risk). `onAllReady` waits for `React.lazy` chunks, so the server renders the **same `<App/>` tree** the client hydrates |
| Home output file | `dist/home.html`, served only for exactly `/` via nginx `location = /` | `dist/index.html` must remain the **empty SPA shell**. nginx serves it for every private route and for 404s. Prerendered landing markup there would flash landing content on `/dashboard` and break hydration |
| Meta source of truth | `src/seo/public-routes.ts` | The same table drives the client hook, the prerender step, and later the sitemap (2.4) |
| Client head updates | `usePageMeta` hook via a `RouteMeta` component inside `App` | About 50 lines, no react-helmet. LandingPage is design-locked and untouched |
| Browser storage during prerender | In-memory `localStorage`/`sessionStorage` installed by `prerender.mjs` | Stores read storage at module load (`auth-store`'s catch branch threw in Node). The snapshot is a logged-out first visit. App code is unchanged |

## 3. Bug found and fixed during implementation
**React 18 escapes `<style>` text during server rendering.** Verified with react-dom 18.3.1: `'SF Pro'` becomes `&#x27;SF Pro&#x27;` and `b>c` becomes `b&gt;c`. `<style>` is a raw-text element, so browsers never decode those entities. The landing page's frozen inline CSS would have broken (font-family dropped) and hydration would have reported a text mismatch.
**Fix:** `decodeStyleBlocks()` in `scripts/prerender-lib.mjs` decodes entities **inside `<style>` blocks only**, and aborts if the decoded content would contain `</style`. A negative-control test proves that leaving the entities encoded is detected as a hydration mismatch.

## 4. Files
| File | Change |
|---|---|
| `apps/frontend/src/seo/public-routes.ts` | **New.** `PUBLIC_ROUTES` (currently `/`), `SITE_URL`, `findRouteMeta`, `normalizePath`, `canonicalUrl` |
| `apps/frontend/src/hooks/use-page-meta.ts` | **New.** `applyPageMeta` (title, description, canonical, og:title/description/url, twitter:title/description; creates missing tags, never duplicates) and `usePageMeta(pathname)`. App routes fall back to site defaults with a self-canonical |
| `apps/frontend/src/entry-server.tsx` | **New.** `render(url)` renders `StrictMode > QueryClientProvider > StaticRouter > App` to a string once all lazy chunks resolve. Re-exports `PUBLIC_ROUTES` and `canonicalUrl` for the script |
| `apps/frontend/src/App.tsx` | Adds `<RouteMeta/>` (calls `usePageMeta(useLocation().pathname)`, renders nothing) |
| `apps/frontend/src/main.tsx` | Calls `hydrateRoot` when `#root` has prerendered children, otherwise `createRoot` as before |
| `apps/frontend/scripts/prerender-lib.mjs` | **New.** Pure helpers: `injectHead` (each tag must match exactly once or the build fails), `injectRoot`, `decodeStyleBlocks`, `outputPathFor` (`/` → `home.html`, `/a/b` → `a/b/index.html`; rejects anything that isn't lowercase kebab segments), `escapeAttr`/`escapeText` |
| `apps/frontend/scripts/prerender-lib.d.mts` | **New.** Types so TS tests can import the helpers |
| `apps/frontend/scripts/prerender.mjs` | **New.** Loads `dist-ssr/entry-server.js`, renders every public route, and writes the files into `dist/` |
| `apps/frontend/scripts/prerender-lib.test.mjs` | **New.** 9 `node:test` cases (runs on any Node, including the build stage) |
| `apps/frontend/src/__tests__/use-page-meta.test.tsx` | **New.** 8 vitest cases: route table invariants (no private paths, snippet lengths), tag creation/update, hook behaviour |
| `apps/frontend/src/__tests__/prerender-hydration.test.tsx` | **New.** 3 vitest cases: a real prerender → `hydrateRoot` round trip with zero recoverable errors or mismatch warnings, crawlable content present, and the negative control for §3 |
| `apps/frontend/nginx.conf` | `location = /` serves `home.html` (`no-cache`) and falls back to `index.html`. `location = /home.html { internal; }` prevents a duplicate URL |
| `Dockerfile.frontend` | Build stage runs `vite build`, then `vite build --ssr …`, then `node --test scripts/` (the build fails if helpers regress), then `node scripts/prerender.mjs` |
| `apps/frontend/package.json` | Scripts `build:ssr`, `prerender`, `build:prerendered`, `test:scripts`. No dependency changes, so the lockfile is untouched |
| `.gitignore` | `dist-ssr/` |

## 5. Behaviour change visible to users and crawlers
- `/` now returns full landing markup (h1 "IntelWatch", ETIP subtitle, status pill, CTAs) in the initial HTML instead of an empty `<div id="root">`. React hydrates it, with no flash and no re-render.
- `/` `twitter:description` now matches `og:description`. Before, it was a shorter variant.
- Private routes, 404s, headers and caching are unchanged.

## 6. Verification (local, 2026-09-23)
| Check | Result |
|---|---|
| `node --test scripts/` | 9/9 pass |
| New vitest suites (Node 22 via `npx node@22`) | 11/11 pass |
| **Full frontend suite** (Node 22) | **111 files, 1,796 passed, 2 skipped, 0 failed** |
| `tsc --noEmit` | 121 errors both before and after the change. **0 in new or changed files** (all existing: GlobalCatalogPage, GlobalMonitoringPage, 4 test files) |
| `vite build` → `vite build --ssr` → `prerender.mjs` | `/ → dist/home.html (13,521 bytes)`. Head diff against `index.html` is only `twitter:description`. CSS decoded, 0 leftover entities |
| Docker image build from a clean `git archive` context (same as CI checkout) | **Pass.** Linux Node 20.20.2: `node --test` 9/9, `prerender: / → dist/home.html (13,447 bytes)` |

**New tip:** frontend vitest *can* run on this machine. Use `npx --yes node@22 ../../node_modules/vitest/vitest.mjs run` from `apps/frontend`. This replaces the "CI is the only place frontend tests run" note in PROJECT_STATE.

## 7. Adding a public page (for 2(b)–(d))
1. Build the page component and add its `<Route>` in `App.tsx`. Import it **eagerly** or lazily; the prerender waits for lazy chunks either way.
2. Append `{ path, title, description }` to `PUBLIC_ROUTES`. Keep the title ≤ 70 characters and the description 50–170; the tests enforce both.
3. Nothing to change in nginx: `dist/<path>/index.html` is served by the existing `try_files $uri $uri/index.html`, without noindex.
4. The hydration test automatically covers every entry in `PUBLIC_ROUTES`.
5. Render must be deterministic: no `Date.now()`, `Math.random()` or `window` reads during render (use effects).

## 8. Container verification
**Local build:** passes from a clean context (`git -c core.autocrlf=false archive HEAD | docker build -f Dockerfile.frontend -`).
Building straight from the working tree fails **locally only**. `.dockerignore` lists `node_modules`, which Docker matches only at the context root, so `apps/frontend/node_modules` (Windows pnpm symlinks) is copied over the image's install and `vite` can't be found. CI's clean checkout has no `node_modules`, so it's unaffected. This predates S147 and was left as is (changing `.dockerignore` affects every image). Use the `git archive` form for local image builds.

**Running the container locally was declined**, so these checks run on the VPS after deploy. They extend the P1 grid:
```bash
docker exec etip_frontend nginx -t
```
| Request | Expected |
|---|---|
| `/` | 200, body contains `lp-title` (prerendered), `Cache-Control: no-cache`, no X-Robots-Tag |
| `/home.html` | 404 (internal only) |
| `/index.html` | 200, empty `#root` shell |
| `/dashboard`, `/login`, `/iocs/123` | 200, empty shell, `X-Robots-Tag: noindex, nofollow` |
| `/definitely-not-a-page` | 404, SPA shell body |
| `/robots.txt`, `/sitemap.xml` | 200 |
| `/assets/index-*.js` | 200, `Cache-Control: public, immutable` |
| `/assets/nope.js` | 404 |
| Browser: `/` | Renders the landing page with no console hydration errors; *Launch Platform* navigates to `/login` |

## 9. Rollback
Revert the branch merge commit. Because `location = /` falls back to `index.html`, even an image without `home.html` keeps serving `/`.

## 10. Live results (2026-09-23)
| Check | Result |
|---|---|
| `docker exec etip_frontend nginx -t` | ✅ test successful |
| etip containers | ✅ 32/32 healthy; VPS on `9708a3c` |
| `/` body contains prerendered landing (`lp-title`) | ✅ present (CSS rule + h1) |
| `/` landing CSS decoded | ✅ `font-family: 'SF Pro Display'` present, 0 `&#x27;` left |
| `/` headers | ✅ 200, `Cache-Control: no-cache`, no X-Robots-Tag |
| `/dashboard` | ✅ empty shell (no landing markup), `X-Robots-Tag: noindex, nofollow` |
| `/home.html` | ✅ 404 (no duplicate URL) |
| Unknown path | ✅ 404 |
| Browser console hydration check | ⏳ Owner to confirm (F12 on https://intelwatch.in; expect no hydration or "did not match" errors) |

