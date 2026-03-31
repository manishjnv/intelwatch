import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js';
import { InvocationContext } from '@azure/functions';
import { GraphTiIndicator } from './mapper.js';

const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
const BATCH_SIZE = 100;

export class GraphClient {
  private client: Client;

  constructor(tenantId: string, clientId: string, clientSecret: string) {
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: [GRAPH_SCOPE],
    });
    this.client = Client.initWithMiddleware({ authProvider });
  }

  /**
   * Find an existing tiIndicator by externalId for idempotent upserts.
   * Returns the indicator ID if found, null otherwise.
   */
  private async findByExternalId(externalId: string): Promise<string | null> {
    try {
      const result = await this.client
        .api('/security/tiIndicators')
        .filter(`externalId eq '${externalId}'`)
        .select('id')
        .top(1)
        .get();

      const indicators = result?.value as Array<{ id: string }> | undefined;
      return indicators && indicators.length > 0 ? indicators[0].id : null;
    } catch {
      return null;
    }
  }

  /**
   * Submit tiIndicators to Microsoft Graph Security API.
   * For idempotency: checks for existing indicators by externalId.
   * If found, updates the existing indicator; otherwise creates a new one.
   * Processes in batches of 100 (Graph API limit).
   */
  async submitIndicators(
    indicators: GraphTiIndicator[],
    context: InvocationContext,
  ): Promise<{ submitted: number; failed: number }> {
    let submitted = 0;
    let failed = 0;

    for (let i = 0; i < indicators.length; i += BATCH_SIZE) {
      const batch = indicators.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      for (const indicator of batch) {
        try {
          const existingId = await this.findByExternalId(indicator.externalId);

          if (existingId) {
            // Update existing indicator
            await this.client
              .api(`/security/tiIndicators/${existingId}`)
              .patch(indicator);
          } else {
            // Create new indicator
            await this.client
              .api('/security/tiIndicators')
              .post(indicator);
          }

          submitted++;
        } catch (error) {
          failed++;
          const msg = error instanceof Error ? error.message : String(error);
          context.error(`Failed to submit indicator ${indicator.externalId}: ${msg}`);
        }
      }

      context.log(`Processed batch ${batchNum}: ${batch.length} indicators`);
    }

    return { submitted, failed };
  }
}
