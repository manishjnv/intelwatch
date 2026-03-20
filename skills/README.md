# ETIP — Enterprise Threat Intelligence Platform
# Claude Skills System v3.0
**Total Skills: 26 | Last Updated: 2025**

---

## SKILL LOADING ORDER (MANDATORY)
Always load skills in this order for any task:
1. `00-claude-instructions` ← READ FIRST, ALWAYS
2. `00-architecture-roadmap` ← architectural context
3. `00-master` ← project structure
4. `{relevant module skill}` ← specific to your task
5. `02-testing` ← after implementing
6. `01-docs` ← update docs after implementing

---

## COMPLETE SKILLS MAP

### 🧠 Meta / Instructions
| ID | Skill | Purpose |
|---|---|---|
| 00-claude-instructions | **Claude Master Instructions** | HOW Claude works on this project — rules, pipeline, definition of done |
| 00-architecture-roadmap | **Architecture & Roadmap** | Tech stack, system diagram, phased implementation plan, USPs |
| 00-master | **Platform Master Guide** | Project structure, error classes, API shapes, security rules |

### 📋 Process Skills
| ID | Skill | Purpose |
|---|---|---|
| 01-docs | **Documentation System** | Centralized docs — update after EVERY build |
| 02-testing | **Testing & QA** | Pre-build + post-build testing gates |
| 03-devops | **DevOps & Deployment** | GitHub CI/CD → Hostinger VPS, Docker, Nginx |

### ⚙️ Data Pipeline (Mandatory Flow)
| ID | Skill | Purpose |
|---|---|---|
| 04-ingestion | **Intelligence Ingestion** | Feed collection (OSINT/dark web/commercial) |
| 05-normalization | **Normalization Engine** | Canonical schemas, dedup, type detection |
| 06-ai-enrichment | **AI Enrichment Engine** | Claude + VT + AbuseIPDB, cached, async |

### 🛡️ Intelligence Modules
| ID | Skill | Purpose |
|---|---|---|
| 07-ioc | **IOC Intelligence** | Indicator lifecycle, pivot, search, archive |
| 08-threat-actor | **Threat Actor Intelligence** | Profiles, TTPs, attribution scoring |
| 09-malware | **Malware Intelligence** | Families, IOC extraction, behavior |
| 10-vulnerability | **Vulnerability Intelligence** | CVE, EPSS, KEV, CMDB mapping |
| 11-drp | **Digital Risk Protection** | Phishing, brand monitoring, credential leaks |
| 12-threat-graph | **Threat Graph** | Neo4j knowledge graph, React Flow viz |
| 13-correlation | **Correlation Engine** | Rule-based + AI correlation |
| 14-hunting | **Threat Hunting** | Analyst workspace, investigation, pivot |

### 🔧 Platform Services
| ID | Skill | Purpose |
|---|---|---|
| 15-enterprise-integration | **Enterprise Integrations** | SIEM/ITSM/CMDB/EDR/Webhook |
| 16-user-management | **User Mgmt & RBAC** | Auth, Google SSO, code login, SAML, MFA |
| 17-customization | **Platform Customization** | Module toggles, risk scoring, AI model config |
| 18-onboarding | **Customer Onboarding** | 8-step wizard, demo data, readiness check |
| 19-free-to-paid | **Free-to-Paid Adoption** | Tiers, upgrade flows, Stripe, trials |

### 🖥️ UI & Integration
| ID | Skill | Purpose |
|---|---|---|
| 20-ui-ux | **UI/UX Design System** | Entity highlighting, 3D effects, stats bars, tooltips, mobile |
| 21-module-integration | **Module Integration** | Event bus, inter-service APIs, WebSocket |

### ⚡ Administration & Performance
| ID | Skill | Purpose |
|---|---|---|
| 22-admin-platform | **Admin Platform** | Infra monitoring, AI config, tenant mgmt, auth |
| 23-caching-archival | **Caching & Archival** | 48hr dashboard cache, 60-day archival to MinIO |

---

## KEY USPs vs COMPETITORS

| USP | Implementation |
|---|---|
| **AI at every layer** | Claude enriches every entity type — configurable model per use case |
| **Entity-first UX** | Every IP/domain/hash/CVE/actor = highlighted, clickable, local+internet search |
| **48hr dashboard cache** | Redis L1 — dashboard loads instantly even after inactivity |
| **60-day auto-archival** | MinIO Parquet — performance without data loss, on-demand retrieval |
| **Plug-and-play modules** | <400 line files, independent services, easy for Claude to maintain |
| **Admin intelligence** | Real-time infra health, AI token budget, cost tracking per use case |
| **Investigation view** | Side panel showing entity relationships + timeline on any entity click |
| **3D premium UI** | Framer Motion 3D cards, depth shadows, entity glow by severity |
| **Full auth menu** | Google SSO + code login + SAML/OIDC + MFA — every method covered |
| **Phased roadmap** | 8-phase plan: Foundation → Pipeline → Intel → Advanced → Platform → Growth → Performance → Polish |

---

## TECH STACK SUMMARY
```
Backend:  Node.js 20 + Fastify + Prisma (PostgreSQL) + Redis + Elasticsearch + Neo4j + MinIO
Queue:    BullMQ (Redis)
AI:       Anthropic Claude (configurable model per use case)
Frontend: React 18 + TypeScript + Vite + shadcn/ui + Tailwind + Framer Motion
Auth:     Google OAuth2 + Magic Code + SAML2 + OIDC + TOTP MFA + API Keys
Deploy:   GitHub Actions → GHCR → Hostinger VPS (Ubuntu 22.04) + Docker + Nginx
```
