# Step 15 (v2) — Threat Exposure & Detection Posture

**Status:** 🟡 v2 APPROVED by owner 2026-09-28 — Phase 1 in progress (S166). Built from `docs/research/SIEM_POSTURE_MARKET_RESEARCH.md` (23 vendors, 6 SIEMs, 8 frameworks) plus the owner's intel-dashboard framing. Replaces v1 (v1 is in git history, commit 3dd4f19).

## Changes from v1

- Reframes the step's vision from "connect to the customer's SIEM" to **"Threat Exposure & Detection Posture"** — the connectors are plumbing; the product is the per-threat "Am I safe?" verdict plus an always-on posture overview.
- Adds a dashboard spec (v1 had none): Threat Exposure board (per-threat verdict cards) + Posture overview widgets, each with data source, computation, and refresh cadence.
- Adds a verdict decision table, confidence rules, and ranked-remediation ordering — none of this existed in v1.
- Adds the customer-advisory flow (proactive "what to do" notifications) — v1 only covered data plumbing, not customer-facing output.
- Reorders the phased plan for fastest time-to-value: v1's Phase 2 (read connector) is unchanged in position, but the new plan front-loads an MVP "Am I affected?" view built from data ETIP already has, before deeper SIEM read connectors.
- Adds least-privilege setup UX detail per SIEM (Sentinel/Elastic verified; Splunk ES-specific, Chronicle, QRadar checkbox names flagged UNVERIFIED) and a ≤5-minute setup wizard spec.
- Adds standards to adopt: MISP 3-state sighting model as the simple starting schema, STIX Sighting as the later upgrade, ATT&CK Navigator layer export, DeTT&CT-style visibility scoring, CTID Top Techniques weighting, pySigma for rule translation.
- Keeps v1's Phase 1 (S166 push connectors + TAXII card + outbound safety + encrypted credentials + persistence) fully intact — it is in progress and not touched by this proposal.
- Adds a "ways to connect" table separating what each connection type is *for*, plus a maturity-based recommended-combination table, so setup guidance doesn't collapse into "add every connector."

---

## 1. ETIP as a threat intel service provider — end-to-end flow

This is the spine the rest of this document hangs off. Steps ①–④ are what ETIP already does (ingestion → normalization → AI enrichment → global IOC catalog → delivery); ⑤–⑦ are what this step adds.

| Step | What happens | ETIP status |
|---|---|---|
| ① Ingest | Pull vulnerabilities, threat actors, campaigns, IOCs from OSINT feeds, commercial feeds, CERT-In/ISACs, ransomware leak-site trackers, news | Live — ingestion-service, 13+ connectors |
| ② Normalize | Dedupe, extract IOCs/CVEs/techniques, enrich (VT/AbuseIPDB/GSB/IPinfo/AI triage) into the global master DB | Live — normalization + ai-enrichment services |
| ③ Relevance | Match each threat to a tenant by industry, geo, tech stack, declared assets, and peer/competitor activity | Partial — DRP + customization hold tenant profile data; explicit relevance scoring is new in this step |
| ④ Deliver | Push/pull the relevant intel out: TAXII feed, REST API, SIEM push connector | Live (P1, S166 in progress) |
| ⑤ Assess | For each relevant threat, compute the tenant's posture: sightings, detection coverage, asset exposure, CVE status → a verdict ("Am I safe?") | **New — this step, P2+** |
| ⑥ Advise | Turn the verdict into a specific, prioritized action list the tenant can execute, with owners and due dates | **New — this step, P2 (basic advisories), P3 (tracking + channels)** (see §2) |
| ⑦ Track & learn | Follow actions to closure, ingest sightings/rule-effectiveness feedback, raise IOC/rule confidence over time | **New — this step, P3+** |

The owner's framing — "real attack on peer → was the intel ingested → is a detection use case available → is an asset exposed → is the customer safe → vulnerability status → detect or prone-to-exploit" — is steps ①→⑤ read end to end for one specific threat. §2 (Dashboard spec, Threat Exposure board) is the UI for this pipeline; §3 (Integration architecture) is what feeds it.

---

## 2. Customer advisories — proactive alerting on what to do

When a new vulnerability (especially KEV-listed or high-EPSS), threat-actor campaign, or industry/peer attack lands and matches a tenant (industry, geo, tech stack, or peer relevance), ETIP generates a **tenant-specific advisory**, not a generic feed item.

**Advisory contents:**

