# SKILL: User Management and RBAC
**ID:** 16-user-management | **Version:** 3.0

## MANDATORY (read before implementing)
1. **00-claude-instructions** — coding rules, token efficiency, definition of done
2. **00-architecture-roadmap** — tech stack, data flow, phase you're in
3. **00-master** — project structure, error classes, API response shapes
4. **02-testing** — write tests FIRST, then implement
5. **01-docs** — update documentation AFTER implementing

## MANDATORY PIPELINE INTEGRATION
Every entity stored in this module MUST:
1. Be normalized via `shared-normalization` package FIRST
2. Be queued for AI enrichment via `shared-enrichment` package
3. Be indexed in Elasticsearch after storage
4. Have a Neo4j node created/updated (via graph-service)
5. Publish the appropriate event to the event bus
6. All values displayed as clickable EntityChip (20-ui-ux)
7. Have tooltips and inline help on all UI elements

## MODULE DESCRIPTION
Auth methods: email+password, TOTP MFA, Google SSO (admin), magic code login (admin), SAML 2.0 (customer), OIDC (customer), API keys, WebAuthn/Passkeys (Phase 6), ETIP-as-OIDC-provider (Phase 9). Roles: super_admin/admin/analyst/hunter/viewer/api_only. RBAC: permission strings like ioc:read/ioc:create/ioc:delete — checked via rbac() middleware. JWT (15min) + refresh token (7d) — refresh stored in Redis, revocable. SAML/OIDC per-tenant config from admin panel — approved user list only. MFA: TOTP via authenticator app + 10 backup codes + WebAuthn (Phase 6). API keys: hashed (bcrypt), scoped, prefix-indexed for fast lookup. Audit log: every action logged (LOGIN/LOGOUT/CREATE/UPDATE/DELETE/PERMISSION_DENIED etc.). Session management: view and revoke active sessions from settings. Adaptive auth (Phase 7): geo/device/time anomaly scoring on login events. Break-glass: offline hardware-backed super_admin bypass for SSO failure recovery (Phase 5).

## FILE STRUCTURE (max 400 lines per file)
```
/apps/16-user-management-service/src/
  index.ts              # Fastify app setup, plugins, routes registration
  routes.ts             # Route definitions only (import controllers)
  controller.ts         # HTTP layer — parse request, call service, format response
  service.ts            # Business logic (split into multiple files if >400 lines)
  schema.ts             # Zod schemas for this module's entities
  repository.ts         # Database queries (Prisma)
  queue.ts              # BullMQ worker/producer for this module
  README.md             # Module overview (updated after each build)
```

## UI REQUIREMENTS (from 20-ui-ux)
- All entity values (IPs, domains, actor names, CVEs, hashes) = EntityChip (clickable, highlighted)
- InvestigationPanel opens on entity click (relationship sidebar)
- Page-specific compact stats bar at top of module view
- All form fields have InlineHelp messages
- All features have TooltipHelp icons
- Collapsible sections on detail views
- 3D card effect (IntelCard) on interactive cards
- Mobile responsive (375px card view, desktop table view)
- Skeleton screens on all loading states
- Empty state with actionable CTA

## TESTING REQUIREMENTS (from 02-testing)
- Write test outlines BEFORE implementing
- Unit tests: all service methods (happy + error paths)
- Integration tests: all CRUD endpoints, auth enforcement, tenant isolation
- Minimum 80% coverage
- Run `npm run test:coverage` before marking done

## AUTH IMPLEMENTATION

### Google SSO (Admin)
```typescript
passport.use('google', new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: `${BASE_URL}/api/v1/auth/google/callback`
}, async (_, __, profile, done) => {
  const email = profile.emails?.[0]?.value
  if (!email || !process.env.ADMIN_ALLOWED_DOMAINS?.split(',').some(d => email.endsWith(d)))
    return done(null, false)
  const user = await upsertAdminUser({ email, googleId: profile.id, name: profile.displayName })
  done(null, user)
}))
```

### Magic Code Login (6-digit OTP, 5min TTL, single-use)
```typescript
// Request: POST /api/v1/auth/admin/request-code { email }
// Verify:  POST /api/v1/auth/admin/verify-code  { email, code }
// Code stored as bcrypt hash in Redis with 5min expiry
// Single use: deleted immediately after successful verify
```

### Customer SSO (per-tenant SAML/OIDC)
```typescript
// Config stored per tenant (see skill 17-customization)
// Approved user email list — only listed users can SSO
// Admin configures via /settings/sso with cert upload + test connection
```

