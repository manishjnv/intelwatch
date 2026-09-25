# Steps 11–13 — F1 Copilot · F2 Detection rules · F3 Playbooks · F4 Retro-hunt

**Roadmap:** docs/ROADMAP_S149_PLUS.md §3 steps 11–13, Phase 5 F1–F4 · **Needs:** Step 10 (`STEP_10_AGENT_FOUNDATION.md`) live in production
**Status:** spec, not started. Written 2026-09-25. "Current state" rows checked against the repo on that date.
**Common rule:** every LLM call goes through agent-service (tools, cost cap, audit, approval). Other modules stay deterministic.

---

## F1 — AI Copilot (Step 11)

**Goal.** Analysts ask questions in plain English ("which critical IOCs hit our assets this week?", "what do we know about this hash?") and get a streamed answer with citations that open the real entity. Read-only: it may *propose* actions, never run them.

**Competitor reference.** Recorded Future AI, Google TI (Gemini), MS Security Copilot, CrowdStrike Charlotte, Anomali Copilot. All ground answers in their own data and cite it.

**Current state (verified).**

| Area | Today | File |
|---|---|---|
| NL query | None. Strategic review suggested `POST /api/v1/hunt/nl-query`; not built | `apps/hunting-service/src/routes/*` |
| Hunting "AI" | `AISuggestions` and `AIPatternRecognition` are heuristic only, `enabled: false` | `apps/hunting-service/src/index.ts:62-78`, `services/ai-suggestions.ts:107-122` |
| Layout | Sidebar + top bar + `<Outlet/>`; ⌘K opens `GlobalSearch` | `apps/frontend/src/components/layout/DashboardLayout.tsx` |
| ⌘K search call | `fetch('/api/v1/search?q=…')` — wrong path (route is `/search/iocs`) and **no auth header** → always 401 | `DashboardLayout.tsx:117` |
| Entity deep links | List pages ignore `?id=` (no `useSearchParams` in any data page), so a citation can't open an entity by URL | `apps/frontend/src/pages/*.tsx` |
| Entity preview | `InvestigationDrawer` (uses demo enrichment when real data missing) and `EntityPreview` exist | `components/investigation/InvestigationDrawer.tsx`, `components/viz/EntityPreview.tsx` |
| Markdown lib | none in frontend `package.json` | — |
| Frontend status | "UI FROZEN" | `docs/PROJECT_STATE.md:52` |

**Flow.**
```
[Copilot panel ⌘J]  or  [/copilot page]  or  [IOC detail → "Ask Copilot"]
      │ POST /api/v1/agent/conversations {surface:'copilot', pageContext:{type:'ioc',id}}
      │ POST …/:id/messages {text}  ──SSE──►  text / tool / usage / done{citations}
      ▼
agent-service  (read tools only for surface 'copilot')
      ▼
Answer text with tokens [[ioc:<uuid>]] ──► frontend turns them into CitationChips
CitationChip click ──► /iocs?id=<uuid>  (page opens its detail panel)
```

**Backend changes (agent-service only).**

| File | Change |
|---|---|
| `src/llm/system-prompts.ts` | `COPILOT_PROMPT`: role, "answer only from tool results", citation format `[[type:id]]`, "say you don't know", untrusted-text rule, short answers with bullet lists |
| `src/tools/registry.ts` | surface `copilot` = all read tools from Step 10 §6.1 |
| `src/routes/suggestions.ts` | `GET /api/v1/agent/suggestions?pageType=ioc&id=` → 3–4 starter questions (static templates, no LLM) |
| `src/loop/context.ts` | when `pageContext` is set, pre-load that entity with one read tool call and add it to the first user message (not the system prompt — keeps cache) |

Model: global AI config `agent.copilot_chat` (default tier `sonnet`), effort `medium`; titles via `agent.copilot_summary` (`haiku`, effort `low`).

**Frontend changes (`apps/frontend`, needs unfreeze D8).**

