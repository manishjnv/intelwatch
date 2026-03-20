/**
 * @module @etip/shared-utils/date-helpers
 * @description Date utility functions used across the platform.
 * All dates in ETIP are stored and transmitted as ISO 8601 strings.
 */

/**
 * Format a Date or ISO string to a consistent ISO 8601 string.
 * Returns the string as-is if already valid ISO.
 *
 * @param input - Date object, ISO string, or Unix timestamp (ms)
 * @returns ISO 8601 datetime string
 */
export function formatDate(input: Date | string | number): string {
  if (typeof input === 'string') {
    const parsed = new Date(input);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Invalid date string: ${input}`);
    }
    return parsed.toISOString();
  }
  if (typeof input === 'number') {
    // Handle both seconds and milliseconds
    const ms = input < 1e12 ? input * 1000 : input;
    return new Date(ms).toISOString();
  }
  return input.toISOString();
}

/**
 * Parse an ISO string or Unix timestamp to a Date object.
 *
 * @param input - ISO string or Unix timestamp (seconds or milliseconds)
 * @returns Date object
 * @throws Error if input cannot be parsed
 */
export function parseDate(input: string | number): Date {
  if (typeof input === 'number') {
    const ms = input < 1e12 ? input * 1000 : input;
    return new Date(ms);
  }
  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error(`Cannot parse date: ${input}`);
  }
  return date;
}

/**
 * Generate a date-based partition key: `YYYY-MM-DD`.
 * Used for Redis key namespacing and ES index rotation.
 *
 * @param date - Date to generate key for (defaults to now)
 * @returns String in `YYYY-MM-DD` format
 */
export function getDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Subtract days from a date and return a new Date.
 *
 * @param days - Number of days to subtract
 * @param from - Starting date (defaults to now)
 * @returns New Date object
 */
export function subDays(days: number, from: Date = new Date()): Date {
  const result = new Date(from);
  result.setDate(result.getDate() - days);
  return result;
}

/**
 * Add days to a date and return a new Date.
 *
 * @param days - Number of days to add
 * @param from - Starting date (defaults to now)
 * @returns New Date object
 */
export function addDays(days: number, from: Date = new Date()): Date {
  const result = new Date(from);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Calculate the number of days between two dates.
 *
 * @param start - Start date
 * @param end - End date (defaults to now)
 * @returns Number of days (positive if end > start)
 */
export function daysBetween(start: Date | string, end: Date | string = new Date()): number {
  const s = typeof start === 'string' ? new Date(start) : start;
  const e = typeof end === 'string' ? new Date(end) : end;
  const diffMs = e.getTime() - s.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check if a date is older than N days from now.
 *
 * @param date - Date to check
 * @param days - Threshold in days
 * @returns true if the date is older than the threshold
 */
export function isOlderThan(date: Date | string, days: number): boolean {
  return daysBetween(date) >= days;
}

/**
 * Get current ISO timestamp. Convenience wrapper.
 */
export function nowISO(): string {
  return new Date().toISOString();
}
