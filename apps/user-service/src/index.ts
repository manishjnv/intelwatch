export {
  UserService,
  type RegisterInput,
  type LoginInput,
  type RefreshInput,
  type AuthTokens,
  type RegisterResult,
  type LoginResult,
  type MfaLoginResult,
  type SafeUserResult,
  type SessionListResult,
} from './service.js';

export { MfaService } from './mfa-service.js';
export { SsoService, type SsoConfigInput, type SsoCallbackClaims, type GroupRoleMapping } from './sso-service.js';
export {
  generateVerificationToken, buildEmailJobPayload,
  verifyEmail, resendVerification, cleanupUnverifiedUsers,
} from './email-verification-service.js';

export { AuditService, type IntegrityResult, type IntegrityViolation } from './audit-service.js';
export { buildAuditReplicationJob, replicateAuditLog, getS3Config } from './audit-replication.js';
export { lookupIP, enrichSessionGeo, initGeoIP, clearGeoCache, type GeoData } from './geoip.js';

export { AccessReviewService } from './access-review-service.js';
export { ComplianceReportService } from './compliance-report-service.js';

export { prisma, disconnectPrisma } from './prisma.js';

export * as userRepo from './repository.js';
export * as mfaRepo from './mfa-repository.js';
export * as ssoRepo from './sso-repository.js';
export * as emailVerificationRepo from './email-verification-repository.js';
export * as accessReviewRepo from './access-review-repository.js';
export * as complianceReportRepo from './compliance-report-repository.js';