| File | Change |
|---|---|
| `src/hooks/use-agent-stream.ts` | `fetch` POST, read `ReadableStream`, parse SSE, expose `{messages, send, stop, status, usage}`; refresh token on 401 via existing `api.ts` logic |
| `src/components/copilot/CopilotPanel.tsx` | right-side slide-over (reuse `SplitPane`/drawer styles), toggled by top-bar button and ⌘J |
| `src/components/copilot/CopilotMessage.tsx` | tiny safe renderer: paragraphs, bullets, `code`; **no raw HTML, no images, no external links**; `[[type:id]]` → `CitationChip` (unverified IDs shown greyed) |
| `src/components/copilot/CitationChip.tsx` | chip with type icon + label; click → route map below |
| `src/components/copilot/ApprovalCard.tsx` | shows proposed action (from `approval_required`), links to approvals inbox |
| `src/pages/CopilotPage.tsx` + route `/copilot` in `App.tsx` | history list (left), chat (right), tabs "Chats" / "Approvals" / "Usage" |
| `src/pages/{IocListPage,ThreatActorListPage,MalwareListPage,VulnerabilityListPage}.tsx` | read `?id=` with `useSearchParams` and open the existing detail panel |
| `components/layout/DashboardLayout.tsx` | Copilot button + usage meter; also fix ⌘K fetch (path + auth) |

Citation route map: `ioc → /iocs?id=`, `actor → /threat-actors?id=`, `malware → /malware?id=`, `vuln → /vulnerabilities?id=`, `hunt → /hunting?id=`, `graph_node → /graph?focus=`, `drp_alert → /drp?alert=`, `alert → /command-center#alerts-reports`.

**Data model.** None new (Step 10 tables).

**API shapes.** Step 10 §17, plus `GET /api/v1/agent/suggestions` → `{data:[{text}]}`.

**Tests.** agent-service: prompt snapshot stable (cache), `pageContext` pre-load, suggestions per page type. Frontend (vitest): SSE parser (split chunks, heartbeats), renderer strips `<img>`/`<script>`/external links, CitationChip routes, `?id=` opens detail on each list page, panel keyboard toggle. Eval: +20 copilot cases (grounding, "don't know", citation).

**Acceptance.** (1) "Top 5 critical IOCs this week" answers in < 10 s first token, each IOC cited and clickable. (2) Asking about a value not in the tenant returns "no data in your tenant" — no invented facts. (3) Injected article text never shows up as an instruction followed. (4) Free-plan user sees an upgrade note, not the panel (`ai_agent` feature key). (5) Median cost per question < $0.01 with cache hits after turn 1.

**Sessions.**

| # | Module | Work | Size |
|---|---|---|---|
| 11a | agent-service | copilot prompt, surface tools, suggestions, page context, +20 eval cases | S |
| 11b | frontend | stream hook, panel, message renderer, citation chip | M |
| 11c | frontend | `/copilot` page, approvals + usage tabs, `?id=` deep links on 4 list pages, ⌘K fix | M |

**Owner decisions.** Which plans get Copilot (D3 in Step 10) · keyboard shortcut · unfreeze UI (D8) · show cost per answer to tenant admins (recommend yes).

**Risks.** Wrong answers → citation check + "don't know" eval cases. Slow first token → Sonnet tier + effort `medium`, stream early "Searching IOCs…" tool events. Empty data (ES has 0 docs, W3) → Step 2 is a hard prerequisite.

---

## F2 — Detection rules from intel: Sigma / YARA / KQL / SPL + push to SIEM (Step 12)

**Goal.** From IOCs, a malware family, an actor or ATT&CK techniques, produce detection rules in Sigma, YARA, KQL (Sentinel) and SPL (Splunk); validate them; store them; push to the customer's SIEM with approval.

**Competitor reference.** SOC Prime (Uncoder AI), Recorded Future (Autonomous Hunting), Google TI. Most only generate text; our edge is validate + push + track.

**Current state (verified).**

