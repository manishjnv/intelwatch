/**
 * @module @etip/shared-utils/stix-id
 * @description STIX 2.1 identifier generator.
 * Format: `{type}--{uuid-v4}` per STIX specification.
 */
import { randomUUID } from 'node:crypto';

/**
 * Generate a STIX 2.1 compliant identifier.
 * Format: `{stixType}--{uuid-v4}`
 *
 * @param stixType - STIX object type (e.g., 'indicator', 'threat-actor', 'bundle')
 * @returns STIX ID string
 *
 * @example
 * ```typescript
 * generateStixId('indicator');    // 'indicator--550e8400-e29b-41d4-a716-446655440000'
 * generateStixId('bundle');       // 'bundle--...'
 * generateStixId('threat-actor'); // 'threat-actor--...'
 * ```
 */
export function generateStixId(stixType: string): string {
  return `${stixType}--${randomUUID()}`;
}

/**
 * Validate that a string is a well-formed STIX 2.1 identifier.
 *
 * @param id - String to validate
 * @returns true if matches `{type}--{uuid}` format
 */
export function isValidStixId(id: string): boolean {
  return /^[a-z][a-z0-9-]+--[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
}

/**
 * Extract the STIX object type from a STIX identifier.
 *
 * @param id - STIX ID (e.g., 'indicator--550e8400-...')
 * @returns The type portion (e.g., 'indicator'), or null if invalid
 */
export function extractStixType(id: string): string | null {
  const match = id.match(/^([a-z][a-z0-9-]+)--/);
  return match ? match[1] ?? null : null;
}
