import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock neo4j-driver before importing our module
vi.mock('neo4j-driver', () => {
  const mockSession = {
    run: vi.fn().mockResolvedValue({ records: [{ get: () => 1 }] }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockDriver = {
    session: vi.fn().mockReturnValue(mockSession),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    default: {
      driver: vi.fn().mockReturnValue(mockDriver),
      auth: { basic: vi.fn().mockReturnValue({ scheme: 'basic' }) },
    },
  };
});

// Reset module state between tests
let initNeo4jDriver: (url: string) => unknown;
let getNeo4jDriver: () => unknown;
let createSession: (database?: string) => unknown;
let closeNeo4jDriver: () => Promise<void>;
let verifyNeo4jConnection: () => Promise<boolean>;

beforeEach(async () => {
  vi.resetModules();
  vi.doMock('../src/logger.js', () => ({
    getLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }));
  const mod = await import('../src/driver.js');
  initNeo4jDriver = mod.initNeo4jDriver;
  getNeo4jDriver = mod.getNeo4jDriver;
  createSession = mod.createSession;
  closeNeo4jDriver = mod.closeNeo4jDriver;
  verifyNeo4jConnection = mod.verifyNeo4jConnection;
});

describe('Threat Graph — Neo4j Driver', () => {
  it('initializes driver from bolt URL', () => {
    const driver = initNeo4jDriver('bolt://neo4j:password@localhost:7687');
    expect(driver).toBeDefined();
  });

  it('getNeo4jDriver throws if not initialized', () => {
    expect(() => getNeo4jDriver()).toThrow('Neo4j driver not initialized');
  });

  it('getNeo4jDriver returns driver after init', () => {
    initNeo4jDriver('bolt://neo4j:password@localhost:7687');
    const driver = getNeo4jDriver();
    expect(driver).toBeDefined();
  });

  it('createSession creates a session', () => {
    initNeo4jDriver('bolt://neo4j:password@localhost:7687');
    const session = createSession();
    expect(session).toBeDefined();
  });

  it('closeNeo4jDriver closes the driver', async () => {
    initNeo4jDriver('bolt://neo4j:password@localhost:7687');
    await closeNeo4jDriver();
    expect(() => getNeo4jDriver()).toThrow('Neo4j driver not initialized');
  });

  it('verifyNeo4jConnection returns true when healthy', async () => {
    initNeo4jDriver('bolt://neo4j:password@localhost:7687');
    const ok = await verifyNeo4jConnection();
    expect(ok).toBe(true);
  });

  it('parses URL with encoded password', () => {
    const driver = initNeo4jDriver('bolt://neo4j:p%40ss%23word@localhost:7687');
    expect(driver).toBeDefined();
  });

  it('handles default port when not specified', () => {
    const driver = initNeo4jDriver('bolt://neo4j:password@localhost');
    expect(driver).toBeDefined();
  });
});