| Area | Today | File |
|---|---|---|
| Rule generation | None. UI module card already claims "YARA & Sigma rule management with natural language query interface" | `apps/frontend/src/config/modules.ts:87` |
| Hunt export | JSON / CSV / STIX only | `apps/hunting-service/src/services/hunt-export.ts:5` |
| Hunt query | Builds ES DSL but **never runs it** (no ES client; records 0 results) | `apps/hunting-service/src/routes/hunts.ts:142-162` |
| SIEM integration | **Push events only**: Splunk HEC `/services/collector/event`, Sentinel HTTP Data Collector (`ods.opinsights.azure.com/api/logs`, shared key), Elastic `/<index>/_doc`. No rule APIs, no query APIs | `apps/integration-service/src/services/siem-adapter.ts:104-200` |
| Sentinel push API | Uses the HTTP Data Collector API, which Microsoft announced for retirement on **14 Sep 2026** — verify; if retired, Sentinel push is already broken and must move to the Logs Ingestion API (DCR) | `siem-adapter.ts:153-175` |
| Integration store | In memory until Step 3 (S156) | `services/integration-store.ts` |
| ATT&CK data | Curated ~30 techniques with names/tactics; actor `ttps[]`, IOC `mitreAttack[]` | `packages/shared-normalization/src/attack-weighting.ts`, `prisma/schema.prisma:414,484` |
| Parsers | `yaml` 2.8 and `ajv` 8 are in the lockfile (transitive only) | `pnpm-lock.yaml` |

**Flow.**
```
UI "Generate rules" (from IOC list selection / malware / actor / technique)
  │ POST /api/v1/agent/rules/draft {source, formats[]}
  ▼
agent-service (surface 'rules')
  1. read tools → IOCs, techniques, malware context
  2. IOC-only rules → TEMPLATES (no LLM, free, exact)
     behaviour rules (techniques) → LLM (agent.rule_generation, effort high) → JSON {format, title, content, notes}
  3. POST hunting /api/v1/hunts/rules/validate  → errors? feed back to LLM once, else mark invalid
  4. POST hunting /api/v1/hunts/rules  (status 'validated' or 'invalid')
  ▼
User reviews in Hunting → "Deploy to SIEM" → write tool push_rule_to_siem → approval (Step 10 §11)
  ▼ approved
integration-service POST /api/v1/integrations/:id/rules  → Splunk saved search | Sentinel analytics rule | Elastic detection rule
  ▼
RuleDeployment row + AuditLog
```

**Templates (deterministic).** Sigma: `detection.selection.DestinationIp: [..]` / `DestinationHostname|endswith` / `Hashes|contains`. SPL: `(index=* ) (dest_ip IN (…) OR query IN (…))`. KQL: `CommonSecurityLog | where DestinationIP in (…)` and `DeviceFileEvents | where SHA256 in (…)`. YARA (hashes only): `import "hash"` + `hash.sha256(0, filesize) == "…"`. Max 500 values per rule; split larger lists.

**Validation (real parsers where possible).**

| Format | How | Where |
|---|---|---|
| Sigma | `yaml` parse + SigmaHQ JSON schema (vendored file) with `ajv`; check `logsource`, `detection.condition` references | hunting-service (new direct deps, already in lockfile) |
| YARA | compile with `yarac` (Debian `yara` package in the `node:20-slim` image) via `child_process` with 5 s timeout, rule text in a temp file | hunting-service; Dockerfile change (ops) |
| KQL | candidate: `@kusto/language-service-next` (parser behind monaco-kusto) — **verify in session**; fallback: bracket/pipe lint + Sentinel "test" on deploy | hunting-service |
| SPL | no public parser. Lint (balanced quotes/parens, known commands). If the tenant has Splunk query credentials (F4), call Splunk `GET /services/search/parser?q=` | hunting → integration |

**Backend changes.**

| Module | File | Change |
|---|---|---|
| agent-service | `src/rules/templates.ts`, `src/rules/draft.ts`, `src/routes/rules.ts` | template builders; LLM draft + one repair round; `POST /api/v1/agent/rules/draft` |
| hunting-service | `src/services/rule-validators.ts`, `src/services/rule-store.ts`, `src/routes/rules.ts` | validate, CRUD, list by source entity |
| integration-service | `src/services/siem-rule-deployer.ts`, `src/routes/rules.ts`, schema `SiemRuleConfig` | Splunk `POST /servicesNS/nobody/<app>/saved/searches`; Sentinel `PUT …/Microsoft.SecurityInsights/alertRules/{id}` (Azure AD app creds); Elastic Kibana `POST /api/detection_engine/rules` |

