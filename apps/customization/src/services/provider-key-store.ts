/**
 * @module provider-key-store
 * @description CRUD for AI provider API keys (Anthropic, OpenAI, Google).
 * Keys stored masked in DB; full key only passed through for test connection.
 * Platform-level (no tenant scoping — super-admin only).
 */

import type { PrismaClient } from '@prisma/client';
import { AppError } from '@etip/shared-utils';
import { sha256 } from '@etip/shared-utils';
import type { AiProvider } from '@etip/shared-utils';

const VALID_PROVIDERS: AiProvider[] = ['anthropic', 'openai', 'google'];

const KEY_PREFIXES: Record<AiProvider, string> = {
  anthropic: 'sk-ant-',
  openai: 'sk-',
  google: 'AIza',
};

export interface ProviderKeyInfo {
  provider: AiProvider;
  keyMasked: string;
  isValid: boolean;
  lastTested: Date | null;
  updatedAt: Date;
}

export interface SetKeyInput {
  provider: AiProvider;
  apiKey: string;
  updatedBy: string;
}

export interface TestResult {
  provider: AiProvider;
  success: boolean;
  latencyMs: number;
  error?: string;
}

/** Mask an API key: show prefix + last 4 chars */
function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 7) + '***' + key.slice(-4);
}

export class ProviderKeyStore {
  constructor(private readonly prisma: PrismaClient) {}

  /** Validate key prefix for a provider */
  validateKeyPrefix(provider: AiProvider, key: string): boolean {
    const prefix = KEY_PREFIXES[provider];
    return key.startsWith(prefix);
  }

  /** Set (create or update) an API key for a provider */
  async setKey(input: SetKeyInput): Promise<ProviderKeyInfo> {
    if (!VALID_PROVIDERS.includes(input.provider)) {
      throw new AppError(400, `Invalid provider: ${input.provider}`, 'INVALID_PROVIDER');
    }

    if (!this.validateKeyPrefix(input.provider, input.apiKey)) {
      throw new AppError(400,
        `Invalid key prefix for ${input.provider}. Expected: ${KEY_PREFIXES[input.provider]}`,
        'INVALID_KEY_PREFIX',
      );
    }

    const masked = maskKey(input.apiKey);
    const hash = sha256(input.apiKey);

    const record = await this.prisma.providerApiKey.upsert({
      where: { provider: input.provider },
      create: {
        provider: input.provider,
        keyMasked: masked,
        keyHash: hash,
        isValid: true,
        updatedBy: input.updatedBy,
      },
      update: {
        keyMasked: masked,
        keyHash: hash,
        isValid: true,
        lastTested: null,
        updatedBy: input.updatedBy,
      },
    });

    return {
      provider: record.provider as AiProvider,
      keyMasked: record.keyMasked,
      isValid: record.isValid,
      lastTested: record.lastTested,
      updatedAt: record.updatedAt,
    };
  }

  /** Get key info for a provider (never returns the actual key) */
  async getKey(provider: AiProvider): Promise<ProviderKeyInfo | null> {
    const record = await this.prisma.providerApiKey.findUnique({
      where: { provider },
    });

    if (!record) return null;

    return {
      provider: record.provider as AiProvider,
      keyMasked: record.keyMasked,
      isValid: record.isValid,
      lastTested: record.lastTested,
      updatedAt: record.updatedAt,
    };
  }

  /** Get all provider key statuses */
  async getAllKeys(): Promise<ProviderKeyInfo[]> {
    const records = await this.prisma.providerApiKey.findMany({
      orderBy: { provider: 'asc' },
    });

    return records.map(r => ({
      provider: r.provider as AiProvider,
      keyMasked: r.keyMasked,
      isValid: r.isValid,
      lastTested: r.lastTested,
      updatedAt: r.updatedAt,
    }));
  }

  /** Remove an API key for a provider */
  async removeKey(provider: AiProvider): Promise<boolean> {
    try {
      await this.prisma.providerApiKey.delete({
        where: { provider },
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Test connection for a provider (uses provided key, not stored) */
  async testConnection(provider: AiProvider, apiKey: string): Promise<TestResult> {
    const start = Date.now();

    try {
      switch (provider) {
        case 'anthropic':
          await this.testAnthropic(apiKey);
          break;
        case 'openai':
          await this.testOpenAI(apiKey);
          break;
        case 'google':
          await this.testGoogle(apiKey);
          break;
        default:
          throw new AppError(400, `Unknown provider: ${provider}`, 'UNKNOWN_PROVIDER');
      }

      // Mark as valid in DB
      await this.prisma.providerApiKey.updateMany({
        where: { provider },
        data: { isValid: true, lastTested: new Date() },
      });

      return { provider, success: true, latencyMs: Date.now() - start };
    } catch (err) {
      // Mark as invalid in DB
      await this.prisma.providerApiKey.updateMany({
        where: { provider },
        data: { isValid: false, lastTested: new Date() },
      });

      return {
        provider,
        success: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /** Test Anthropic API key by listing models */
  private async testAnthropic(apiKey: string): Promise<void> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401) throw new Error('Invalid API key');
    if (res.status === 403) throw new Error('API key lacks permissions');
    // 200 or 429 both mean the key is valid
    if (res.status !== 200 && res.status !== 429) {
      throw new Error(`Unexpected status: ${res.status}`);
    }
  }

  /** Test OpenAI API key by listing models */
  private async testOpenAI(apiKey: string): Promise<void> {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401) throw new Error('Invalid API key');
    if (res.status !== 200 && res.status !== 429) {
      throw new Error(`Unexpected status: ${res.status}`);
    }
  }

  /** Test Google AI API key by listing models */
  private async testGoogle(apiKey: string): Promise<void> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (res.status === 400 || res.status === 403) throw new Error('Invalid API key');
    if (res.status !== 200 && res.status !== 429) {
      throw new Error(`Unexpected status: ${res.status}`);
    }
  }
}
