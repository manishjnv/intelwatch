/**
 * @module @etip/shared-utils/hash
 * @description Cryptographic hashing utilities.
 * Uses Node.js built-in crypto — no external dependencies.
 */
import { createHash } from 'node:crypto';

/**
 * Compute SHA-256 hex digest of a string.
 * Used for deduplication keys, content hashing, and integrity checks.
 *
 * @param input - String to hash
 * @returns 64-character lowercase hex string
 *
 * @example
 * ```typescript
 * const dedupeKey = sha256(`ip:192.168.1.1:tenant-1`);
 * ```
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Compute MD5 hex digest of a string.
 * Used only for compatibility with legacy feeds — never for security.
 *
 * @param input - String to hash
 * @returns 32-character lowercase hex string
 */
export function md5(input: string): string {
  return createHash('md5').update(input).digest('hex');
}

/**
 * Build the canonical deduplication key for an IOC.
 * Format: SHA-256 of `{type}:{normalizedValue}:{tenantId}`.
 *
 * @param type - IOC type (e.g., 'ip', 'domain')
 * @param normalizedValue - Normalized (lowercased, trimmed) IOC value
 * @param tenantId - Tenant identifier
 * @returns 64-character hex hash
 */
export function buildDedupeKey(
  type: string,
  normalizedValue: string,
  tenantId: string
): string {
  return sha256(`${type}:${normalizedValue}:${tenantId}`);
}
