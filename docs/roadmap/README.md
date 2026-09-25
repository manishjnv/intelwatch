# Roadmap specs — index

Master plan and order: `docs/ROADMAP_S149_PLUS.md` §3. **Start each session by reading the matching spec below.** Each spec has: goal, current state (file:line), flow, backend / frontend / data-model changes, tests, acceptance checks, rollback, session breakdown, owner decisions, risks.

| Order | Spec | What |
|---|---|---|
| 0 | STEP_00_DEV_WORKFLOW.md | Worktree per session, one deployer, review subagent; tooling bugs in /session-end and /review |
| 0B | **STEP_00B_URGENT_FIXES.md** | Cross-tenant reads, default secrets, Grafana exposure, Redis eviction, backups, MISP/REST queue bug |
| 1 | STEP_01_STAY_UP.md | Uptime alert, safe deploy, cleanup cron, backups + restore drill |
| 2 | STEP_02_SEARCH_INDEX.md | Index at normalization, ES fixes, backfill, ⌘K fix (7 sessions) |
| 3 | STEP_03_PERSISTENCE.md | All in-memory business stores → Postgres/Redis; CI guard |
| 4 | STEP_04_DB_ROLE_RLS.md | Least-privilege roles, RLS policies that actually apply |
| 5 | STEP_05_HONEST_UI.md | Error states instead of demo data, missing endpoints, real Clients, auto-enrich |
| 6 | STEP_06_CLEANUP.md | Empty folders, files >400 lines, DECISION-032 gate |
| 7 | STEP_07_CONSOLIDATE_RUNTIME.md | DECISION-032 draft, runtime-host pilot, ~7 deployables |
| 8 | STEP_08_OBSERVABILITY.md | Alert rules, Alertmanager, request-ID propagation, real metrics |
| 9 | STEP_09_CONNECTOR_PLUGINS.md | Connector SDK (source + sink), contract tests, SSRF-safe fetch |
| 10 | STEP_10_AGENT_FOUNDATION.md | agent-service: tools, delegated auth, cost cap, audit, approvals, evals |
| 11–13 | STEP_11_13_COPILOT_RULES_PLAYBOOKS.md | Copilot, Sigma/YARA/KQL/SPL rules, playbooks, retro-hunt |
| 14 | STEP_14_MORE_FEATURES.md | Sandbox, ATT&CK heatmap, vendor risk, India focus, browser extension |
| — | **VPS_CHECKS_PROMPT.md** | Read-only VPS checks to paste into Claude Code in VS Code (cloud sessions can't SSH) |
| ∥ | PARALLEL_REVENUE_GROWTH.md | Razorpay self-serve, SEO status, weekly threat brief |

Specs were written from the code on 2026-09-25. Line numbers drift, so re-check before editing.
