# SIEM Posture / Threat-Informed Defense — Market Research

**Purpose:** ground Step 15 v2 (Threat Exposure & Detection Posture) in what detection-posture, TIP-to-SIEM, native-SIEM, and exposure-management vendors already do, so ETIP borrows proven ideas instead of re-deriving them. Research-only — no code, no build decisions locked here.

**Sources:** 5 research passes (23 vendors + 6 SIEMs + 8 frameworks), each vendor claim cited to a URL in its own section below. `UNVERIFIED` marks anything the public sources didn't confirm (pricing, exact API/role names, setup-time claims) — do not build against an UNVERIFIED item without a follow-up check.

---

## 1. Executive summary

1. Every major SIEM (Sentinel, Elastic, QRadar, Exabeam, CrowdStrike NG-SIEM) already ships a native MITRE ATT&CK coverage grid or a bundled companion (Splunk SSE) — a coverage heatmap alone is table stakes, not a differentiator.
2. The single best "sighting" mechanic found across 23 vendors is Google SecOps' Applied Threat Intelligence: automatic retroactive re-scan of ALL historical telemetry the instant a new IOC arrives, plus forward matching from then on.
3. No detection-posture or TIP vendor in this research combines first-party threat intel + industry/peer attack tracking + vulnerability intel (KEV/EPSS) + attack-surface data in one platform the way ETIP's existing modules already do — this is ETIP's structural advantage, not a feature to build from scratch.
4. Detection-posture tools (CardinalOps, SOC Prime, Tidal, Interpres) are read-only/passive audits against ATT&CK; BAS tools (Picus, AttackIQ, SafeBreach, Cymulate) are active — they fire real attacks and check whether detections trigger. Best-in-class combines both; ETIP's MVP should do only the passive side first.
5. Picus DRV's three-lens rule-health model (log source arriving / alert fires / rule performance) is more diagnostic than a binary covered/not-covered grid and is cheap to compute once incident/rule metadata is pulled.
6. DeTT&CT's five-dimension data-quality score (device completeness, field completeness, timeliness, consistency, retention) feeding a 0–4 per-technique visibility score is the most rigorous open, reusable scoring method found — and it exports directly as an ATT&CK Navigator layer.
7. MISP's three-state sighting model (true-positive / false-positive / expiration, with per-org date decay) is the simplest sighting schema to implement first — far lighter than a full STIX Sighting object, and upgradeable to STIX later since STIX Sighting is a strict superset conceptually.
8. Least-privilege read-auth per SIEM is well documented for Sentinel (Microsoft Sentinel Reader + Log Analytics Reader) and Elastic (Kibana Rules-feature Read privilege + ES read on `.alerts-security.alerts-*`); Splunk's Enterprise Security-specific capabilities and Google SecOps/Chronicle's IAM role names are UNVERIFIED and need a follow-up check before building those connectors.
9. Microsoft Defender Threat Analytics' per-threat "outstanding vs. already-implemented mitigations" checklist is the strongest concrete pattern for turning a verdict into an actionable punch list — worth copying directly into ETIP's per-threat card.
10. The MVP data connector with the best value-per-effort for the Indian mid-market is a vulnerability scanner (Qualys/Tenable/Nessus/OpenVAS) layered with the free CISA KEV + EPSS feeds ETIP already ingests — asset inventory and SIEM rule pull come next; EDR is lowest priority for MVP.

---

## 2. Market map — 6 categories

