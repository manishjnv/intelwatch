/**
 * @module @etip/shared-auth/service-jwt
 * @description Short-lived service-to-service JWT tokens (60s TTL).
 * Zero-trust internal auth between microservices inside Docker network.
 */
import jwt from 'jsonwebtoken';
import { AppError } from '@etip/shared-utils';

const SERVICE_JWT_TTL = 60;

export interface ServiceTokenPayload {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

let _serviceSecret = '';

export function loadServiceJwtSecret(env: Record<string, string | undefined>): void {
  const secret = env['TI_SERVICE_JWT_SECRET'];
  if (!secret || secret.length < 16) {
    throw new AppError(500, 'TI_SERVICE_JWT_SECRET must be at least 16 characters', 'CONFIG_ERROR');
  }
  _serviceSecret = secret;
}

export function signServiceToken(callerService: string, targetService: string): string {
  if (!_serviceSecret) {
    throw new AppError(500, 'Service JWT not configured — call loadServiceJwtSecret() first', 'CONFIG_ERROR');
  }
  return jwt.sign({ iss: callerService, aud: targetService }, _serviceSecret, { expiresIn: SERVICE_JWT_TTL });
}

export function verifyServiceToken(token: string, expectedIssuer?: string): ServiceTokenPayload {
  if (!_serviceSecret) {
    throw new AppError(500, 'Service JWT not configured', 'CONFIG_ERROR');
  }
  try {
    const decoded = jwt.verify(token, _serviceSecret) as ServiceTokenPayload;
    if (expectedIssuer && decoded.iss !== expectedIssuer) {
      throw new AppError(403, `Unexpected service issuer: ${decoded.iss}`, 'SERVICE_AUTH_FAILED');
    }
    return decoded;
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'Service token expired', 'SERVICE_TOKEN_EXPIRED');
    }
    throw new AppError(401, 'Invalid service token', 'SERVICE_TOKEN_INVALID');
  }
}
