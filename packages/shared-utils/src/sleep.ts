/**
 * @module @etip/shared-utils/sleep
 * @description Async delay utilities for retry logic, polling, and testing.
 */

/**
 * Pause execution for a specified duration.
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the delay
 *
 * @example
 * ```typescript
 * await sleep(1000); // Wait 1 second
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff.
 *
 * @param fn - Async function to retry
 * @param maxRetries - Maximum number of attempts (default: 3)
 * @param baseDelayMs - Initial delay between retries in ms (default: 1000)
 * @returns Result of the successful function call
 * @throws Last error after all retries exhausted
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(() => fetchExternalAPI(), 3, 1000);
 * ```
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        const jitter = Math.random() * delay * 0.1;
        await sleep(delay + jitter);
      }
    }
  }
  throw lastError;
}
