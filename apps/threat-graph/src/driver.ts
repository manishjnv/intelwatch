import neo4j, { type Driver, type Session } from 'neo4j-driver';
import { AppError } from '@etip/shared-utils';
import { getLogger } from './logger.js';

let _driver: Driver | null = null;

/**
 * Initializes the Neo4j driver singleton from a bolt:// URL.
 * URL format: bolt://user:password@host:port
 */
export function initNeo4jDriver(url: string): Driver {
  const logger = getLogger();

  try {
    const parsed = new URL(url);
    const scheme = parsed.protocol.replace(':', '');
    const host = parsed.hostname;
    const port = parsed.port || '7687';
    const user = decodeURIComponent(parsed.username || 'neo4j');
    const password = decodeURIComponent(parsed.password || '');

    _driver = neo4j.driver(
      `${scheme}://${host}:${port}`,
      neo4j.auth.basic(user, password),
      {
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 10_000,
        connectionTimeout: 5_000,
        logging: {
          level: 'warn',
          logger: (level: string, message: string) => {
            if (level === 'error') logger.error({ neo4j: true }, message);
            else if (level === 'warn') logger.warn({ neo4j: true }, message);
          },
        },
      },
    );

    logger.info({ host, port }, 'Neo4j driver initialized');
    return _driver;
  } catch (err) {
    throw new AppError(500, `Failed to initialize Neo4j driver: ${(err as Error).message}`, 'NEO4J_INIT_ERROR');
  }
}

/** Returns the Neo4j driver singleton. Throws if not initialized. */
export function getNeo4jDriver(): Driver {
  if (!_driver) throw new AppError(500, 'Neo4j driver not initialized — call initNeo4jDriver() first', 'NEO4J_NOT_INITIALIZED');
  return _driver;
}

/** Creates a new Neo4j session with the specified database. */
export function createSession(database: string = 'neo4j'): Session {
  return getNeo4jDriver().session({ database });
}

/** Closes the Neo4j driver gracefully. */
export async function closeNeo4jDriver(): Promise<void> {
  if (_driver) {
    await _driver.close();
    _driver = null;
    getLogger().info('Neo4j driver closed');
  }
}

/** Verifies Neo4j connectivity. Returns true if healthy. */
export async function verifyNeo4jConnection(): Promise<boolean> {
  try {
    const session = createSession();
    try {
      await session.run('RETURN 1 AS ping');
      return true;
    } finally {
      await session.close();
    }
  } catch {
    return false;
  }
}
