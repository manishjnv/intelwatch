/**
 * Cron expression utilities for schedule comparison.
 *
 * Converts common cron expressions to approximate interval in minutes
 * for comparing feed schedules against plan minimums.
 */

/**
 * Parse a cron expression into approximate interval in minutes.
 * Returns 0 for expressions that can't be parsed to a simple interval.
 *
 * Supports common patterns:
 * - * /N * * * *  → every N minutes
 * - 0 * /N * * *  → every N hours (N * 60 minutes)
 * - Fixed minute + * /N hour → N * 60
 */
export function cronToMinutes(cron: string): number {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return 0;

  const minute = parts[0] as string;
  const hour = parts[1] as string;

  // */N in minute field → every N minutes
  if (minute.startsWith('*/')) {
    const n = parseInt(minute.slice(2), 10);
    return isNaN(n) || n <= 0 ? 0 : n;
  }

  // Fixed minute (e.g. "0") + */N in hour field → every N hours
  if (hour.startsWith('*/')) {
    const n = parseInt(hour.slice(2), 10);
    return isNaN(n) || n <= 0 ? 0 : n * 60;
  }

  // Fixed minute + * hour → every 60 minutes (once per hour)
  if (/^\d+$/.test(minute) && hour === '*') {
    return 60;
  }

  // Can't determine interval for complex expressions
  return 0;
}
