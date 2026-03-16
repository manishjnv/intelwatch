export function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
export async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries: number = 3, baseDelayMs: number = 1000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await fn(); } catch (err) {
      lastError = err;
      if (attempt < maxRetries) { const delay = baseDelayMs * Math.pow(2, attempt); await sleep(delay + Math.random() * delay * 0.1); }
    }
  }
  throw lastError;
}
