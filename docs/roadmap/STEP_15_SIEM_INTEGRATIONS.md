# Step 15 — SIEM & security-stack integrations (push, pull, TAXII, detection-as-code)

**Roadmap:** docs/ROADMAP_S149_PLUS.md §3 step 15 · **Modules:** integration-service (Phase 1, in progress), ioc-intelligence (Phase 2, with Step 14 F6), drp-service / new asset connectors (Phase 4), agent-service (Phase 5, needs Step 10)
**Status:** 🔵 Proposed — Phase 1 in progress (S166) · Written 2026-09-28.
**Sequencing:** Phase 1 now; Phase 2+ after Step 14's ATT&CK Navigator heatmap (F6) exists, since Phase 2's coverage heatmap is built on top of it.

---

## 1. Purpose

Connect ETIP with the customer's security stack so intel flows **out** (IOCs, alerts, detection content) and security posture data flows **in** (rules, incidents, assets) — enabling coverage analytics (MITRE, threat actor, asset), rule effectiveness, and intel-driven detection engineering.

## 2. Integration modes — current

| Mode | Direction | Who configures | Effort for customer | Latency | What flows | Network requirement | Best for | Status in ETIP |
|---|---|---|---|---|---|---|---|---|
| **SIEM push connector** (Command Center → Users & Access → Integrations) | OUT | Tenant admin | 2–3 fields → Test → Save | Near real-time | IOCs/alerts to Splunk HEC, Microsoft Sentinel, Elastic, generic webhook (HMAC-signed, retries, dead-letter queue); tickets to Jira/ServiceNow | SIEM must be reachable from the internet | Teams already living in a cloud-reachable SIEM | Backend exists; UI being made real (S166 PRs A–C: outbound destination safety + encrypted credentials, persistence, easy-connect UI) |
| **REST API** (public API, API keys, OpenAPI docs, SDK) | OUT (pull by customer) | Tenant admin generates a key | Self-serve, docs-driven | On demand | Search, enrich, export IOCs/actors/vulns | None (customer calls us) | Custom automation & SOAR playbooks | Live (S125–S127) |
| **TAXII 2.1 feed** | OUT (poll by customer) | Tenant admin copies collection URL + key | Paste into SIEM/TIP's built-in TAXII client | Poll interval (customer-set) | STIX 2.1 objects from ETIP collections | Customer's side polls us; zero credentials stored on ETIP | SIEMs/TIPs behind the customer firewall with a built-in TAXII client (Sentinel, QRadar, OpenCTI, MISP, Splunk ES/apps) | Live (S127); planned "Your TAXII feed" card with copy URL + key on the Integrations tab |

**Which to choose**

| If the customer… | Use |
|---|---|
| Wants indicators inside their SIEM's own alerting/correlation, near real-time | SIEM push connector |
| Is building custom automation, a SOAR playbook, or a one-off script | REST API |
| Runs a SIEM/TIP with a built-in TAXII client and prefers not to hand ETIP any credentials | TAXII 2.1 feed |
| Can't expose the SIEM to the internet | TAXII 2.1 (customer polls out) or wait for the Bridge agent (§3, Phase 6) |

## 3. Future integration modes

| Mode | Direction | Purpose | Example targets | Phase |
|---|---|---|---|---|
| **SIEM read connector** (pull, read-only API creds) | IN | Detection rules/use cases (+ ATT&CK tags, enabled state), alerts/incidents (+ outcome), log-source/data-table inventory | Splunk REST (saved searches, Enterprise Security notables), Microsoft Sentinel (Security Insights API: analytics rules, incidents; Log Analytics query API), Elastic (Detection Engine rules API, alerts index), IBM QRadar (analytics rules, offenses APIs), Google SecOps/Chronicle (later) — verify exact API names at build time | P2 |
| **Inbound webhook / sightings** | IN | SIEM pushes incident-closed events and IOC sightings to ETIP; real-time outcomes; raises IOC confidence | Any SIEM with outbound webhook support | P3 |
| **Asset / CMDB / EDR / cloud inventory connectors** (pull) | IN | The right source of truth for assets — a SIEM alone is not | ServiceNow CMDB, Microsoft Defender, CrowdStrike, AWS/Azure/GCP inventory | P4 |
| **EDR/XDR IOC push** | OUT | Push block/alert indicators to endpoint and SIEM watchlists | Microsoft Defender / CrowdStrike custom IOC APIs, SIEM reference sets/watchlists | P4 |
| **Detection-as-code sync** | OUT (human-approved) | ETIP drafts Sigma rules for new actors/IOCs/campaigns, translates to SPL/KQL/EQL/AQL, delivers as (a) copy/download, (b) disabled draft rule via SIEM API, (c) pull request to the customer's detection repo — always human-approved, never auto-enabled | Splunk, Sentinel, Elastic detection repos | P5 |
| **TIP sharing** (bidirectional) | IN/OUT | MISP / OpenCTI sync; TAXII client to consume partner/ISAC feeds | MISP, OpenCTI, ISAC TAXII servers | P6 |
| **On-prem Bridge agent** (later) | IN/OUT | Small customer-side collector for SIEMs not reachable from the internet; makes outbound-only connections to ETIP; runs push + read connectors locally | Any on-prem SIEM | P6 |

Detection-as-code links to Steps 11–13 (AI Copilot / Rules / Playbooks).

## 4. Use cases — pull vs push

