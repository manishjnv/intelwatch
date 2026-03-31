# ETIP Sentinel Data Connector

Azure Function that syncs threat intelligence indicators from IntelWatch ETIP to Microsoft Sentinel.

## What It Does

- Runs on a configurable timer (every 15 minutes by default)
- Fetches new/updated IOCs from ETIP's public API with cursor pagination
- Maps them to Microsoft Graph tiIndicator format
- Submits to Sentinel via the Graph Security API (with idempotent upserts)
- Syncs aggregate stats to a custom ETIP_Stats_CL Log Analytics table

## Prerequisites

1. **Azure Subscription** with Microsoft Sentinel enabled on a Log Analytics workspace
2. **ETIP API Key** -- generate from IntelWatch ETIP dashboard (Settings > API Keys)
3. **Azure App Registration** with the required Graph API permissions (see below)
4. **Node.js 20+** and **Azure Functions Core Tools v4** for local development

## Setup

### 1. Create Azure App Registration

1. Go to **Azure Portal > Microsoft Entra ID > App registrations > New registration**
2. Name: `ETIP Sentinel Connector`
3. Supported account types: Single tenant
4. Click **Register**
5. Note the **Application (client) ID** and **Directory (tenant) ID**
6. Go to **Certificates & secrets > New client secret**
   - Set an expiry (recommended: 12 months)
   - Copy the secret **Value** immediately (it won't be shown again)
7. Go to **API permissions > Add a permission**
   - Select **Microsoft Graph > Application permissions**
   - Search for and add: `ThreatIndicators.ReadWrite.OwnedBy`
   - Click **Grant admin consent for [your tenant]**

### 2. Create Log Analytics Custom Table (ETIP_Stats_CL)

To receive ETIP aggregate statistics in Sentinel:

1. In your **Log Analytics workspace**, go to **Tables > Create > New custom log (DCR-based)**
2. Table name: `ETIP_Stats_CL`
3. Create a **Data Collection Rule (DCR)** and **Data Collection Endpoint (DCE)**
4. Define the table schema with these columns:
   - `TimeGenerated` (datetime)
   - `TotalIOCs` (int)
   - `ByType` (string, JSON)
   - `BySeverity` (string, JSON)
   - `ByTlp` (string, JSON)
   - `ByLifecycle` (string, JSON)
   - `LastUpdated` (string)
5. Note the **DCR Rule ID** and **Stream Name** (default: `Custom-ETIP_Stats_CL`)

### 3. Deploy the Azure Function

#### Option A: Deploy via Azure Functions Core Tools

```bash
cd sentinel-solution/data-connector
npm install
npm run build
func azure functionapp publish <YOUR_FUNCTION_APP_NAME>
```

#### Option B: Deploy via VS Code

1. Install the **Azure Functions** extension
2. Open the `sentinel-solution/data-connector` folder
3. Press `F1` > **Azure Functions: Deploy to Function App**
4. Select or create a Function App (Node.js 20, Linux)

### 4. Configure Environment Variables

In the Azure Function App, go to **Configuration > Application settings** and add:

| Variable                       | Description                                                             | Required |
| ------------------------------ | ----------------------------------------------------------------------- | -------- |
| `ETIP_API_BASE_URL`            | ETIP API base URL (default: `https://ti.intelwatch.in/api/v1/public`)   | Yes      |
| `ETIP_API_KEY`                 | Your ETIP API key (starts with `etip_`)                                 | Yes      |
| `AZURE_TENANT_ID`              | Microsoft Entra tenant ID                                               | Yes      |
| `AZURE_CLIENT_ID`              | App registration client ID                                              | Yes      |
| `AZURE_CLIENT_SECRET`          | App registration client secret                                          | Yes      |
| `AZURE_WORKSPACE_ID`           | Log Analytics workspace ID                                              | Yes      |
| `AZURE_DCR_RULE_ID`            | Data Collection Rule ID (for stats ingestion)                           | No       |
| `AZURE_DCR_STREAM_NAME`        | DCR stream name (default: `Custom-ETIP_Stats_CL`)                       | No       |
| `ETIP_POLL_INTERVAL_MINUTES`   | Sync interval in minutes (default: `15`)                                | No       |

### 5. Verify Data Flow

1. **Trigger manually**: Azure Portal > Functions > syncIndicators > Test/Run
2. **Check Sentinel**: Go to Microsoft Sentinel > Threat Intelligence -- IOCs should appear within minutes
3. **Check stats**: In Log Analytics, run the following query:

   ```kql
   ETIP_Stats_CL
   | order by TimeGenerated desc
   | take 10
   ```

4. **Monitor logs**: Azure Portal > Function App > Monitor > Invocations to see sync history

## Local Development

```bash
# Copy and configure local settings
cp local.settings.json.example local.settings.json
# Edit local.settings.json with your actual credentials

# Install dependencies
npm install

# Start the function locally
npm start
```

The function will run on the configured timer schedule. To trigger manually during development, use the Azure Functions Core Tools HTTP endpoint.

## IOC Type Mapping

| ETIP IOC Type | Graph tiIndicator Field |
|---------------|------------------------|
| `ip` (IPv4)  | `networkIPv4` |
| `ip` (IPv6)  | `networkIPv6` |
| `domain`     | `networkDomainName` |
| `url`        | `url` |
| `hash`       | `fileSha256` |
| `email`      | `emailSenderAddress` |

## Severity Mapping

| ETIP Severity | Graph threatType |
|---------------|-----------------|
| `critical`    | `MalwareC2` |
| `high`        | `MalwareC2` |
| `medium`      | `Suspicious` |
| `low`         | `Benign` |
| `info`        | `Benign` |

## Troubleshooting

### Function not running

- Check that the Function App is started in Azure Portal
- Verify the timer schedule in the function logs
- Ensure all required environment variables are set

### No IOCs appearing in Sentinel

- Verify the ETIP API key is valid: test with `curl -H "X-API-Key: etip_..." https://ti.intelwatch.in/api/v1/public/stats`
- Check that the App Registration has `ThreatIndicators.ReadWrite.OwnedBy` permission with admin consent
- Review function invocation logs for specific error messages

### Stats not appearing in Log Analytics

- Verify `AZURE_DCR_RULE_ID` is set correctly
- Check that the DCR and custom table `ETIP_Stats_CL` are properly configured
- The DCR stream name must match (default: `Custom-ETIP_Stats_CL`)

### Authentication errors

- Confirm `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and `AZURE_CLIENT_SECRET` are correct
- Check that the client secret has not expired
- Ensure admin consent was granted for the Graph API permission

### Rate limiting or timeout

- Increase `ETIP_POLL_INTERVAL_MINUTES` to reduce API call frequency
- The connector fetches up to 500 IOCs per page with automatic pagination
- Large initial syncs (first run) fetch the last 24 hours of data
