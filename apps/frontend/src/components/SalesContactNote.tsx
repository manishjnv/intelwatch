/**
 * Shown after "Contact Sales" on the plan step. mailto: links do nothing when no mail app is
 * configured (and window.open(mailto) is often popup-blocked), so the address is always visible
 * with a Copy button as a reliable fallback.
 */
import { useState } from 'react'
import { Copy, Check, Mail } from 'lucide-react'
import { SALES_EMAIL, salesMailto } from '@/data/plans'

export function SalesContactNote({ planName }: { planName: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SALES_EMAIL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked — the address is still visible to copy by hand */ }
  }

  return (
    <div role="status" data-testid="sales-contact-note"
      className="max-w-xl mx-auto mt-4 p-3 rounded-lg border border-border bg-bg-elevated text-xs text-text-secondary flex flex-wrap items-center gap-2">
      <Mail className="w-4 h-4 text-accent shrink-0" />
      <span>The {planName} plan is set up by our sales team. Email</span>
      <a href={salesMailto(`${planName} Plan Inquiry`)} className="font-medium text-accent hover:underline">{SALES_EMAIL}</a>
      <button type="button" onClick={copy} data-testid="copy-sales-email"
        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-bg-hover text-text-primary">
        {copied ? <Check className="w-3 h-3 text-sev-low" /> : <Copy className="w-3 h-3" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