| Goal | Data needed | Best method | Cadence | ETIP output |
|---|---|---|---|---|
| MITRE ATT&CK coverage | Rules + technique tags + enabled state + log sources | PULL read connector | Daily | Heatmap: covered / partially covered (rule exists but data source missing) / gap |
| Threat-actor coverage | Nothing extra — actor TTPs in ETIP ∩ covered techniques | COMPUTED in ETIP | On change | Per-actor % covered + missing techniques ranked by actor relevance to tenant's sector/geo |
| Asset coverage | Asset inventory + which assets send logs | PULL CMDB/EDR/cloud + SIEM log-source list | Daily | Assets with no telemetry, crown-jewel gaps |
| Rule effectiveness | Alerts/incidents with outcome (TP/FP/benign, time-to-close) per rule | PULL incremental with cursor every 15 min (reliable) + optional webhook-in for real time | 15 min / live | Per-rule fire count, precision, noisy rules, never-fired rules, stale rules |
| IOC sightings | Matches of ETIP IOCs in customer logs | SIEM PUSHES back (webhook/TAXII sightings) | Live | Confidence boost, "seen in your environment" badge, actor activity signal |
| New rules for new actor/IOC | — | PUSH as disabled draft or PR, human approves | On new intel | Detection engineering backlog tied to coverage gaps |
| Block IOCs | — | PUSH to SIEM watchlists / EDR | Live | Automated indicator blocking |

**Principle:** push what ETIP produces and is time-sensitive; pull what the customer owns and ETIP analyzes, on a schedule, read-only; event webhooks only as an optional real-time layer on top of reliable pull; never pull raw logs — metadata only.

## 5. Recommended approach (best way)

Rule-metadata pull is the foundation: it unlocks MITRE coverage and threat-actor coverage with the least data and least risk. Incidents pull comes next, for rule effectiveness. Assets come after that. Detection-as-code comes last, because it needs coverage and effectiveness data to prioritize what to draft.

Rule → technique mapping: use the rule's own ATT&CK tags first; fall back to AI classification of the rule logic with a confidence score and analyst confirmation before it's trusted.

## 6. Phased roadmap

| Phase | Scope | Depends on | Size | Exit criteria |
|---|---|---|---|---|
| P1 (now, S166) | Real push connectors (Splunk HEC, Sentinel, Elastic, webhook) + TAXII card + outbound destination safety + encrypted credentials + persistent storage; remove non-existent QRadar/XSOAR cards | — | M | Tenant admin can add, test, and save a push connector or copy a TAXII feed URL; no fake connector cards remain |
| P2 | SIEM read connector v1 — detection rules for Splunk/Sentinel/Elastic → MITRE coverage heatmap (with Step 14 F6) + threat-actor coverage | Step 14 F6 (ATT&CK heatmap) | L | Tenant's rule set is pulled daily and technique coverage renders on the heatmap |
| P3 | Incidents/alerts pull + inbound webhook → rule effectiveness + IOC sightings | P2 | M | Per-rule fire/precision stats visible; sightings raise IOC confidence |
| P4 | Asset/CMDB/EDR connectors + EDR IOC push → asset coverage | P3 | L | Assets with no telemetry are listed; IOC push to at least one EDR works |
| P5 | Detection-as-code — AI-drafted Sigma for new actors/IOCs, translations, draft push / PR with approval | P2, P3, Step 10 (agent foundation), Steps 11–13 | L | Draft rule appears disabled in the SIEM or as a PR, never auto-enabled |
| P6 | On-prem Bridge agent; MISP/OpenCTI bidirectional; Chronicle/QRadar read | P2–P5 | L | Bridge agent completes one round-trip push+pull for an on-prem SIEM |

## 7. Security & privacy requirements

These are design requirements for every phase of this step, not a statement of current gaps:

- Read connectors use least-privilege, **read-only** credentials; the exact minimal role per SIEM is documented at build time.
- Credentials are encrypted at rest, masked in the UI and API, and rotatable.
- Outbound calls are restricted to public destinations, follow no redirects, and enforce timeouts and response-size caps.
- Every connector is isolated per tenant.
- Only metadata is transferred — no raw logs, no PII beyond what an incident record carries, and that is stripped/redacted before storage.
- Each connector requires explicit customer consent before it is enabled.
- Every sync and push is audit-logged.
- Rate limits and backoff apply per connector.
- Each tenant/connector has a kill switch.
- Data retention follows the tenant's policy.
- Plan gating (which tiers get which connectors) is enforced server-side, not only in the UI.

## 8. Data model sketch

| Entity | Purpose | Key fields |
|---|---|---|
| `Integration` | One configured connector | type, direction (push/pull), encrypted config, status, last success/failure timestamp, counters |
| `SyncCursor` | Resumable pull position | one row per connector + resource (e.g. rules, incidents) |
| `ExternalRule` | A rule pulled from the customer's SIEM | source, external id, name, enabled, techniques[], data sources[], last fired |
| `ExternalIncident` | An incident/alert pulled from the customer's SIEM | rule reference, outcome, timestamps |
| `Asset` | An asset from CMDB/EDR/cloud inventory | source, identifiers, telemetry-seen flag |
| Coverage snapshot | Daily rollup per tenant | used to render the heatmap and trend lines without re-querying raw rule/incident tables |

No code in this step's spec — the schema above is deliberately a sketch; the real Prisma models are written in the session that implements each phase.

## 9. Open questions for the owner

- Which SIEMs to build read connectors for first — Splunk, Sentinel, Elastic, or QRadar — given the target Indian mid-market?
- Plan gating: which tier gets read connectors (Teams, Enterprise, or both)?
- Bridge agent: build it, or rely on cloud-reachable SIEMs only for the foreseeable future?
- Detection-as-code: auto-create rules as disabled drafts inside the customer's SIEM, or PR-only into their detection repo?