**Data model.**
```prisma
model DetectionRule {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String @map("tenant_id") @db.Uuid
  name String @db.VarChar(200)
  format String @db.VarChar(10)              // sigma | yara | kql | spl
  content String @db.Text
  source Json                                 // {type:'iocs'|'malware'|'actor'|'technique', ids:[...]}
  generatedBy String @map("generated_by") @db.VarChar(10)  // template | llm
  model String? @db.VarChar(60)
  status String @default("draft") @db.VarChar(12)          // draft|validated|invalid|deployed|retired
  validation Json @default("{}")
  createdBy String @map("created_by") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  deployments RuleDeployment[]
  @@index([tenantId, format, status])
  @@map("detection_rules")
}
model RuleDeployment {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String @map("tenant_id") @db.Uuid
  ruleId String @map("rule_id") @db.Uuid
  integrationId String @map("integration_id") @db.Uuid
  externalId String? @map("external_id") @db.VarChar(255)
  status String @db.VarChar(12)               // pending|deployed|failed|removed
  error String? @db.Text
  deployedAt DateTime? @map("deployed_at")
  rule DetectionRule @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  @@map("rule_deployments")
}
```

**API shapes.** `POST /api/v1/agent/rules/draft {source:{type,ids[]}, formats:['sigma','kql']}` → SSE then `{data:{ruleIds[]}}` · `POST /api/v1/hunts/rules/validate {format, content}` → `{data:{valid, errors:[{line,message}]}}` · `GET/POST/PUT/DELETE /api/v1/hunts/rules` · `POST /api/v1/integrations/:id/rules {ruleId, format, content, name, schedule?}` (write tool target; `integration:update`).

**Tests.** Template output golden files per format; validators reject broken samples (bad YAML, bad condition, YARA syntax error, unbalanced KQL); LLM repair loop capped at 1; deployer HTTP shapes with mocked Splunk/Azure/Kibana; analyst (no `integration:*`) can draft but not deploy; eval: 10 technique → Sigma cases judged for field names that exist in Sigma taxonomy.

**Acceptance.** 50 IOCs → 4 valid rules in < 5 s with $0 LLM cost (templates). Technique T1059.001 → Sigma rule that passes schema + a human review. Deploy to a Splunk test instance creates a saved search visible in Splunk; the same deploy without approval does nothing.

**Sessions.** 12a prisma (ask) S · 12b hunting-service validators + store + routes M · 12c agent-service templates + draft route M · 12d integration-service rule deployer (Splunk first, then Elastic, Sentinel) M · 12e frontend "Rules" tab in Hunting + "Generate rules" on IOC/malware/actor pages M · 12f ops: `yara` in backend image S.

**Owner decisions.** Postgres (above) vs Redis JSON for hunting data (DECISION-027 put hunting in Redis) · convert Sigma with a **pySigma sidecar** (accurate, adds Python) vs LLM + validators (no new language; recommended to start) · first SIEM to support (recommend Splunk) · whether the Sentinel push must be migrated now.

**Risks.** LLM rules with wrong field names → validators + "review before deploy" · noisy rules flood the SIEM → deploy as disabled/"test" by default · SIEM credentials with write rights → encrypted (Step 3), separate from ingest tokens.

---

## F3 — Light playbooks: trigger → conditions → actions, with approval (Step 13)

**Goal.** "IF critical IOC matches our assets → create Jira ticket + post to Slack + (with approval) push block rule." Deterministic runner; the LLM is optional (only an "enrich/summarise" action).

**Competitor reference.** ThreatConnect Playbooks, Anomali, Cyware Orchestrate, Tines (lighter no-code).

**Current state (verified).**

