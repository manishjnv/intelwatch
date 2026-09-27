/**
 * @module components/command-center/integrations/TaxiiFeedCard
 * @description Read-only TAXII 2.1 feed card — the tenant's SIEM/TIP pulls IOCs on its own
 * schedule, no credentials stored with ETIP. Discovery route verified:
 * apps/api-gateway/src/routes/public/taxii.ts GET /taxii/discovery, registered at prefix
 * /api/v1/public (apps/api-gateway/src/app.ts:146). Auth: X-API-Key header, scope ioc:read
 * (apps/api-gateway/src/plugins/api-key-auth.ts:83-85). S167: self-serve key creation now
 * exists at ApiKeysPanel — `onCreateKey` switches the Users & Access pill there. The caller
 * omits it for roles that can't manage keys (analysts), so no dead link renders for them.
 */
import { useState } from 'react'
import { Copy, Check, Radio } from 'lucide-react'
import { toast } from '@/components/ui/Toast'

const DISCOVERY_PATH = '/api/v1/public/taxii/discovery'

interface TaxiiFeedCardProps {
  /** Switches the Users & Access tab to the API keys pill. Omitted renders no link. */
  onCreateKey?: () => void
}

export function TaxiiFeedCard({ onCreateKey }: TaxiiFeedCardProps = {}) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}${DISCOVERY_PATH}`

  const copy = () => {
    navigator.clipboard.writeText(url)
      .then(() => {
        setCopied(true)
        toast('Discovery URL copied', 'success')
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => toast('Could not copy — copy it manually', 'error'))
  }

  return (
    <div className="border border-border rounded-lg p-3 bg-bg-primary space-y-2" data-testid="taxii-feed-card">
      <div className="flex items-center gap-2">
        <Radio className="w-3.5 h-3.5 text-accent" />
        <h3 className="text-xs font-semibold text-text-primary">Your TAXII feed</h3>
      </div>
      <p className="text-[11px] text-text-muted">
        Your SIEM pulls ETIP IOCs on its own schedule — no credentials are stored with us.
      </p>

      <div className="flex items-center gap-2">
        <code
          className="flex-1 min-w-0 truncate px-2 py-1.5 text-[11px] bg-bg-secondary border border-border rounded font-mono text-text-secondary"
          title={url}
          data-testid="taxii-discovery-url"
        >
          {url}
        </code>
        <button
          onClick={copy}
          className="shrink-0 flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium border border-border rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          data-testid="taxii-copy-btn"
        >
          {copied ? <Check className="w-3 h-3 text-sev-low" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <p className="text-[10px] text-text-muted">
        Authenticate with an <code className="font-mono">X-API-Key</code> header (scope{' '}
        <code className="font-mono">ioc:read</code>).{' '}
        {onCreateKey ? (
          <button
            type="button"
            onClick={onCreateKey}
            className="text-accent font-medium hover:underline"
            data-testid="taxii-create-key-link"
          >
            Create an API key
          </button>
        ) : (
          'Ask an admin to create one in Users & Access -> API keys.'
        )}
      </p>
      <p className="text-[10px] text-text-muted">Works with Sentinel, QRadar, Splunk, OpenCTI, MISP.</p>
    </div>
  )
}
