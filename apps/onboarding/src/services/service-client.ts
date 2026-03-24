/**
 * @module services/service-client
 * @description HTTP client for inter-service communication with service JWT auth.
 * Used by DemoSeeder to POST real data to downstream services.
 */
import { signServiceToken } from '@etip/shared-auth';
import { getLogger } from '../logger.js';

export interface ServiceClientOptions {
  baseUrl: string;
  targetService: string;
  timeoutMs?: number;
}

/**
 * Authenticated HTTP client for service-to-service calls.
 * Signs requests with a 60s service JWT.
 */
export class ServiceClient {
  private readonly baseUrl: string;
  private readonly targetService: string;
  private readonly timeoutMs: number;

  constructor(opts: ServiceClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.targetService = opts.targetService;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  /** POST JSON to a service endpoint. Returns parsed response body or null on failure. */
  async post<T = unknown>(path: string, body: unknown): Promise<T | null> {
    const logger = getLogger();
    const url = `${this.baseUrl}${path}`;
    const token = signServiceToken('onboarding', this.targetService);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        logger.warn({ url, status: res.status }, 'Service call failed');
        return null;
      }

      return await res.json() as T;
    } catch (err) {
      logger.warn({ url, err: (err as Error).message }, 'Service call error');
      return null;
    }
  }
}
