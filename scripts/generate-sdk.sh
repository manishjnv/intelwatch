#!/usr/bin/env bash
#
# generate-sdk.sh — Generate Python and TypeScript SDKs from the OpenAPI spec.
#
# Usage:
#   bash scripts/generate-sdk.sh [--from-url | --from-file <path>]
#
# Options:
#   --from-url   Fetch the OpenAPI spec from the running server (default)
#   --from-file  Read the OpenAPI spec from a local file
#
# Prerequisites:
#   - Java 11+ (required by openapi-generator-cli)
#   - npx (comes with Node.js)
#
# Output:
#   sdk/python/       — Python client library
#   sdk/typescript/   — TypeScript client library
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SDK_DIR="$ROOT_DIR/sdk"
SPEC_FILE="$ROOT_DIR/openapi.json"

# Default: fetch from running server
SPEC_SOURCE="url"
SPEC_URL="${ETIP_API_URL:-http://localhost:3001}/api/v1/public/docs/json"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --from-url)
      SPEC_SOURCE="url"
      shift
      ;;
    --from-file)
      SPEC_SOURCE="file"
      SPEC_FILE="${2:?Missing file path after --from-file}"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "╔══════════════════════════════════════════════╗"
echo "║   IntelWatch ETIP — SDK Generator           ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Step 1: Obtain the OpenAPI spec
if [ "$SPEC_SOURCE" = "url" ]; then
  echo "→ Fetching OpenAPI spec from $SPEC_URL ..."
  curl -sf "$SPEC_URL" -o "$SPEC_FILE" || {
    echo "✗ Failed to fetch spec. Is the API server running?"
    echo "  Try: ETIP_API_URL=https://ti.intelwatch.in bash scripts/generate-sdk.sh"
    exit 1
  }
  echo "  ✓ Saved to $SPEC_FILE"
else
  echo "→ Using local spec file: $SPEC_FILE"
  if [ ! -f "$SPEC_FILE" ]; then
    echo "✗ File not found: $SPEC_FILE"
    exit 1
  fi
fi

echo ""

# Step 2: Clean previous output
rm -rf "$SDK_DIR"
mkdir -p "$SDK_DIR/python" "$SDK_DIR/typescript"

# Step 3: Generate Python SDK
echo "→ Generating Python SDK ..."
npx @openapitools/openapi-generator-cli generate \
  -i "$SPEC_FILE" \
  -g python \
  -o "$SDK_DIR/python" \
  --additional-properties=packageName=intelwatch_sdk,projectName=intelwatch-sdk,packageVersion=1.0.0 \
  --skip-validate-spec \
  2>&1 | tail -3

echo "  ✓ Python SDK → $SDK_DIR/python/"
echo ""

# Step 4: Generate TypeScript SDK
echo "→ Generating TypeScript SDK ..."
npx @openapitools/openapi-generator-cli generate \
  -i "$SPEC_FILE" \
  -g typescript-fetch \
  -o "$SDK_DIR/typescript" \
  --additional-properties=npmName=@intelwatch/sdk,npmVersion=1.0.0,supportsES6=true,typescriptThreePlus=true \
  --skip-validate-spec \
  2>&1 | tail -3

echo "  ✓ TypeScript SDK → $SDK_DIR/typescript/"
echo ""

# Step 5: Generate README
cat > "$SDK_DIR/README.md" << 'SDKREADME'
# IntelWatch ETIP — Auto-Generated SDKs

These SDKs are auto-generated from the OpenAPI specification.

## Python

```bash
cd sdk/python
pip install -e .
```

```python
from intelwatch_sdk import ApiClient, Configuration, IOCsApi

config = Configuration(host="https://ti.intelwatch.in/api/v1/public")
config.api_key["X-API-Key"] = "etip_your_api_key_here"

client = ApiClient(config)
iocs_api = IOCsApi(client)

# List IOCs
response = iocs_api.iocs_get(limit=50)
print(response.data)
```

## TypeScript

```bash
cd sdk/typescript
npm install
```

```typescript
import { Configuration, IOCsApi } from '@intelwatch/sdk';

const config = new Configuration({
  basePath: 'https://ti.intelwatch.in/api/v1/public',
  headers: { 'X-API-Key': 'etip_your_api_key_here' },
});

const api = new IOCsApi(config);
const response = await api.iocsGet({ limit: 50 });
console.log(response.data);
```

## Regeneration

```bash
# From running server
pnpm sdk:generate

# From a saved spec file
bash scripts/generate-sdk.sh --from-file openapi.json
```

## Note

These SDKs are scaffolding only. Actual SDK publishing (PyPI, npm) is a future task.
SDKREADME

echo "══════════════════════════════════════════════"
echo "  SDK generation complete!"
echo "  Python:     $SDK_DIR/python/"
echo "  TypeScript: $SDK_DIR/typescript/"
echo "  README:     $SDK_DIR/README.md"
echo "══════════════════════════════════════════════"