| Section | Content |
|---|---|
| (a) What happened + why it's relevant | Threat identity, source, and the specific match reason (your industry / your peer was hit / your declared tech stack / your geo) |
| (b) Posture verdict | Exposed assets, CVE patch status, detection coverage, IOC sightings, confidence — same fields as the per-threat verdict card (§3) |
| (c) Prioritized action checklist | Patch CVE-X on assets [Y]; enable/add a detection rule for technique Z — with a ready SIEM query generated via Sigma/pySigma; block the associated IOCs — auto-pushable to a SIEM watchlist or EDR; a retro-hunt query to check historical logs for this threat |
| (d) Owner + due date + status | Assigned to a user/team, due date, done-vs-outstanding tracking per checklist item (Defender Threat Analytics pattern) |
| (e) Delivery channel | In-app, email digest, Telegram/Slack/Teams, ticket (Jira/ServiceNow), or a SIEM notable/incident — selected by severity |

**Urgency tiers:** a flash advisory (immediate, all channels) for critical/actively-exploited vulnerabilities or confirmed sightings; a daily or weekly digest for lower-severity or informational relevance matches.

**Advisory quality rules (non-negotiable):**

- **No generic noise.** An advisory is only generated when the relevance match is real (industry/peer/geo/tech-stack/asset match) — never "here's today's CVE list."
- **Confidence and missing data are always shown**, never a silently-confident advisory built on stale or absent posture data (same rule as the verdict card, §3).
- **De-duplicate across sources.** The same underlying threat reported by multiple feeds (OSINT + CERT-In + a vendor advisory) produces one advisory, not three.

This reuses reporting-service's existing template/delivery machinery (Step 14 F8's India regulatory-mapping section is a sibling addition to the same service) rather than building a new notification system.

---

## 3. Dashboard spec

### 3a. Threat Exposure board

A list of recent threats relevant to the tenant (sources: ETIP's own feeds, CERT-In, ISACs, ransomware leak-site trackers, news — same source set as §2), each rendered as a verdict card.

**Verdict card fields:**

| Field | Source |
|---|---|
| Threat identity: campaign/actor name, first-seen date, targeted industry/region | ETIP feeds, threat-actor-intel |
| IOC sightings: count + list, each tagged fresh/stale by last-seen | ETIP IOC index/ES (P2), inbound sightings (P3) |
| Detection coverage per TTP: rule exists → enabled → validated/fired (three states) | SIEM read connector (P2/P4) |
| Exposure: internet-facing assets running the affected software/version | CMDB/EASM connector (P5) + DRP attack-surface data |
| CVE status per exploited vuln: patched / unpatched / mitigated / actively exploitable | vulnerability-intel (KEV/EPSS, already live) + vuln-scanner connector (P2) |
| Confidence | Computed — see below |
| Verdict | Computed from the decision table below |
| Ranked remediation | Computed — see below |
| Mitigations checklist | Done vs. outstanding, same list that feeds the advisory (§2c) |

**Verdict decision table** (evaluate top-down, first match wins):

| Sighting | Detection coverage | Exposure (affected s/w, internet-facing) | Vuln status | Verdict |
|---|---|---|---|---|
| Yes | any | any | any | **Exposed / Compromised** — page now |
| No | any | Yes | Actively exploitable (KEV/high EPSS/public exploit) & unpatched | **Prone to exploit** |
| No | No coverage for the TTPs | Yes | unpatched or mitigated-only | **Exposed** |
| No | Full coverage (enabled + validated) | Yes | unpatched | **Detectable only** |
| No | any | Yes | Patched | **Protected (patched)** |
| No | Full/partial coverage | No (not internet-facing / software absent) | n/a | **Protected (not exposed)** |
| No | No coverage | No | n/a | **Protected — blind-spot flagged** |

**Confidence rules:** HIGH only if asset/exposure data is < 30 days old **and** the relevant detection rule is validated/fired **and** the vulnerability scan is < 14 days old. Otherwise MEDIUM or LOW, naming the specific missing input ("no EASM data — exposure inferred from CMDB only"). Never silently green.

**Ranked remediation ordering:** 1) fixes that flip Exposed/Prone→Protected (patch the KEV CVE) rank above 2) fixes that flip Exposed→Detectable-only (enable/add the missing rule) rank above 3) hardening with no verdict change. Tie-break by effort (config change > patch cycle > new tool purchase).

### 3b. Posture overview widgets

