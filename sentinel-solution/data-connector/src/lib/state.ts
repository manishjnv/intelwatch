import { TableClient } from '@azure/data-tables';

const TABLE_NAME = 'ETIPSyncState';
const PARTITION_KEY = 'sync';
const ROW_KEY = 'lastTimestamp';

interface SyncStateEntity {
  partitionKey: string;
  rowKey: string;
  lastSyncTimestamp: string;
}

/**
 * Manages sync state using Azure Table Storage.
 * Tracks the last successful sync timestamp so incremental fetches
 * only pull IOCs updated since the previous run.
 */
export class SyncState {
  private tableClient: TableClient;

  constructor() {
    const connectionString = process.env.AzureWebJobsStorage;
    if (!connectionString) {
      throw new Error('Missing required env var: AzureWebJobsStorage');
    }

    this.tableClient = TableClient.fromConnectionString(connectionString, TABLE_NAME, {
      allowInsecureConnection: connectionString.includes('UseDevelopmentStorage'),
    });
  }

  /**
   * Ensure the state table exists, creating it if needed.
   */
  async ensureTable(): Promise<void> {
    await this.tableClient.createTable().catch((err) => {
      // 409 = table already exists, safe to ignore
      if (err.statusCode !== 409) throw err;
    });
  }

  /**
   * Get the timestamp of the last successful sync.
   * Returns null if no sync has ever completed (first run).
   */
  async getLastSyncTimestamp(): Promise<string | null> {
    try {
      const entity = await this.tableClient.getEntity<SyncStateEntity>(PARTITION_KEY, ROW_KEY);
      return entity.lastSyncTimestamp ?? null;
    } catch (err: unknown) {
      const error = err as { statusCode?: number };
      if (error.statusCode === 404) return null;
      throw err;
    }
  }

  /**
   * Save the timestamp of the most recent successful sync.
   * Uses upsert to handle both first-run insert and subsequent updates.
   */
  async setLastSyncTimestamp(timestamp: string): Promise<void> {
    await this.tableClient.upsertEntity<SyncStateEntity>(
      {
        partitionKey: PARTITION_KEY,
        rowKey: ROW_KEY,
        lastSyncTimestamp: timestamp,
      },
      'Replace',
    );
  }
}