| Category | Vendors | One idea to borrow |
|---|---|---|
| Detection posture / coverage audit (passive) | CardinalOps, SnapAttack, Anvilogic, SOC Prime, Tidal Cyber, Interpres, Veriti | CardinalOps' "Security Layers" — score coverage *depth* per technique, not just presence/absence |
| Breach & attack simulation (active validation) | Picus (DRV), AttackIQ, SafeBreach, Cymulate | Picus's three-lens rule health: log source / alert fires / performance |
| TIP ↔ SIEM integration | Recorded Future, Google TI/Mandiant + SecOps, Anomali Match, ThreatConnect/Polarity, Cyware, EclecticIQ, OpenCTI, MISP | Google SecOps ATI — retroactive re-scan of all history on new IOC arrival |
| SIEM-native posture features | Microsoft Sentinel, Splunk (SSE + ES), Elastic, Google SecOps, IBM QRadar, Exabeam, CrowdStrike NG-SIEM | Don't rebuild the coverage grid each SIEM already ships — pull it via API and aggregate cross-platform, since each SIEM's grid is siloed to itself |
| Open frameworks / standards | DeTT&CT, MITRE ATT&CK Data Components, ATT&CK Navigator layer format, CTID (Top Techniques, Sightings Ecosystem, Mappings Explorer, Attack Flow), Sigma/pySigma, OCSF, STIX Sighting | DeTT&CT's 5-dimension data-quality score → 0–4 visibility score per technique, exported as a Navigator layer |
| Exposure / "am I affected" (per-threat verdict) | Microsoft Defender Threat Analytics + Defender TI + Defender VM, CrowdStrike Falcon Exposure Management, Recorded Future, Google TI/Mandiant, Tenable One, Qualys TruRisk, Rapid7 Exposure Command, XM Cyber, Wiz, Picus/Cymulate/AttackIQ (empirical), Cyberint/SOCRadar (supply chain) | Defender Threat Analytics' done-vs-outstanding mitigation checklist per threat |

---

## 3. Comparison matrix — vendor × capability

Legend: ✓ has it · partial · – doesn't / not found · UNVERIFIED = claimed but not confirmed by a primary source.