| Widget | Data source | Computation | Refresh cadence | Confidence handling |
|---|---|---|---|---|
| Overall posture score | Rollup of all widgets below | Weighted composite (weights owner-tunable) | Daily | Shows component confidence, not just a number |
| Log-source health | SIEM read connector (data-source/connector health API) | DeTT&CT-style 5-dimension score (device completeness, field completeness, timeliness, consistency, retention) per source, 0–5 each | 15 min (live health) / daily (dimension recompute) | Missing dimensions shown as "unknown," not zero |
| ATT&CK coverage (relevance-weighted) | Pulled rules + technique tags + tenant's relevant actors' TTPs | CTID Top Techniques weighting (prevalence × choke-point × actionability) applied to raw coverage; three-tier per technique (exists / enabled / validated) | Daily | Flags techniques with no data source at all vs. no rule |
| Threat-actor coverage | threat-actor-intel (actors targeting tenant's industry/geo) ∩ covered techniques | % of that actor's TTPs covered, ranked by actor relevance to tenant | On change (actor profile update) | — |
| IOC coverage | ETIP high-confidence IOCs vs. what's pushed to SIEM watchlists + sightings | % deployed + sightings count; retroactive re-scan status per Google SecOps ATI pattern | Live (push) / 15 min (sightings poll) | Sightings marked fresh/stale |
| Asset & vuln exposure | CMDB/EASM + DRP + vulnerability-intel | Internet-facing count, KEV/EPSS-matched count, patch status, scan staleness | Daily | Staleness > 14–30 days visibly downgrades confidence |
| Rule health | SIEM read connector (incidents/alerts) | Picus three-lens: log source arriving / alert fires / performance — flags broken, noisy, silent, never-fired rules | 15 min (incidents pull) | — |
| Peer benchmark | Future — no researched vendor has a public methodology | Deferred; if built, publish ETIP's own methodology unlike the vendors researched | — | Marked "future" in UI until built |
| Trend | Daily coverage-snapshot rollup | Line/sparkline per widget above | Daily | — |

---

## 4. Ways to connect with the customer's SIEM — purpose and best use

| Connection type | Direction | Purpose | Best use | What it enables in the flow (§1) | Setup effort | When to recommend |
|---|---|---|---|---|---|---|
| TAXII 2.1 feed | OUT (customer polls) | Standard STIX delivery, zero credentials stored on ETIP | SIEMs/TIPs with a built-in TAXII client | ④ Deliver | Lowest — paste URL + key | Always offer first; safest default |
| REST API | OUT (customer pulls) | Custom automation, SOAR playbooks, enrichment lookups | Teams building their own tooling | ④ Deliver | Low — self-serve key | Any tenant with engineering capacity |
| SIEM push connector | OUT (ETIP pushes) | Get IOCs into the SIEM's own alerting/correlation, near real-time | Real-time blocking/matching inside the SIEM | ④ Deliver | Low — 2–3 fields + Test | Teams on a cloud-reachable SIEM wanting native alerting |
| SIEM read connector | IN (ETIP pulls) | Pull rules, incidents, data-source health | Posture, coverage, and rule-effectiveness computation | ⑤ Assess | Medium — least-priv credential wizard | Any tenant wanting the posture dashboard (§3) |
| Inbound sightings / webhook | IN (SIEM pushes to ETIP) | SIEM tells ETIP what it actually matched | Proves relevance, raises IOC/rule confidence, drives the "Exposed/Compromised" verdict branch | ⑤ Assess, ⑦ Track & learn | Medium — webhook config on SIEM side | Tenants past MVP wanting live sighting-based verdicts |
| Ticketing / ChatOps | OUT | Deliver advisory actions to the right owner | Action tracking, done-vs-outstanding (§2d) | ⑥ Advise, ⑦ Track & learn | Low — existing Jira/ServiceNow/webhook integration | Any tenant with an existing ticketing or chat tool |
| SIEM marketplace app | OUT/IN bundle | One-click bundle of feed + dashboards + rules | Fastest onboarding for supported SIEMs | ④ Deliver + ⑤ Assess in one install | Lowest, once built | Future — Splunkbase app, Sentinel Content Hub solution |
| On-prem Bridge agent | IN/OUT | Reach SIEMs not exposed to the internet | Air-gapped or firewall-restricted environments | ④/⑤ for otherwise-unreachable SIEMs | Highest | Only when TAXII pull-out isn't viable either |
| EDR/firewall push | OUT | Enforcement — block indicators at the endpoint/network layer | Automated indicator blocking | ⑥ Advise (auto-remediation) | Medium | Tenants wanting closed-loop response, later phase |

**Recommended combination by customer maturity:**

| Maturity | Recommended combination | What they get |
|---|---|---|
| Starter | TAXII feed + email/Telegram advisory digests | Relevant threats delivered passively; no posture verdicts yet |
| Mid | TAXII or push connector + SIEM read connector + one vulnerability-scanner connector | Full "Am I affected?" verdict cards (§3a) using data ETIP already has plus rule pull |
| Advanced | Full bidirectional (push + read + inbound sightings) + detection-as-code drafts | Live sighting-driven verdicts, rule-health scoring, AI-drafted detection content |

---

## 5. Integration architecture

- **Connectors:** SIEM read (rules, incidents, data-source health), SIEM push (IOCs to watchlists — live), sightings inbound (STIX Sighting or plain webhook), vulnerability scanner, asset/CMDB/EASM (+ ETIP DRP), EDR (later phase).
- **Retroactive IOC re-scan:** query the SIEM for matches against newly-added high-confidence IOCs over a configurable lookback window — the Google SecOps ATI pattern, implemented as a scheduled query rather than requiring SIEM-native retroactive scanning.
- **Normalization:** OCSF where the SIEM's data maps cleanly; otherwise ETIP's own connector-specific shape, matching the existing `ConnectorResult` pattern from ingestion.
- **Rule → technique mapping:** the rule's own ATT&CK tags first; AI classification of rule logic as a fallback, with a confidence score and mandatory analyst confirmation before it's trusted (never silently auto-trusted).
- **Exports:** ATT&CK Navigator layer JSON (public v4.5 spec) built from the coverage widget's per-technique scores.
- **Rule generation:** Sigma authored once, translated per SIEM via pySigma backends (Splunk SPL, Sentinel KQL, Elastic Lucene/ES|QL/EQL confirmed maintained backends); delivered only as disabled drafts or a pull request — never auto-enabled, requires human approval.

---

## 6. Setup UX spec

Target: ≤ 5 minutes per connector.

- **Wizard steps:** pick SIEM → paste/generate least-privilege credential → Test (mandatory, blocks Save on failure) → Save, read-only scope by default with an explicit opt-in for any write scope.
- **Least-privilege credentials per SIEM:**
  - Sentinel: Entra app registration + **Microsoft Sentinel Reader** role (+ **Log Analytics Reader** for table queries) — verified.
  - Elastic: API key with **Read privilege on the Rules Kibana feature** + Elasticsearch read on `.alerts-security.alerts-*` — verified.
  - Splunk: token/basic auth, role with `list_saved_search` + `search` — base capabilities verified; **Enterprise Security-specific read capabilities are UNVERIFIED, confirm before building the wizard copy**.
  - QRadar: Authorized Service Token bound to a read-only role/security profile at creation (immutable — recreate to rescope) — mechanism verified, **exact permission checkbox names UNVERIFIED**.
  - Google SecOps/Chronicle: **UNVERIFIED — no confirmed IAM role name; needs a dedicated follow-up before building this connector**.
- **Health indicator per connector:** last success/failure timestamp, counters, visible on the Integrations tab (extends the existing S166 push-connector card pattern).
- **Marketplace-app option (later):** Sentinel Content Hub solution, Splunkbase app — bundles connector + parsers + dashboards as one install, deferred to P6.

---

## 7. Phased plan (reordered for fastest time-to-value)

Phase 1 (S166, in progress) is unchanged and stays intact.

| Phase | Scope | Depends on | Size | Exit criteria |
|---|---|---|---|---|
| P1 (now, S166) | Real push connectors (Splunk HEC, Sentinel, Elastic, webhook) + TAXII card + outbound destination safety + encrypted credentials + persistent storage; remove non-existent QRadar/XSOAR cards | — | M | Tenant admin can add, test, and save a push connector or copy a TAXII feed URL; no fake connector cards remain |
| P2 | MVP "Am I affected?" using data ETIP already has (feeds, threat-actor-intel, vulnerability-intel KEV/EPSS, DRP) + ONE vulnerability-scanner connector + SIEM rule pull for Sentinel/Elastic (clean least-privilege paths) → verdict cards (§3a) + relevance-weighted ATT&CK/actor coverage (§3b) + **basic customer advisories (§2a–c: relevance + verdict + action checklist) in-app and by email, flash vs digest** — advisories are core provider value, so they ship in the MVP | Step 14 F6 (ATT&CK heatmap), P1 | L | A tenant sees at least one real verdict card computed from live data, the coverage widgets render for Sentinel or Elastic, and a relevant new KEV/actor event produces a tenant-specific advisory end to end |
| P3 | Inbound sightings/webhook (MISP-style 3-state model first) + retroactive IOC re-scan + IOC→watchlist sync + advisory action tracking (§2d owner/due/status) and extra channels (Telegram/Slack/Teams/ticketing, SIEM incident) | P2 | M | Sightings raise IOC confidence and flip a verdict card to Exposed/Compromised; advisory actions tracked to closure |
| P4 | Rule health/effectiveness (incidents pull, Picus three-lens) + Splunk/QRadar read connectors | P2, P3 | L | Per-rule fire/precision stats visible; broken/noisy/silent/never-fired rules flagged |
| P5 | Asset/EASM/EDR connectors + composite posture score + trend widgets | P4 | L | Assets with no telemetry listed; posture score renders with trend line |
| P6 | Detection-as-code (Sigma drafts via pySigma, disabled/PR-only) + peer benchmark (with published methodology) + on-prem Bridge agent + BAS/validation partnerships | P2–P5 | L | Draft rule appears disabled in the SIEM or as a PR, never auto-enabled |

---

## 8. Build vs. integrate table

| Capability | Build | Integrate |
|---|---|---|
| Verdict computation, decision table, confidence rules | Build — ETIP-specific logic | — |
| Sighting model | Build MISP-style 3-state first | Integrate STIX Sighting later if bidirectional TIP sync is added |
| ATT&CK Navigator layer export | Build (small, stable public schema) | — |
| Rule translation | — | Integrate pySigma + backends |
| Event normalization | — | Integrate OCSF where the source maps cleanly |
| Data-quality/visibility scoring | Build ETIP's own using the DeTT&CT method as reference | — |
| Technique weighting | — | Integrate CTID Top Techniques calculator/methodology |
| SIEM connectors (Sentinel/Elastic/Splunk/QRadar) | Build per-SIEM adapters | Reuse Step 9's connector plug-in interface |

---

## 9. Security & privacy requirements

Design requirements for every phase of this step, not a statement of current gaps:

- Read connectors use least-privilege, **read-only** credentials; the exact minimal role per SIEM is documented at build time (Splunk ES capabilities, Chronicle IAM role, QRadar checkbox names confirmed before that connector ships).
- Credentials are encrypted at rest, masked in the UI and API, and rotatable.
- Outbound calls are restricted to public destinations, follow no redirects, and enforce timeouts and response-size caps.
- Every connector is isolated per tenant.
- Only metadata is transferred — no raw logs, no PII beyond what an incident record carries, stripped/redacted before storage.
- Each connector requires explicit customer consent before it is enabled.
- Every sync, push, and advisory delivery is audit-logged.
- Rate limits and backoff apply per connector.
- Each tenant/connector has a kill switch.
- Data retention follows the tenant's policy.
- Plan gating (which tiers get which connectors/advisory channels) is enforced server-side, not only in the UI.

---

## 10. Data model sketch

Prose sketch only — the real Prisma models are written in the session that implements each phase.

| Entity | Purpose | Key fields |
|---|---|---|
| `Integration` | One configured connector (push or read) | type, direction, encrypted config, status, last success/failure, counters |
| `SyncCursor` | Resumable pull position | one row per connector + resource (rules, incidents) |
| `ExternalRule` | A rule pulled from the customer's SIEM | source, external id, name, enabled, techniques[], data sources[], last fired |
| `ExternalIncident` | An incident/alert pulled from the customer's SIEM | rule reference, outcome, timestamps |
| `Asset` | An asset from CMDB/EDR/cloud inventory | source, identifiers, telemetry-seen flag |
| `Sighting` | MISP-style sighting record | ioc/rule reference, type (TP/FP/expiration), source, org, seen-at |
| `ThreatVerdict` | A computed per-threat, per-tenant verdict (§3a) | threat reference, tenant, verdict enum, confidence, computed-at, component data references |
| `Advisory` | A generated customer advisory (§2) | tenant, threat reference, verdict reference, action checklist (with owner/due/status), channels sent, urgency tier |
| Coverage snapshot | Daily rollup per tenant | feeds the posture widgets and trend lines without re-querying raw rule/incident tables |

---

## 11. Open decisions for owner

- Which SIEM to build the first read connector for — Sentinel or Elastic (both have verified least-privilege paths) — vs. which vuln scanner to pair it with (Qualys/Tenable/Nessus/OpenVAS) for the target Indian mid-market.
- Plan gating: which tier gets read connectors and advisory channels beyond email (Teams, Enterprise, or both)?
- Advisory delivery channels to build first beyond in-app/email — Telegram (already wired for internal alerts) vs. Slack/Teams vs. ticketing.
- Marketplace apps (Sentinel Content Hub, Splunkbase): build now or defer to P6 as scoped?
- BAS/validation partnership (Picus/Cymulate/AttackIQ-style empirical validation) vs. building a lighter internal validator — partner or build later?
- Peer-benchmark data policy: what tenant data, if any, can be aggregated (anonymized) for a future peer-benchmark score, and does the owner want to publish ETIP's methodology unlike the vendors researched?
