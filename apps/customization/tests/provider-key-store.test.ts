import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderKeyStore } from '../src/services/provider-key-store.js';

// Mock Prisma client
function createMockPrisma() {
  return {
    providerApiKey: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
  } as any;
}

describe('ProviderKeyStore', () => {
  let store: ProviderKeyStore;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    store = new ProviderKeyStore(mockPrisma);
  });

  describe('validateKeyPrefix', () => {
    it('validates Anthropic key prefix', () => {
      expect(store.validateKeyPrefix('anthropic', 'sk-ant-api03-abc123')).toBe(true);
      expect(store.validateKeyPrefix('anthropic', 'sk-wrong-abc123')).toBe(false);
    });

    it('validates OpenAI key prefix', () => {
      expect(store.validateKeyPrefix('openai', 'sk-proj-abc123xyz')).toBe(true);
      expect(store.validateKeyPrefix('openai', 'AI-wrong')).toBe(false);
    });

    it('validates Google key prefix', () => {
      expect(store.validateKeyPrefix('google', 'AIzaSyB-abc123')).toBe(true);
      expect(store.validateKeyPrefix('google', 'sk-wrong')).toBe(false);
    });
  });

  describe('setKey', () => {
    it('creates key with masked value', async () => {
      mockPrisma.providerApiKey.upsert.mockResolvedValue({
        provider: 'anthropic',
        keyMasked: 'sk-ant-***bc12',
        isValid: true,
        lastTested: null,
        updatedAt: new Date(),
      });

      const result = await store.setKey({
        provider: 'anthropic',
        apiKey: 'sk-ant-api03-longkeyvalue123abc12',
        updatedBy: 'admin-1',
      });

      expect(result.provider).toBe('anthropic');
      expect(result.keyMasked).toContain('***');
      expect(result.isValid).toBe(true);
      expect(mockPrisma.providerApiKey.upsert).toHaveBeenCalledOnce();
    });

    it('rejects invalid provider', async () => {
      await expect(store.setKey({
        provider: 'invalid' as any,
        apiKey: 'sk-ant-abc123',
        updatedBy: 'admin-1',
      })).rejects.toThrow('Invalid provider');
    });

    it('rejects wrong key prefix', async () => {
      await expect(store.setKey({
        provider: 'anthropic',
        apiKey: 'sk-proj-wrong-prefix',
        updatedBy: 'admin-1',
      })).rejects.toThrow('Invalid key prefix');
    });
  });

  describe('getKey', () => {
    it('returns key info when exists', async () => {
      mockPrisma.providerApiKey.findUnique.mockResolvedValue({
        provider: 'openai',
        keyMasked: 'sk-****xyz1',
        isValid: true,
        lastTested: new Date(),
        updatedAt: new Date(),
      });

      const result = await store.getKey('openai');
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('openai');
    });

    it('returns null when not exists', async () => {
      mockPrisma.providerApiKey.findUnique.mockResolvedValue(null);
      const result = await store.getKey('google');
      expect(result).toBeNull();
    });
  });

  describe('getAllKeys', () => {
    it('returns all configured providers', async () => {
      mockPrisma.providerApiKey.findMany.mockResolvedValue([
        { provider: 'anthropic', keyMasked: 'sk-***', isValid: true, lastTested: null, updatedAt: new Date() },
        { provider: 'openai', keyMasked: 'sk-***', isValid: false, lastTested: new Date(), updatedAt: new Date() },
      ]);

      const result = await store.getAllKeys();
      expect(result).toHaveLength(2);
      expect(result[0].provider).toBe('anthropic');
    });
  });

  describe('removeKey', () => {
    it('returns true on successful deletion', async () => {
      mockPrisma.providerApiKey.delete.mockResolvedValue({});
      const result = await store.removeKey('anthropic');
      expect(result).toBe(true);
    });

    it('returns false when key not found', async () => {
      mockPrisma.providerApiKey.delete.mockRejectedValue(new Error('Not found'));
      const result = await store.removeKey('google');
      expect(result).toBe(false);
    });
  });
});
