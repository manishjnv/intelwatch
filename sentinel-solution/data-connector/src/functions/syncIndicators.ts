import { app, InvocationContext, Timer } from '@azure/functions';
import { LogsIngestionClient } from '@azure/monitor-ingestion';
import { ClientSecretCredential } from '@azure/identity';
import { EtipClient } from '../lib/etip-client.js';
import { GraphClient } from '../lib/graph-client.js';
import { SyncState } from '../lib/state.js';
import { mapIocBatch } from '../lib/mapper.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * Main sync function: pulls IOCs from ETIP, maps to Graph tiIndicators,
 * submits to Sentinel, and writes stats to Log Analytics.
 */
async function syncIndicators(timer: Timer, context: InvocationContext): Promise<void> {
  const startTime = Date.now();
  context.log('ETIP Sentinel sync started');

  if (timer.isPastDue) {
    context.log('Timer is past due — running catch-up sync');
  }

  try {
    // --- Config ---
    const tenantId = requireEnv('AZURE_TENANT_ID');
    const clientId = requireEnv('AZURE_CLIENT_ID');
    const clientSecret = requireEnv('AZURE_CLIENT_SECRET');
    const workspaceId = requireEnv('AZURE_WORKSPACE_ID');

    // --- Initialize clients ---
    const etip = new EtipClient();
    const graph = new GraphClient(tenantId, clientId, clientSecret);
    const state = new SyncState();
    await state.ensureTable();

    // --- Step 1: Get last sync timestamp ---
    let lastSync = await state.getLastSyncTimestamp();
    if (!lastSync) {
      // First run: sync last 24 hours
      lastSync = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      context.log(`First sync — fetching IOCs from ${lastSync}`);
    } else {
      context.log(`Incremental sync — fetching IOCs updated since ${lastSync}`);
    }

    // --- Step 2: Fetch IOCs from ETIP ---
    const iocs = await etip.fetchIOCs(lastSync, context);
    context.log(`Fetched ${iocs.length} IOCs from ETIP`);

    // --- Step 3: Map and submit to Graph API ---
    if (iocs.length > 0) {
      const indicators = mapIocBatch(iocs);
      const result = await graph.submitIndicators(indicators, context);
      context.log(`Graph API: ${result.submitted} submitted, ${result.failed} failed`);
    } else {
      context.log('No new IOCs to sync');
    }

    // --- Step 5: Fetch stats from ETIP ---
    // --- Step 6: Write stats to Log Analytics custom table ---
    try {
      const stats = await etip.fetchStats();
      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
      const logsClient = new LogsIngestionClient(
        `https://${workspaceId}.ingest.monitor.azure.com`,
        credential,
      );

      const dcrRuleId = process.env.AZURE_DCR_RULE_ID ?? '';
      const dcrStreamName = process.env.AZURE_DCR_STREAM_NAME ?? 'Custom-ETIP_Stats_CL';

      if (dcrRuleId) {
        await logsClient.upload(dcrRuleId, dcrStreamName, [
          {
            TimeGenerated: new Date().toISOString(),
            TotalIOCs: stats.total,
            ByType: JSON.stringify(stats.byType),
            BySeverity: JSON.stringify(stats.bySeverity),
            ByTlp: JSON.stringify(stats.byTlp),
            ByLifecycle: JSON.stringify(stats.byLifecycle),
            LastUpdated: stats.lastUpdated,
          },
        ]);
        context.log('Stats written to ETIP_Stats_CL');
      } else {
        context.log('Skipping Log Analytics upload — AZURE_DCR_RULE_ID not configured');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      context.warn(`Failed to sync stats (non-fatal): ${msg}`);
    }

    // --- Step 7: Update last sync timestamp ---
    const newTimestamp = new Date().toISOString();
    await state.setLastSyncTimestamp(newTimestamp);

    // --- Step 8: Log summary ---
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    context.log(`ETIP Sentinel sync completed in ${elapsed}s — ${iocs.length} IOCs processed`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    context.error(`ETIP Sentinel sync failed: ${msg}`);
    // Do not rethrow — prevent the function from crashing
  }
}

// Convert poll interval to cron schedule
const intervalMinutes = parseInt(process.env.ETIP_POLL_INTERVAL_MINUTES ?? '15', 10);

app.timer('syncIndicators', {
  schedule: `0 */${intervalMinutes} * * * *`,
  handler: syncIndicators,
});