| Area | Today | File |
|---|---|---|
| Routing rules | integration-service already has **conditions → actions** rules (`route_to_siem`, `create_ticket`, `send_webhook`, `send_email`), trigger events, priority, dry-run. **But the event router never evaluates them** — it only pushes to integrations whose trigger matches | `schemas/integration.ts:519-560`, `services/alert-routing-engine.ts`, `services/event-router.ts:86-121` |
| Event input | Queue `etip-integration-push` fed only by alerting (`alert.created`) and correlation (`correlation.match`). `ioc.created`, `drp.alert.created`, `hunt.completed` are in the enum but nobody enqueues them | `alerting-service/src/workers/alert-worker.ts:205-217`, `correlation-engine/src/workers/correlate.ts:185-197` |
| Actions available | Jira/ServiceNow tickets (real HTTP), webhooks (+retry, DLQ), SIEM event push, alert channels email/slack/webhook | `services/ticketing-service.ts`, `webhook-service.ts`, `alerting-service/src/schemas/*` `ChannelTypeEnum` |
| Block actions | **No firewall/EDR integration exists** | grep `firewall|edr` → nothing |
| "Hunt playbooks" | Different thing: step-by-step hunt checklists | `hunting-service/src/services/hunt-playbooks.ts` |

**Decision proposed.** Build playbooks **inside integration-service** by growing the routing-rule engine (not a new `playbook-service`, per roadmap §6/§7). Approvals reuse the Step 10 inbox.

**Flow.**
```
alert.created | correlation.match | ioc.created* | drp.alert.created*   (*new producers)
      │  queue etip-integration-push  (existing)
      ▼
integration-service EventRouter
      ├─ existing: push to matching integrations
      └─ NEW: PlaybookMatcher → for each enabled playbook whose trigger+conditions match
               → PlaybookRun(pending) → queue etip-playbook-run (jobId = playbookId:eventId, dedup)
      ▼
PlaybookRunner worker (BullMQ, concurrency 5, per-tenant rate limit 30 runs/h)
   step 1 condition? → step 2 action → … (each step logged)
   action needsApproval? → agent-service POST /internal/actions {source:'playbook', runId, stepId}
        → run status 'waiting_approval' → approve in inbox → agent-service calls
          integration POST /internal/playbook-runs/:runId/steps/:stepId/resume
```

**Data model (trigger → conditions → actions).**
```prisma
model Playbook {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String @map("tenant_id") @db.Uuid
  name String @db.VarChar(100)
  enabled Boolean @default(false)
  trigger Json        // {event:'alert.created', filter:{severity:['critical']}}
  steps Json          // [{id,type:'condition'|'action', if?:[{field,op,value}], action?:{type,params,needsApproval}}]
  version Int @default(1)
  ownerId String @map("owner_id") @db.Uuid   // runs use this user's role for delegated tokens
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  @@index([tenantId, enabled])
  @@map("playbooks")
}
model PlaybookRun {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId String @map("tenant_id") @db.Uuid
  playbookId String @map("playbook_id") @db.Uuid
  playbookVersion Int @map("playbook_version")
  eventRef String @map("event_ref") @db.VarChar(128)
  status String @db.VarChar(20)   // pending|running|waiting_approval|succeeded|failed|cancelled
  stepLog Json @default("[]")     // [{stepId, status, startedAt, output, error}]
  startedAt DateTime @default(now()) @map("started_at")
  finishedAt DateTime? @map("finished_at")
  @@unique([playbookId, eventRef])
  @@map("playbook_runs")
}
```

**Actions v1.** `create_ticket` (Jira/ServiceNow), `send_webhook`, `notify_channel` (alerting email/Slack), `push_event_to_siem`, `enrich_ioc` (ai-enrichment `POST /api/v1/enrichment/trigger`), `update_ioc_lifecycle`, `add_to_hunt`, `summarise_with_ai` (agent-service, costed). Approval **forced on** for: `push_rule_to_siem`, `update_ioc_lifecycle`, and any future block action. Block on firewall/EDR = later plug-in (Step 9 connector interface).

