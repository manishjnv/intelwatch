/**
 * @module @etip/shared-auth/password
 * @description Secure password hashing and verification using bcryptjs.
 * Cost factor 12 — balances security vs. latency (~250ms on modern hardware).
 */
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

/**
 * Hash a plaintext password with bcrypt.
 * @param password - Plaintext password (min 12 chars enforced by Zod schema)
 * @returns bcrypt hash string
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
  return bcrypt.hash(password, salt);
}

/**
 * Verify a plaintext password against a bcrypt hash.
 * Uses constant-time comparison to prevent timing attacks.
 * @returns true if password matches hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Hash an API key for storage. API keys are never stored in plaintext.
 * Uses same bcrypt approach as passwords.
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
  return bcrypt.hash(apiKey, salt);
}

/**
 * Verify an API key against its stored hash.
 */
export async function verifyApiKey(
  apiKey: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(apiKey, hash);
}
