# Ingestion Service

**Full documentation:** [docs/modules/ingestion.md](../../docs/modules/ingestion.md)

Port 3004 | 667 tests | Feed → Pipeline → IOC extraction → Queue to normalization

## Connectors

| Type | File | Description |
|------|------|-------------|
| RSS/Atom | `src/connectors/rss.ts` | RSS/Atom feed parsing via rss-parser |
| REST API | `src/connectors/rest-api.ts` | Generic REST API with field mapping |
| NVD | `src/connectors/nvd.ts` | NVD 2.0 API with pagination |
| TAXII/STIX | `src/connectors/taxii.ts` | STIX/TAXII 2.1 client |
| MISP | `src/connectors/misp.ts` | MISP REST API + flat file feed mode |
| Bulk File | `src/connectors/bulk-file.ts` | CSV, plaintext, JSONL bulk IOC import via HTTP |

### Bulk File Connector (csv_bulk, plaintext, jsonl)

Downloads, decompresses (gzip), and parses bulk IOC files. Skips article pipeline — queues IOCs directly to normalize.

- **CSV**: Configurable delimiter, headers, column mapping. Skips `#` comments.
- **Plaintext**: One IOC per line. Skips `#` comments and blank lines.
- **JSONL**: One JSON object per line with configurable field mapping (dot-notation paths).

FeedSource `parseConfig` examples:
```json
// csv_bulk
{ "delimiter": ",", "hasHeaders": true, "columnMap": { "value": "indicator", "type": "type" } }
// jsonl
{ "fieldMap": { "value": "ioc_value", "type": "ioc_type" }, "compression": "gzip" }
```
