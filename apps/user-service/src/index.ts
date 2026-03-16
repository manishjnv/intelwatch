/**
 * @module @etip/user-service
 * @description User management service for ETIP.
 * Handles registration, login, token refresh, logout, and profile retrieval.
 *
 * @example
 * ```typescript
 * import { UserService } from '@etip/user-service';
 * const userService = new UserService();
 * const result = await userService.login({ email, password, ipAddress, userAgent });
 * ```
 */

export {
  UserService,
  type RegisterInput,
  type LoginInput,
  type RefreshInput,
  type AuthTokens,
  type RegisterResult,
  type LoginResult,
  type SafeUserResult,
} from './service.js';

export { prisma, disconnectPrisma } from './prisma.js';

export * as userRepo from './repository.js';