**Backend changes (integration-service).** `schemas/playbook.ts` (Zod for trigger/steps; max 20 steps), `services/playbook-store.ts` (Prisma), `services/playbook-matcher.ts` (reuse `AlertRoutingEngine` condition code), `workers/playbook-runner.ts`, `routes/playbooks.ts`, `routes/internal.ts` (resume, service-token guarded). Wire `event-router.ts` to call the matcher. Producers: normalization/drp/hunting enqueue their events (one session each). Shared: `QUEUES.PLAYBOOK_RUN`, events `playbook.run.started/completed/failed` (ask first).

**API shapes.** `GET/POST /api/v1/integrations/playbooks`, `PUT/DELETE /:id`, `POST /:id/test {sampleEvent}` (dry run, no side effects, returns step plan), `POST /:id/enable`, `GET /:id/runs`, `GET /runs/:runId`, `POST /runs/:runId/cancel`. Permission: create/edit `integration:create`; view `integration:read`.

**Frontend.** Command Center "Integrations" tab gets a Playbooks list + form builder (trigger picker, condition rows like routing rules, ordered action cards with an "Requires approval" toggle), run history with step log, and 5 templates ("Critical IOC → Jira + Slack", "DRP typosquat → takedown ticket", …). No drag-and-drop canvas in v1.

**Tests.** Matcher truth table; dedup by `playbookId:eventRef`; runner resumes after crash (BullMQ); approval pause/resume; rate limit; dry-run makes zero HTTP calls; disabled playbook never runs; delegated token uses owner's role (analyst owner cannot run `integration:update` actions → step fails with `TOOL_FORBIDDEN`).

**Acceptance.** Critical alert → Jira ticket within 60 s, visible in run log. Approval-gated step waits, then completes after approve. Restart of integration-service mid-run → run finishes. 100 identical events → 1 run.

**Sessions.** 13a prisma (ask) S · 13b integration-service store + matcher + runner M · 13c integration-service routes + internal resume + wire event router M · 13d agent-service playbook source in approvals S · 13e producers: normalization `ioc.created` (critical/high only) S, drp S · 13f frontend builder + runs M.

**Owner decisions.** Playbooks in integration-service (recommended) vs new service · max active playbooks per plan (review doc says 100) · which actions need approval always.

**Risks.** Automation loops (playbook action creates an alert that triggers it again) → never trigger on events whose `source = playbook`, plus per-tenant rate limit · runaway tickets → dedup + daily cap per playbook · depends on Step 3 (integration persistence) — hard prerequisite.

---

## F4 — Retro-hunt: check the last 90 days of customer SIEM logs for new IOCs (Step 13)

**Goal.** When new critical/high IOCs arrive, search the customer's SIEM for any sighting in the past 90 days. Hits become a hunt (with evidence) and an alert.

**Competitor reference.** Anomali Match, Google TI (retro-hunt), Recorded Future SecOps.

**Current state (verified).**

| Area | Today | File |
|---|---|---|
| SIEM query APIs | **None.** integration-service only pushes (Splunk HEC, Sentinel Data Collector, Elastic `_doc`). HEC tokens and the Sentinel shared key **cannot run searches** | `siem-adapter.ts` |
| New-IOC signal | normalization IOC list supports `severity` + `sortBy=createdAt`; normalization pushes critical global IOCs to `etip-alert-evaluate` | `apps/normalization/src/schema.ts:63-70`, `workers/global-enrich-worker.ts:183` |
| Hunting | hunts, evidence, timeline exist (in memory until S159); no ES client; `bullmq` is already a dependency but unused | `apps/hunting-service/src/*`, `package.json` |

