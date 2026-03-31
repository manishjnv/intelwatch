# IntelWatch ETIP — Microsoft Sentinel Solution

Integrates [IntelWatch ETIP](https://ti.intelwatch.in) enterprise threat intelligence with Microsoft Sentinel for automated IOC ingestion, detection, and proactive threat hunting.

## Components

| Component | Count | Description |
|-----------|-------|-------------|
| Data Connector | 1 | Azure Function (timer-triggered, 15min) syncs IOCs via Graph API |
| Workbook | 1 | 4-tab dashboard: IOC Overview, Enrichment, Detections, Feed Health |
| Analytics Rules | 5 | Automated incident creation from IOC matches |
| Hunting Queries | 4 | Proactive threat hunting KQL queries |

## Quick Start (Content Hub)

1. Open **Microsoft Sentinel** > **Content Hub**
2. Search **"IntelWatch ETIP"**
3. Click **Install**
4. Follow the wizard to configure your API key
5. Deploy the Azure Function data connector (see below)

## Manual Deployment

### Prerequisites

- Azure subscription with Microsoft Sentinel enabled
- Log Analytics workspace
- IntelWatch ETIP account with API key (`etip_` prefix)
- Azure AD App Registration with Graph API permissions

### Step 1: Create App Registration

1. Go to **Azure Active Directory** > **App registrations** > **New registration**
2. Name: `IntelWatch ETIP Connector`
3. Supported account types: **Single tenant**
4. Click **Register**
5. Note the **Application (client) ID** and **Directory (tenant) ID**
6. Go to **Certificates & secrets** > **New client secret** — note the secret value
7. Go to **API permissions** > **Add a permission**:
   - **Microsoft Graph** > **Application permissions**
   - Search and add: `ThreatIndicators.ReadWrite.OwnedBy`
8. Click **Grant admin consent**

### Step 2: Create Custom Log Analytics Table

The data connector writes aggregate stats to a custom table `ETIP_Stats_CL`.

1. Go to **Log Analytics workspace** > **Tables** > **Create** > **New custom log (DCR-based)**
2. Table name: `ETIP_Stats`
3. Create a Data Collection Endpoint and Data Collection Rule
4. Note the **DCR Immutable ID** and **DCE Endpoint URI**

### Step 3: Deploy ARM Template (Workbook + Rules + Queries)

```bash
az deployment group create \
  --resource-group <your-resource-group> \
  --template-file mainTemplate.json \
  --parameters \
    workspace=<your-workspace-name> \
    workspaceResourceId=<full-resource-id> \
    etipApiKey=<your-etip-api-key>
```

### Step 4: Deploy Data Connector (Azure Function)

```bash
cd sentinel-solution/data-connector
npm install
cp local.settings.json.example local.settings.json
# Edit local.settings.json with your credentials
```

Deploy via **VS Code Azure Functions extension** or CLI:

```bash
func azure functionapp publish <your-function-app-name>
```

**Required environment variables** (set in Function App > Configuration):

| Variable | Description |
|----------|-------------|
| `ETIP_API_BASE_URL` | `https://ti.intelwatch.in/api/v1/public` |
| `ETIP_API_KEY` | Your ETIP API key |
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_CLIENT_ID` | App registration client ID |
| `AZURE_CLIENT_SECRET` | App registration client secret |
| `AZURE_WORKSPACE_ID` | Log Analytics workspace ID |
| `AZURE_LOG_ANALYTICS_KEY` | Log Analytics primary key |
| `ETIP_POLL_INTERVAL_MINUTES` | Sync interval (default: 15) |

### Step 5: Verify

1. Check **Function App** > **Monitor** for successful executions
2. Open **Sentinel** > **Threat Intelligence** > filter source = "IntelWatch ETIP"
3. Open the **ETIP Workbook** from Sentinel > Workbooks

## Architecture

```
ETIP Public API ──> Azure Function (15min timer)
                        |
                        ├──> Microsoft Graph API ──> Sentinel ThreatIntelligenceIndicator
                        |
                        └──> Log Analytics Ingestion API ──> ETIP_Stats_CL (custom table)

Sentinel:
  - Workbook reads ThreatIntelligenceIndicator + ETIP_Stats_CL
  - Analytics Rules correlate IOCs with SecurityEvent, DnsEvents, CommonSecurityLog
  - Hunting Queries enable proactive threat investigation
```

## Analytics Rules

| Rule | Severity | Frequency | Description |
|------|----------|-----------|-------------|
| High-Confidence IOC Match | High | 1 hour | IOCs with confidence >= 80 matching network/DNS/security logs |
| C2 Domain Communication | High | 15 min | DNS queries to domains tagged as C2 infrastructure |
| New Critical IOC Ingested | Medium | 1 hour | Alerts on newly ingested critical-severity IOCs |
| Multiple IOC Matches on Host | High | 6 hours | 3+ distinct IOC matches on the same host in 24h |
| Feed Sync Stale | Low | 2 hours | No new IOCs ingested for over 2 hours |

## Hunting Queries

| Query | Tactics | Description |
|-------|---------|-------------|
| High-Risk Undetected IOCs | Discovery | High-confidence IOCs with no matching alerts (blind spots) |
| Threat Actor Activity | C2, Initial Access | Network traffic matching threat-actor-tagged IOCs |
| New Malware Family IOCs | Execution, C2 | Endpoints communicating with recently tagged malware IOCs |
| Lateral Movement Indicators | Lateral Movement | Internal hosts matching MITRE T1021/T1570/T1563 IOCs |

## Workbook Tabs

1. **IOC Overview** — Total count, ingestion trend, breakdowns by type/severity/TLP, top tags, MITRE techniques, feed freshness
2. **Enrichment & Risk Scores** — Aggregate stats, confidence distribution, enrichment sources, geolocation
3. **Detection & Matching** — IOC-to-incident match rate, top matched IOCs, unmatched high-confidence IOCs
4. **Feed Health** — Ingestion rate, last sync status, error rate from Function logs

## Troubleshooting

| Symptom | Check |
|---------|-------|
| No IOCs in Sentinel | Verify API key, check Function App logs, confirm App Registration has ThreatIndicators.ReadWrite.OwnedBy |
| Stale feed alert firing | Verify Function App is running, check ETIP API status at /stats endpoint |
| Workbook shows no data | Ensure ETIP_Stats_CL table exists, verify time range parameter |
| Analytics rules not triggering | Confirm rules are enabled in Sentinel > Analytics, check data connector logs |
| Permission errors in Function | Re-grant admin consent on App Registration, verify client secret hasn't expired |

## Support

- **ETIP Platform**: https://ti.intelwatch.in
- **Documentation**: See `data-connector/README.md` for detailed setup
- **Issues**: Open an issue in the repository