### RBAC Permissions
```typescript
const PERMISSIONS = {
  admin:    ['*'],
  analyst:  ['ioc:*', 'threat_actor:read', 'threat_actor:create', 'malware:*', 'vuln:read', 'hunting:*', 'graph:read', 'alert:*', 'dashboard:*', 'report:*'],
  hunter:   ['ioc:read', 'threat_actor:read', 'malware:read', 'vuln:read', 'hunting:*', 'graph:read', 'alert:read', 'dashboard:read'],
  viewer:   ['ioc:read', 'threat_actor:read', 'malware:read', 'vuln:read', 'dashboard:read', 'alert:read'],
  api_only: ['ioc:read', 'ioc:create', 'threat_actor:read', 'vuln:read']
}
```

---

## PHASE 5 ADDITIONS

### Emergency Break-Glass Account
> **Priority:** P0 — must ship before any enterprise customer goes live.

A single, offline, hardware-backed super_admin account that bypasses all SSO
flows. Used only when SAML/OIDC is misconfigured or the IdP is unavailable.

```typescript
// Break-glass is a special user record — never exposed via SSO
// Credentials stored encrypted in Vault / secret manager, not in DB
// Login: POST /api/v1/auth/break-glass { token: '<hardware-otp>' }
// Hardware OTP generated by physical TOTP device (YubiKey) — never software
// On use: immediate alert to all super_admins + SOC2 audit entry
// Auto-expire session: 30 minutes, non-renewable
// DB schema addition:
//   users.is_break_glass BOOLEAN DEFAULT false
//   users.break_glass_last_used TIMESTAMPTZ
//   users.break_glass_use_count INT DEFAULT 0
```

**Endpoints:**
```
POST /api/v1/auth/break-glass         → Login with hardware OTP
GET  /api/v1/admin/break-glass/log    → Break-glass usage history (super_admin only)
```

**SOC2 Audit actions logged:**
- `auth.break_glass_used` (riskLevel: 'critical')
- `auth.break_glass_failed` (riskLevel: 'high')

---

## PHASE 6 ADDITIONS

### WebAuthn / Passkeys (FIDO2)
> **Priority:** P1 — ships as upgrade to Phase 5 TOTP. Library: `@simplewebauthn/server`.

```typescript
// Registration: POST /api/v1/auth/webauthn/register/begin   → options
//               POST /api/v1/auth/webauthn/register/verify  → { credential }
// Authentication: POST /api/v1/auth/webauthn/auth/begin    → challenge
//                 POST /api/v1/auth/webauthn/auth/verify   → { assertionResponse }
//
// DB schema additions:
//   webauthn_credentials table:
//     id, user_id, credential_id (base64url), public_key (bytea),
//     sign_count INT, device_name VARCHAR, created_at, last_used_at
//
// Users can register multiple credentials (phone, YubiKey, laptop TouchID)
// Each credential stored with device_name for management UI
// Credential revocation: DELETE /api/v1/auth/webauthn/credentials/:credentialId
```

**Endpoints:**
```
POST   /api/v1/auth/webauthn/register/begin    → Start passkey registration
POST   /api/v1/auth/webauthn/register/verify   → Complete passkey registration
POST   /api/v1/auth/webauthn/auth/begin        → Start passkey login challenge
POST   /api/v1/auth/webauthn/auth/verify       → Verify assertion + issue JWT
GET    /api/v1/auth/webauthn/credentials       → List registered credentials
DELETE /api/v1/auth/webauthn/credentials/:id   → Revoke credential
```

### OAuth App Management
> **Priority:** P2 — ships with onboarding settings panel.

```typescript
// Users can view and revoke OAuth connections from /settings/connected-apps
// Stores: provider, scope granted, granted_at, last_used_at, token (encrypted)
// Revocation: deletes stored token + calls provider revoke endpoint if available
//
// DB schema:
//   oauth_connections table:
//     id, user_id, tenant_id, provider VARCHAR, scope TEXT,
//     access_token_encrypted TEXT, refresh_token_encrypted TEXT,
//     granted_at, last_used_at, revoked_at
```

**Endpoints:**
```
GET    /api/v1/settings/connected-apps          → List OAuth connections
DELETE /api/v1/settings/connected-apps/:id      → Revoke connection
```

---

## PHASE 7 ADDITIONS

### Adaptive / Risk-Based Auth
> **Priority:** P1 — requires Phase 1–6 login history for baselines (16+ weeks data).
> Dependency: MaxMind GeoIP2 database (self-hosted) + Redis login history per user.

```typescript
// On every login event, score the request against stored user baseline:
//   - geo_score:    IP geolocation vs user's typical countries (0–40 pts risk)
//   - device_score: user-agent + canvas fingerprint vs known devices (0–30 pts)
//   - time_score:   hour-of-day vs user's historical login window (0–20 pts)
//   - velocity:     logins in last 10 min across IPs (0–10 pts)
//
// Total risk score 0–100:
//   0–30:   ALLOW (normal)
//   31–60:  STEP_UP — require TOTP/WebAuthn re-verification
//   61–100: BLOCK — notify user + super_admin, require manual unlock
//
// Baseline built from: last 90 days of successful logins, updated rolling
// Stored in Redis: `{tenantId}:auth:baseline:{userId}` → JSON, 90d TTL

interface AuthRiskScore {
  total: number           // 0–100
  action: 'allow' | 'step_up' | 'block'
  factors: {
    geo: number
    device: number
    time: number
    velocity: number
  }
  newCountry?: string     // set if geo_score triggered
  knownDevice: boolean
}
```