| Vendor | Per-threat "am I affected" | Rule/ATT&CK coverage | Data-source health | TI match/sightings incl. retro re-scan | Actor coverage | Industry/peer relevance | Asset/vuln exposure | Rule effectiveness/validation | AI rule generation | Auto-deploy rules | Near-real-time | Setup ease (1–5) | SIEMs supported |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CardinalOps | – | ✓ (+ depth scoring) | – | – | – | – | – | partial (rule classification only) | – | ✓ (push validated rules) | partial (batch re-scan) | UNVERIFIED | Splunk, Sentinel, QRadar, SecOps, Falcon LogScale, Sumo |
| SOC Prime (Attack Detective + Uncoder AI) | – | ✓ (gap/blind-spot map) | partial | – | – | – | – | – | ✓ (Uncoder AI translation) | – | partial | UNVERIFIED | Amazon Security Lake, Sentinel, Defender, Splunk Cloud, Elastic Cloud (+56 via content library) |
| Tidal Cyber | – | ✓ (technique-set mapping) | – | – | partial (via ThreatConnect ingest) | – | – | – | – | – | partial | UNVERIFIED (Community self-serve) | EDR/XDR/SIEM/IAM, not itemized |
| Picus (DRV + BAS) | partial (per-campaign) | ✓ | ✓ (log-source lens) | – | – | – | – | ✓ (3-lens, empirical) | – | – | – | UNVERIFIED | Devo (named), others not itemized |
| AttackIQ | – | ✓ (validation coverage) | – | – | – | – | – | ✓ (empirical, API-verified landing) | – | – | – | UNVERIFIED | CrowdStrike (named), broader via API |
| SafeBreach | – | ✓ | – | – | ✓ (peer benchmark) | partial (industry benchmark) | – | ✓ (empirical) | – | – | – | UNVERIFIED | Sentinel (named), broader SIEM/SOAR |
| Cymulate | – | ✓ | – | – | – | partial (industry benchmark) | – | ✓ (empirical, vendor-specific remediation) | – | – | – | UNVERIFIED | SIEM/SOAR/EDR/cloud/email, not itemized |
| Recorded Future | partial (Threat Map) | – | – | ✓ (risk lists, batch) | ✓ | ✓ (industry/tech-stack match) | ✓ (Attack Surface Intelligence) | – | – | – | partial | UNVERIFIED | Splunk, Sentinel, QRadar, Datadog, SecOps |
| Google TI/Mandiant + SecOps ATI | – | ✓ (curated detections) | ✓ (Health Hub) | ✓ (retroactive re-scan, best-in-class) | ✓ (Intel Profiles) | partial | – | – | – | – | ✓ | 2 (native, SecOps only) | Google SecOps only |
| Anomali Match | – | – | – | ✓ (retrospective analysis) | ✓ | – | – | – | – | – | partial | UNVERIFIED | Splunk, Sentinel, QRadar + cloud/SaaS logs |
| Cyware | – | – | – | ✓ (bi-directional STIX/TAXII) | – | – | – | – | – | ✓ (playbook push) | ✓ | UNVERIFIED | Sentinel (named STIX/TAXII), 400+ claimed |
| OpenCTI | – | – | – | ✓ (native STIX Sighting, SSE stream) | ✓ | – | – | – | – | – | ✓ (SSE) | UNVERIFIED (self-hosted connector setup) | Sentinel (documented), TAXII-compatible |
| MISP | – | – | – | ✓ (3-state sighting) | ✓ | – | – | – | – | – | partial | UNVERIFIED | Splunk via community bridge (misp42splunk) |
| Microsoft Sentinel (native) | – | ✓ (native page) | ✓ (SentinelHealth) | – | – | – | – | – | ✓ (SOC optimization recs) | – | ✓ | 2 (native) | Sentinel only |
| Splunk (SSE/ES) | – | ✓ (SSE dashboard) | – | – | – | – | – | partial (RBA scoring) | – | – | partial | UNVERIFIED | Splunk only |
| Elastic | – | ✓ (native page) | ✓ (Fleet agent health) | – | – | – | – | – | – | ✓ (enable from grid) | ✓ | 2 (native) | Elastic only |
| IBM QRadar | – | ✓ (Use Case Manager) | – | – | – | – | – | – | – | – | partial | UNVERIFIED | QRadar only |
| Exabeam | – | ✓ (Coverage Score) | – | – | – | – | – | – | – | – | partial | UNVERIFIED | Exabeam only |
| CrowdStrike NG-SIEM | – | ✓ (adversary-filterable) | – | – | ✓ (adversary-centric) | partial | – | – | – | – | ✓ | 2 (native) | CrowdStrike only |
| Microsoft Defender Threat Analytics | ✓ (best-in-class per-threat card) | – | – | – | – | – | ✓ (endpoint exposure) | – | – | – | ✓ | 2 (native to E5/Defender) | Native Microsoft stack |
| CrowdStrike Falcon Exposure Mgmt | ✓ (ranked, with reasoning) | – | – | – | ✓ (adversary intel) | ✓ | ✓ | – | – | – | ✓ | 3 | Falcon + 3rd-party endpoints |
| Tenable One / Qualys TruRisk | partial | – | – | – | – | – | ✓ | – | – | – | – (batch) | 3 | N/A (scanner) |
| XM Cyber / Wiz | ✓ (attack-path framing) | – | – | – | – | – | ✓ | – | – | – | partial | 3–4 | N/A (agentless/cloud) |
| SOCRadar / Cyberint | partial (vendor/peer framing) | – | – | – | – | ✓ (peer/supply-chain) | – | – | – | – | ✓ | 2–3 | N/A |
| **ETIP (current)** | – (planned P2) | – (F6 heatmap planned) | – | – (planned P3) | ✓ (actor module exists) | ✓ (feeds, DRP) | ✓ (KEV/EPSS, DRP surface) | – (planned P4) | – (planned P5) | – | ✓ (feeds/enrichment) | 1 (self-serve wizard, planned P4) | Splunk HEC, Sentinel, Elastic push live; TAXII 2.1 live |

---

## 4. What best-in-class looks like (combined)

