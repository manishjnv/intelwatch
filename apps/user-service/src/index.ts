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
} from './service.js';

export { MfaService } from './mfa-service.js';
export { SsoService, type SsoConfigInput, type SsoCallbackClaims, type GroupRoleMapping } from './sso-service.js';
export {
  generateVerificationToken, buildEmailJobPayload,
  verifyEmail, resendVerification, cleanupUnverifiedUsers,
} from './email-verification-service.js';

export { prisma, disconnectPrisma } from './prisma.js';

export * as userRepo from './repository.js';
export * as mfaRepo from './mfa-repository.js';
export * as ssoRepo from './sso-repository.js';
export * as emailVerificationRepo from './email-verification-repository.js';
