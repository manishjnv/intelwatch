/**
 * Module-level counters for normalization pipeline diagnostics.
 * State is in-memory — resets on service restart (DECISION-013).
 */

let unknownTypeCount = 0;
let lastUnknownType: string | null = null;

/** Increment the unknown-type counter and record the raw IOC type string. */
export function incrementUnknownType(rawType: string): void {
  unknownTypeCount++;
  lastUnknownType = rawType;
}

/** Return current unknown-type stats for inclusion in the /stats endpoint. */
export function getUnknownTypeStats(): { unknownTypeCount: number; lastUnknownType: string | null } {
  return { unknownTypeCount, lastUnknownType };
}

/** Reset counters — for use in tests only. */
export function resetUnknownTypeCounter(): void {
  unknownTypeCount = 0;
  lastUnknownType = null;
}
