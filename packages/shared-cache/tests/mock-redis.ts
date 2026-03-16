import type Redis from 'ioredis';

interface StoreEntry { value: string; expiresAt: number | null; }

export class MockRedis {
  private store = new Map<string, StoreEntry>();

  async get(key: string): Promise<string | null> {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt !== null && Date.now() > e.expiresAt) { this.store.delete(key); return null; }
    return e.value;
  }
  async set(key: string, value: string): Promise<'OK'> { this.store.set(key, { value, expiresAt: null }); return 'OK'; }
  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, { value, expiresAt: Date.now() + seconds * 1000 }); return 'OK';
  }
  async del(...keys: string[]): Promise<number> { let c = 0; for (const k of keys) if (this.store.delete(k)) c++; return c; }
  async exists(key: string): Promise<number> {
    const e = this.store.get(key);
    if (!e) return 0;
    if (e.expiresAt !== null && Date.now() > e.expiresAt) { this.store.delete(key); return 0; }
    return 1;
  }
  async ttl(key: string): Promise<number> {
    const e = this.store.get(key);
    if (!e) return -2;
    if (e.expiresAt === null) return -1;
    const rem = Math.ceil((e.expiresAt - Date.now()) / 1000);
    if (rem <= 0) { this.store.delete(key); return -2; }
    return rem;
  }
  async scan(cursor: string, _m: string, pattern: string, _c: string, _cv: number): Promise<[string, string[]]> {
    const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const matched: string[] = [];
    for (const k of this.store.keys()) if (re.test(k)) matched.push(k);
    return ['0', matched];
  }
  async ping(): Promise<string> { return 'PONG'; }
  clear(): void { this.store.clear(); }
}

export function createMockRedis(): Redis { return new MockRedis() as unknown as Redis; }
