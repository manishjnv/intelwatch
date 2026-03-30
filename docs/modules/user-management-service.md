# User Management Service

**Port:** 3016 | **Status:** 🔨 WIP (FEATURE-COMPLETE) | **Tests:** 210 (+ 121 in user-service for SSO/MFA/email-verification/access-review/compliance)

## What It Does
Fine-grained RBAC, team management, SSO configuration (SAML 2.0 + OIDC), MFA (TOTP + backup codes), break-glass emergency access, session management, password policy enforcement, SOC2 audit logging, quarterly access review automation (I-17), and compliance report generation (I-18). All in-memory (DECISION-013 pattern).

## Features
| Feature | File | Description |
|---------|------|-------------|
| Health check | routes/health.ts | GET /health, GET /ready |
| Permission catalog | services/permission-store.ts | 15 resources × 4 actions + wildcards |
| Built-in roles | services/permission-store.ts | 5 roles: super_admin, tenant_admin, admin, analyst, hunter |
| Custom role builder | services/permission-store.ts | Create/update/delete custom roles with cherry-picked permissions |
| Permission inheritance | services/permission-store.ts | Role hierarchy: hunter→analyst→tenant_admin→admin→super_admin (P0 #1) |
| Designation field | services/team-store.ts | Cosmetic user tag (max 50 chars), never in RBAC. SET/GET via PUT /:userId/designation (I-03) |
| Tenant admin delete guard | services/team-store.ts | tenant_admin accounts cannot be deleted — 403 TENANT_ADMIN_UNDELETABLE + DB trigger (I-04) |
| Self-action guard | services/team-store.ts | Cannot disable/delete own account — 403 SELF_ACTION_DENIED (I-05 Guard A) |
| Org self-disable guard | services/team-store.ts | Non-super_admin cannot disable own org — 403 ORG_SELF_DISABLE_DENIED (I-05 Guard B) |
| Last admin protection | services/team-store.ts | Cannot disable/demote last active tenant_admin — 403 LAST_ADMIN_PROTECTED (I-05 Guard C) |
| Team invite | services/team-store.ts | Invite by email, pending/accepted states |
| Role assignment | services/team-store.ts | Assign/change roles per user per tenant |
| Deactivate/reactivate | services/team-store.ts | Deactivate and reactivate team members |
| SAML 2.0 config | services/sso-service.ts | Per-tenant SAML IdP config, cert, entity ID |
| OIDC config | services/sso-service.ts | Per-tenant OIDC issuer, client ID/secret |
| JIT provisioning | services/sso-service.ts | Auto-create users from SSO with default role |
| TOTP setup | services/mfa-service.ts | Generate secret + QR code URI |
| TOTP verification | services/mfa-service.ts | Verify code on login, ±1 step tolerance |
| Backup codes | services/mfa-service.ts | 10 single-use codes, regeneratable |
| MFA enforcement | services/mfa-service.ts | Per-tenant policy: required/optional/disabled |
| Break-glass account | services/break-glass-service.ts | Emergency admin with recovery codes |
| Break-glass session | services/break-glass-service.ts | 30-min non-renewable sessions |
| SOC2 audit trail | services/audit-logger.ts | Immutable log, filter by action/user/risk/time (P0 #2) |
| Brute-force protection | services/brute-force-guard.ts | 5-attempt lockout, 15-min auto-unlock (P0 #3) |
| Session management | services/session-manager.ts | View/revoke active sessions (P0 #4) |
| Password policy | services/password-policy.ts | Per-tenant strength rules, reuse prevention (P0 #5) |
| Stale super admin scan | access-review-service.ts | Monthly scan: flag super_admins inactive >60 days (I-17) |
| Stale user scan | access-review-service.ts | Monthly scan: flag org users inactive >90 days (I-17) |
| Auto-disable | access-review-service.ts | 14-day grace period, auto-disable + session termination (I-17) |
| Review actions | access-review-service.ts | Confirm or disable flagged users (I-17) |
| Quarterly report | access-review-service.ts | User counts, MFA adoption, role distribution per tenant (I-17) |
| SOC 2 report | compliance-report-service.ts | User access review, stale accounts, access changes (I-18) |
| Privileged access report | compliance-report-service.ts | Super/tenant admins, API keys, SCIM tokens (I-18) |
| GDPR DSAR export | compliance-report-service.ts | All user data: profile, sessions, audit logs, API keys (I-18) |

## API
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | - | Health check |
| GET | /ready | - | Readiness probe |
| GET | /api/v1/users/permissions | tenant | List permission catalog |
| GET | /api/v1/users/permissions/hierarchy | tenant | Get role hierarchy |
| GET | /api/v1/users/roles | tenant | List all roles |
| GET | /api/v1/users/roles/:id | tenant | Get role details + effective permissions |
| POST | /api/v1/users/roles | tenant | Create custom role |
| PUT | /api/v1/users/roles/:id | tenant | Update custom role |
| DELETE | /api/v1/users/roles/:id | tenant | Delete custom role |
| POST | /api/v1/users/roles/check | tenant | Check if role has permission |
| GET | /api/v1/users/team | tenant | List team members |
| GET | /api/v1/users/team/stats | tenant | Team member counts by status |
| GET | /api/v1/users/team/:userId | tenant | Get member details |
| POST | /api/v1/users/team/invite | tenant | Invite user by email |
| POST | /api/v1/users/team/:userId/accept | tenant | Accept invitation |
| PUT | /api/v1/users/team/:userId/role | tenant | Change user role |
| POST | /api/v1/users/team/:userId/deactivate | tenant | Deactivate member |
| POST | /api/v1/users/team/:userId/reactivate | tenant | Reactivate member |
| PUT | /api/v1/users/team/:userId/designation | tenant | Set user designation (cosmetic tag, max 50 chars) |
| DELETE | /api/v1/users/team/:userId | tenant | Remove member (blocked for tenant_admin) |
| GET | /api/v1/users/sso | tenant | Get SSO config |
| PUT | /api/v1/users/sso/saml | tenant | Configure SAML 2.0 |
| PUT | /api/v1/users/sso/oidc | tenant | Configure OIDC |
| POST | /api/v1/users/sso/test | tenant | Test SSO connection |
| DELETE | /api/v1/users/sso | tenant | Disable SSO |
| POST | /api/v1/users/mfa/setup | user | Begin TOTP setup |
| POST | /api/v1/users/mfa/verify | user | Verify TOTP + enable MFA |
| POST | /api/v1/users/mfa/validate | user | Validate TOTP on login |
| DELETE | /api/v1/users/mfa | user | Disable MFA |
| GET | /api/v1/users/mfa/backup-codes | user | Regenerate backup codes |
| POST | /api/v1/users/mfa/backup-codes/verify | user | Use a backup code |
| PUT | /api/v1/users/mfa/policy | tenant | Set MFA enforcement policy |
| GET | /api/v1/users/mfa/policy | tenant | Get MFA policy |
| GET | /api/v1/users/mfa/status | user | Get MFA status for user |
| POST | /api/v1/users/break-glass/setup | admin | Create break-glass account |
| POST | /api/v1/users/break-glass/login | - | Login with recovery code |
| POST | /api/v1/users/break-glass/rotate | admin | Rotate recovery codes |
| GET | /api/v1/users/break-glass/log | admin | Usage history |
| GET | /api/v1/users/sessions | user | List active sessions |
| DELETE | /api/v1/users/sessions/:id | user | Revoke session |
| DELETE | /api/v1/users/sessions | user | Revoke all sessions |
| GET | /api/v1/users/sessions/count | user | Count active sessions |
| GET | /api/v1/admin/access-reviews | super_admin | List all access reviews |
| PUT | /api/v1/admin/access-reviews/:reviewId | super_admin | Confirm or disable flagged user |
| GET | /api/v1/admin/access-reviews/quarterly | super_admin | Platform-wide quarterly summary |
| GET | /api/v1/settings/access-reviews | tenant_admin | List own org access reviews |
| PUT | /api/v1/settings/access-reviews/:reviewId | tenant_admin | Confirm or disable own org user |
| GET | /api/v1/settings/access-reviews/quarterly | tenant_admin | Own org quarterly summary |
| POST | /api/v1/admin/compliance/reports | super_admin | Generate compliance report |
| GET | /api/v1/admin/compliance/reports | super_admin | List generated reports |
| GET | /api/v1/admin/compliance/reports/:reportId | super_admin | Download report JSON |
| POST | /api/v1/settings/compliance/dsar | tenant_admin | Generate DSAR for own org user |
| GET | /api/v1/settings/compliance/dsar/:reportId | tenant_admin | Download DSAR export |

## Config
| Env Var | Default | Purpose |
|---------|---------|---------|
| TI_USER_MANAGEMENT_PORT | 3016 | Service port |
| TI_USER_MANAGEMENT_HOST | 0.0.0.0 | Bind address |
| TI_MFA_ISSUER | ETIP Platform | TOTP issuer name in QR code |
| TI_MFA_BACKUP_CODE_COUNT | 10 | Backup codes generated per setup |
| TI_BREAK_GLASS_SESSION_TTL_MIN | 30 | Break-glass session duration |
| TI_SSO_CALLBACK_BASE_URL | http://localhost:3016 | SSO callback base URL |