**Per-threat verdict card** (synthesizing Defender Threat Analytics + Recorded Future + CrowdStrike Exposure Management + the 05 research's decision table):

- Threat identity: campaign/actor, first seen, targeted industry/region, source
- IOC sightings in the tenant's own telemetry (fresh vs. stale)
- Detection coverage per TTP: rule exists → rule enabled → rule validated/fired (three states, not two)
- Exposure: internet-facing assets running the affected software/version
- CVE status per exploited vuln: patched / unpatched / mitigated / actively exploitable (KEV/EPSS/public exploit)
- Confidence, stated honestly (never a silently-green verdict on missing data)
- Verdict from a fixed decision table (see Deliverable B §2)
- Ranked remediation, tied to what specifically flips the verdict
- Mitigation checklist, done vs. outstanding (borrowed directly from Defender Threat Analytics)

**Posture overview** (synthesizing DeTT&CT + CardinalOps + Exabeam + SafeBreach/Cymulate):

- Log-source health (DeTT&CT 5-dimension score → per-technique visibility 0–4)
- ATT&CK coverage weighted by relevance, not flat count (CTID Top Techniques weighting)
- Threat-actor coverage (CrowdStrike NG-SIEM's adversary-filterable framing)
- IOC coverage / sightings, including retroactive re-scan (Google SecOps ATI, Anomali Match)
- Rule health: never-fired / noisy / broken / silent (Picus three-lens)
- Single aggregate posture score with trend (SafeBreach/Cymulate), peer benchmark flagged as future-state since no vendor's benchmarking methodology is public

**Near-real-time vs. daily, honestly stated:** SIEM-native config/rule pulls and IOC pushes can be near-real-time; vulnerability scans, asset inventories, and BAS-style validation are inherently batch/scheduled (daily at best). No vendor researched claims true real-time exposure scoring — the "real-time" claims found are for ingestion/config change detection, not full exposure recomputation. ETIP's dashboard should label each widget's actual refresh cadence rather than implying uniform real-time.

---

## 5. ETIP's differentiation

None of the 23 vendors researched combine, in one platform, what ETIP's existing modules already provide:

- First-party threat intel (IOC intelligence, threat-actor-intel, malware-intel — all deployed) that detection-posture tools (CardinalOps, SOC Prime, Tidal) don't have; those tools only audit rules against a generic ATT&CK catalog, with no owned intel feed behind it.
- Industry/peer attack tracking via ETIP's feed ingestion and India-focused sources (CERT-In, planned Step 14 F8) — SOCRadar/Cyberint have a peer-framing idea but no first-party intel to back it, and none of the researched vendors target the Indian mid-market specifically.
- Vulnerability intelligence with KEV/EPSS (vulnerability-intel, deployed) that detection-posture tools lack entirely — they audit rules, not exposure.
- Attack-surface / DRP data (drp-service, deployed, though several of its engines are currently simulated per Step 14 F7 and must be made real before this differentiation claim holds operationally) that TIP vendors (Recorded Future, EclecticIQ) charge extra for as a bolt-on (Attack Surface Intelligence).

TIPs (Recorded Future, EclecticIQ, OpenCTI, MISP) lack rule/exposure posture entirely — they push/pull intel but don't score detection coverage. SIEMs (Sentinel, Elastic, QRadar) are single-vendor silos — each posture grid only covers itself, with no cross-SIEM aggregation and no first-party TI behind it. ETIP's opportunity is combining all four data types (TI + peer/industry + vuln + attack surface) with cross-SIEM posture pulled via read connectors — a combination no researched vendor offers today.

---

## 6. Least-privilege setup per SIEM + setup UX patterns

| SIEM | Least-privilege read credential | Verified? |
|---|---|---|
| Microsoft Sentinel | Entra (Azure AD) app registration + **Microsoft Sentinel Reader** RBAC role (scoped to resource group/workspace); pair with **Log Analytics Reader** for querying tables like `SentinelHealth` | Verified (Microsoft Learn) |
| Elastic | Kibana API key with **Read privilege on the "Rules" Kibana feature** (`siem` category); add an Elasticsearch **read** index privilege on `.alerts-security.alerts-<space-id>` for reading alerts | Verified (Elastic docs) |
| Splunk | REST API token or basic auth, role built from capabilities `list_saved_search` + `search` (minimum for reading correlation searches). **Enterprise Security-specific read capabilities (e.g., Incident Review dashboard) are UNVERIFIED** — confirm against ES admin docs before building | Base capabilities verified; ES-specific capabilities UNVERIFIED |
| IBM QRadar | "Authorized Service Token" (SEC header), bound at creation to a security profile + role restricted to read-only offense/rule permissions; scope is immutable — must delete and recreate to change. **Exact permission checkbox names UNVERIFIED** | Token mechanism verified; exact role UI labels UNVERIFIED |
| Google SecOps (Chronicle) | Service-account JSON + IAM role, likely `chronicle.rules.viewer` or similar | **UNVERIFIED — no primary source found; do not build against this guessed role name without a dedicated follow-up search** |

**Setup UX patterns to adopt:**

- Package connector + parsers + pre-built dashboards/rules as **one installable unit** (Sentinel Content Hub solutions, Elastic Fleet integrations) — defer only environment-specific fields (workspace, credentials) to the wizard.
- **Read-only as the default** selection in any credential/token wizard; write/admin requires an explicit opt-in step (general best practice, DNSimple/Atlassian scoped-token pattern).
- A distinct, explicit **"Test connection"** action separate from Save, before the integration goes live — universal pattern across Splunk/Elastic/Sentinel wizards.
- Admin-consent flows (Microsoft Entra pattern: pre-declared scopes → single "Grant admin consent" click, tenant-wide) are the fastest onboarding UX found, but are Microsoft-specific; other SIEMs need per-connector token creation instead.

---

## 7. Standards to adopt

| Standard | What it gives ETIP | Build vs. integrate |
|---|---|---|
| STIX 2.1 Sighting object | Formal "entity X observed indicator Y, N times, between first/last seen" — the connective tissue between an IOC and a detection event | Integrate later (P3); start with the lighter MISP model first |
| MISP 3-state sighting (TP/FP/expiration, per-org date decay) | Simplest sighting schema to implement first, upgrade path to STIX later | Build first — small, well-specified schema |
| ATT&CK Navigator layer JSON | De facto interchange format for "my coverage/visibility/risk by technique"; any tool that populates `score` per technique and exports this JSON plugs into the public Navigator UI | Build a small exporter — schema is public and stable (v4.5 spec) |
| pySigma + backends | Vendor-agnostic detection-rule format with actively maintained backends for Splunk SPL, Sentinel KQL, Elastic (Lucene/ES|QL/EQL), and community backends for QRadar, Panther, SentinelOne, etc. | Integrate — strong reuse candidate for multi-SIEM rule translation instead of hand-rolled per-SIEM query generation |
| OCSF | Vendor-neutral event schema, AWS Security Lake's native format, broad vendor coalition backing | Integrate where practical for any normalized event ingestion; not required for metadata-only rule/incident pulls |
| DeTT&CT data-quality + visibility scoring | Five-dimension (0–5) data-source quality score feeding a 0–4 per-technique visibility score, exports as a Navigator layer | Build ETIP's own scoring using this method as the reference model (it's a scoring methodology, not a library to install) |
| CTID Top ATT&CK Techniques weighting | Prevalence (recency-weighted real-world use) + Choke Point + Actionability — a defensible way to weight "coverage" by what actually matters, not flat technique count | Integrate — CTID publishes an open calculator/methodology to re-weight for the tenant's own environment |

---

## 8. Risks & pitfalls

- **False confidence from missing telemetry.** A "Protected" verdict from a SIEM with no visibility into that asset class looks identical to a real "Protected." Confidence must sit next to the verdict, never buried (universal pitfall across the 05 research's vendor table).
- **Asset-inventory gaps default to "not exposed."** The most common way exposure tools under-report risk — shadow IT, unmanaged cloud, M&A subsidiaries silently treated as safe.
- **CPE/purl version-matching noise.** Every vendor researched treats this as an ongoing, unsolved tuning problem (vendor renames, backported patches, custom builds) — don't trust matches blindly.
- **Stale scans silently feeding green verdicts.** A vuln scan or asset inventory older than ~14–30 days should visibly downgrade confidence, not pass through unflagged.
- **"Rule exists" ≠ "rule fires."** Picus/Cymulate/AttackIQ exist because a mapped-but-disabled or untested rule is a false sense of coverage; ETIP's posture model needs three states (exists / enabled / validated), not two.
- **UNVERIFIED items must not be load-bearing for launch copy.** Splunk ES-specific capabilities, Chronicle's IAM role name, and QRadar's exact permission checkbox names all need a dedicated confirmation pass before wizard copy or connector code ships referencing them.
- **Peer-benchmark claims lack public methodology anywhere in this research.** SafeBreach and Cymulate both market industry benchmarking with no cited methodology — if ETIP ever ships a peer-benchmark number, its methodology should be stated, unlike the vendors researched.

---

## 9. Sources (grouped)

**Detection posture / BAS (Category 1–2):** cardinalops.com (4 pages), docs.snapattack.com, snapattack.com, cisco.com (SnapAttack acquisition), splunkbase.splunk.com/app/7556, anvilogic.com, underdefense.com (pricing, UNVERIFIED), appscribed.com (pricing, UNVERIFIED), my.socprime.com, socprime.com (×2), tidalcyber.com (×3), securityboulevard.com (×2), interpressecurity.com, prnewswire.com, cyberproof.com, veriti.ai, assets.store.crowdstrike.com, panther.com, docs.panther.com, databricks.com, picussecurity.com (×3), attackiq.com, marketplace.crowdstrike.com, peerspot.com, safebreach.com (×2), marketplace.microsoft.com, cymulate.com, g2.com, decryptiondigest.com (pricing, UNVERIFIED).

**TIP ↔ SIEM (9 vendors):** recordedfuture.com, datadoghq.com, support.recordedfuture.com, docs.cloud.google.com (×3 Chronicle/ATI pages), anomali.com (×2), securityscientist.net, threatconnect.com, knowledge.threatconnect.com, polarity.io, cyware.com (×3), techdocs.cyware.com, eclecticiq.com (×3), docs.opencti.io (×2), filigran.io, circl.lu, github.com/MISP/MISP/wiki, github.com/remg427/misp42splunk, techcommunity.microsoft.com, microsoft.com, trustradius.com.

**SIEM-native (6 SIEMs):** learn.microsoft.com (×6 Sentinel pages), charbelnemnom.com, help.splunk.com (×4), elastic.co (×4), docs.cloud.google.com (×3 Chronicle native features), ibm.com, ibmsecuritydocs.github.io, juniper.net, docs.exabeam.com, crowdstrike.com (×2).

**Frameworks/standards:** github.com/rabobank-cdc/DeTTECT (×4 wiki pages), attack.mitre.org (×2), github.com/mitre-attack, docs.cribl.io, cribl.io, github.com/mitre-attack/attack-navigator, mitre-attack.github.io, ctid.mitre.org (×4 project pages), github.com/center-for-threat-informed-defense (×4 repos), medium.com (×2), center-for-threat-informed-defense.github.io, github.com/SigmaHQ/pySigma, sigmahq.io, dogesec.com, ocsf.io, docs.aws.amazon.com, splunk.com, docs.oasis-open.org (STIX 2.1 spec), chatbotkit.com, blog.dnsimple.com, support.atlassian.com.

**Exposure/"am I affected" (vendor table):** learn.microsoft.com (Threat Analytics, Defender VM), techcommunity.microsoft.com (Intel Profiles), crowdstrike.com (×2), recordedfuture.com (×2), cloud.google.com, vectra.ai, armorcode.com, picussecurity.com (×3), tenable.com, qualys.com, rapid7.com (×2), cyberint.com, socradar.io, endorlabs.com, carnegieendowment.org, cert-in.org.in.

**Unverified / not found, flagged as follow-ups if needed:** exact Splunk Enterprise Security read-only capability names; Google SecOps/Chronicle third-party read IAM role name; IBM QRadar exact permission checkbox labels; a single dominant standalone "SIEM health monitoring" product category leader; Cribl has no ATT&CK-coverage feature (routing/cost tool only, don't list as a competitor); Silobreaker/Flashpoint/ZeroFox per-threat exposure mechanics; the single dominant EASM/vuln-scanner vendor for the Indian mid-market specifically.