**Endpoints:**
```
GET  /api/v1/auth/risk/baseline          → View your current baseline (user)
POST /api/v1/admin/auth/risk/unlock/:id  → Manually unlock blocked user (admin)
GET  /api/v1/admin/auth/risk/blocked     → List currently blocked users (admin)
```

### Session Anomaly Alerts
> **Priority:** P1 — simpler than adaptive auth; no ML baseline needed.
> Dependency: MaxMind GeoIP2 + user email / in-app notification service.

```typescript
// On login: compare current IP country against last 5 login countries
// If new country detected → send alert to user email + in-app notification
// Alert content: timestamp, IP, country, device, "Was this you?" link
// "Not me" link → immediate session revocation + force password reset
//
// Redis key: `{tenantId}:auth:login_history:{userId}` → last 10 logins LPUSH/LTRIM
// Each entry: { ip, country, userAgent, timestamp, sessionId }
```

**Endpoints:**
```
GET  /api/v1/auth/login-history           → User's recent login locations
POST /api/v1/auth/report-suspicious/:id   → Mark login as not-me → revoke + reset
```

**SOC2 audit action:** `auth.anomaly_detected` (riskLevel: 'high')

---

## PHASE 9 ADDITIONS

### ETIP as OIDC Provider (Outbound)
> **Priority:** P1 — platform stickiness; allow tenants to use ETIP as IdP for other tools.
> Library: `node-oidc-provider`. Complex — full OIDC server implementation.

```typescript
// ETIP issues OIDC tokens for registered client applications
// Tenants register their security tools as OIDC clients in /settings/oidc-clients
// Supports: authorization_code flow, PKCE, refresh tokens
// Scopes: openid, profile, email, etip:read (custom — grants read API access)
//
// JWKS endpoint: GET /.well-known/jwks.json
// Discovery:     GET /.well-known/openid-configuration
// Authorize:     GET /api/v1/oidc/auth
// Token:         POST /api/v1/oidc/token
// UserInfo:      GET /api/v1/oidc/userinfo
// Introspect:    POST /api/v1/oidc/introspect (token validation for clients)
//
// DB schema:
//   oidc_clients: id, tenant_id, client_id, client_secret_hash,
//                 redirect_uris TEXT[], scopes TEXT[], created_at
//   oidc_grants:  id, client_id, user_id, scope, code, expires_at
```

### SMS / Email OTP MFA Fallback
> **Priority:** P2 — fallback only for users who lost all TOTP + WebAuthn credentials.
> Security note: SMS is vulnerable to SIM-swap. Present only as last-resort recovery.

```typescript
// Only accessible from MFA recovery flow — NOT as primary MFA method
// Flow: user proves identity via account recovery email → enters SMS OTP
// Rate limit: 3 attempts per 10 min per user
// Providers: Twilio (SMS), SES (email) — configurable per tenant
//
// POST /api/v1/auth/mfa/recovery/request  { email, method: 'sms'|'email' }
// POST /api/v1/auth/mfa/recovery/verify   { email, code }
// On success: issues short-lived recovery token → force new MFA setup
```

### Device Trust / Remember-Me (30 days)
> **Priority:** P2 — convenience feature; depends on Phase 7 session anomaly system.
> Cannot ship before Phase 7 anomaly detection (needs trusted device baseline).

```typescript
// After successful MFA on a new device, offer "Trust this device for 30 days"
// Stores a signed device trust token (HttpOnly, SameSite=Strict cookie, 30d)
// On subsequent logins from same device: skip MFA step-up
// Device trust tokens invalidated if: password changed, account locked,
//   session anomaly alert triggered, or user explicitly revokes from /settings/sessions
//
// Trust token = JWT { userId, deviceFingerprint, issuedAt } signed with separate key
// Device fingerprint = HMAC(userAgent + acceptLanguage + platform, tenant_secret)
//
// DB schema addition:
//   trusted_devices: id, user_id, device_fingerprint_hash, device_name,
//                    trusted_at, expires_at, last_seen_at, revoked_at
```

**Endpoints:**
```
POST   /api/v1/auth/devices/trust           → Mark current device as trusted
GET    /api/v1/auth/devices                 → List trusted devices
DELETE /api/v1/auth/devices/:id             → Revoke device trust
DELETE /api/v1/auth/devices                 → Revoke all trusted devices
```