**Flow.**
```
hunting-service RetroHuntScheduler (every 60 min, per tenant with a query-enabled SIEM)
  1. GET normalization /api/v1/iocs?severity=critical|high&sortBy=createdAt  (since cursor)
  2. batch values by type (ip/domain/url/hash), ≤ 200 per batch
  3. job → queue etip-retrohunt (jobId = tenant:batchHash)
worker:
  4. POST integration /internal/siem/:integrationId/query {iocType, values[], lookbackDays:90}
       Splunk:   POST /services/search/jobs  search="search index=* earliest=-90d (dest_ip IN (…)) | stats count min(_time) max(_time) by dest_ip, host"  → poll → results
       Sentinel: POST https://api.loganalytics.io/v1/workspaces/{id}/query  (Azure AD app, KQL, timespan P90D)
       Elastic:  POST /<index>/_search  terms + range @timestamp ≥ now-90d, aggs by value
  5. hits → RetroHuntHit rows → create/extend hunt "Retro-hunt <date>" + evidence
         → enqueue alert (alerting) → playbook trigger possible (F3)
  6. cursor saved; cost = SIEM query count (per-tenant cap 24 jobs/day by default)
```

**Backend changes.** integration-service: `services/siem-query-adapter.ts` (3 backends, timeouts, result cap 1 000 rows), new encrypted **query credentials** on the integration (`SiemQueryConfig`: Splunk REST URL + token with `search` capability; Azure tenant/client/secret + workspace ID; Elastic URL + read API key), `routes/internal.ts` query endpoint (service-token guarded) and `POST /api/v1/integrations/:id/query-test`. hunting-service (already lists `bullmq`): `services/retrohunt-scheduler.ts`, `workers/retrohunt-worker.ts`, `routes/retrohunt.ts`. Shared (ask): `QUEUES.RETROHUNT`, event `retrohunt.hit`.

**Data model.**
```prisma
model RetroHuntJob { id String @id @db.Uuid @default(dbgenerated("gen_random_uuid()"))
  tenantId String @map("tenant_id") @db.Uuid; integrationId String @map("integration_id") @db.Uuid
  iocType String @db.VarChar(20); valueCount Int @map("value_count"); status String @db.VarChar(12)
  startedAt DateTime @default(now()) @map("started_at"); finishedAt DateTime? @map("finished_at"); error String?
  @@map("retrohunt_jobs") }
model RetroHuntHit { id String @id @db.Uuid @default(dbgenerated("gen_random_uuid()"))
  tenantId String @map("tenant_id") @db.Uuid; jobId String @map("job_id") @db.Uuid
  iocValue String @map("ioc_value"); firstSeen DateTime @map("first_seen"); lastSeen DateTime @map("last_seen")
  count Int; hosts String[] @default([]); huntId String? @map("hunt_id")
  @@index([tenantId, iocValue]) @@map("retrohunt_hits") }
```

**API shapes.** `GET /api/v1/hunts/retrohunt/jobs`, `GET /api/v1/hunts/retrohunt/hits?ioc=`, `POST /api/v1/hunts/retrohunt/run {iocIds[]}` (manual, `hunting:create`), `PUT /api/v1/hunts/retrohunt/settings {enabled, integrationIds[], severities[], lookbackDays≤90}`.

**Frontend.** Hunting page "Retro-hunt" tab (settings, job list, hits with links to hunt/IOC); IOC detail gets "Seen in your SIEM: N times, last …".

**Tests.** Query builders per backend (golden strings, value escaping — no injection into SPL/KQL); batching and cursor; job dedup; SIEM timeouts → job `failed`, no retry storm; hit → hunt evidence + alert; tenant A job never uses tenant B integration.

**Acceptance.** Seed a Splunk test index with one IP from 60 days ago → new critical IOC with that IP → hit within one scheduler cycle, hunt created with host + first/last seen. Removing the query credentials stops jobs cleanly.

**Sessions.** 13g integration-service query adapter + creds + test route (Splunk first) M · 13h hunting-service scheduler + worker + routes M · 13i integration-service Sentinel + Elastic backends M · 13j frontend tab S.

**Owner decisions.** First SIEM (recommend Splunk) · default lookback (90 d) and daily job cap · auto-create alerts on hits or only hunts.

**Risks.** Heavy SIEM searches cost the customer money/licence → small batches, `tstats`/summary where possible, job cap, off-hours schedule option · query credentials are powerful → read-only role documented, encrypted at rest · Sentinel needs an Azure AD app per customer (onboarding friction).
