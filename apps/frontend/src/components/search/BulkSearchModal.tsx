/**
 * @module components/search/BulkSearchModal
 * @description Paste-IOCs modal: textarea for 10-100 IOCs (one per line),
 * auto-detect types, deduplicate, search all, show found vs not-found.
 * Reference: ThreatConnect bulk search pattern.
 */
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, FileText, Download, Search, CheckCircle2, AlertCircle } from 'lucide-react'
import { parseIocLines, exportNotFound } from '@/utils/search-helpers'
import type { EsSearchResult } from '@/hooks/use-es-search'

interface BulkSearchModalProps {
  open: boolean
  onClose: () => void
  onSearch: (values: string[]) => void
  results: EsSearchResult[]
}

const TYPE_LABELS: Record<string, string> = {
  ip: 'IP', domain: 'Domain', url: 'URL', cve: 'CVE', email: 'Email',
  hash_sha256: 'SHA-256', hash_sha1: 'SHA-1', hash_md5: 'MD5', ipv6: 'IPv6',
}

export function BulkSearchModal({ open, onClose, onSearch, results }: BulkSearchModalProps) {
  const [input, setInput] = useState('')
  const [searched, setSearched] = useState(false)
  const [searchedValues, setSearchedValues] = useState<string[]>([])

  const parsed = useMemo(() => parseIocLines(input), [input])

  const typeSummary = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of parsed) {
      const t = p.type ?? 'unknown'
      counts[t] = (counts[t] ?? 0) + 1
    }
    return Object.entries(counts).map(([type, count]) => ({ type, count }))
  }, [parsed])

  const { found, notFound } = useMemo(() => {
    if (!searched) return { found: [] as string[], notFound: [] as string[] }
    const resultValues = new Set(results.map(r => r.value.toLowerCase()))
    const f: string[] = []
    const nf: string[] = []
    for (const v of searchedValues) {
      if (resultValues.has(v.toLowerCase())) f.push(v)
      else nf.push(v)
    }
    return { found: f, notFound: nf }
  }, [searched, results, searchedValues])

  const handleSearch = () => {
    const values = parsed.map(p => p.value)
    setSearchedValues(values)
    onSearch(values)
    setSearched(true)
  }

  const handleClose = () => {
    setInput('')
    setSearched(false)
    setSearchedValues([])
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 bg-bg-base/80 backdrop-blur-sm flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          data-testid="bulk-search-modal"
        >
          <motion.div
            className="bg-bg-secondary border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', damping: 25 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <Upload className="w-4 h-4 text-accent" />
                Bulk IOC Search
              </div>
              <button onClick={handleClose} className="p-1 rounded hover:bg-bg-hover text-text-muted" data-testid="bulk-close">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Textarea */}
              <div>
                <label className="text-xs text-text-secondary font-medium mb-1.5 block">
                  Paste IOCs (one per line, max 100)
                </label>
                <textarea
                  value={input}
                  onChange={e => { setInput(e.target.value); setSearched(false) }}
                  placeholder={"185.220.101.34\nevil-payload.darknet.ru\nCVE-2024-3400\ne3b0c44298fc1c149afb4c8996fb924..."}
                  className="w-full h-40 bg-bg-base border border-border rounded-lg p-3 text-xs font-mono text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-accent"
                  data-testid="bulk-textarea"
                />
              </div>

              {/* Parse summary */}
              {parsed.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap text-xs" data-testid="bulk-summary">
                  <span className="flex items-center gap-1 text-text-primary">
                    <FileText className="w-3.5 h-3.5 text-accent" />
                    <strong>{parsed.length}</strong> unique IOCs detected
                  </span>
                  {typeSummary.map(ts => (
                    <span key={ts.type} className="text-text-muted">
                      {ts.count} {TYPE_LABELS[ts.type] ?? ts.type}
                    </span>
                  ))}
                </div>
              )}

              {/* Results: found vs not-found */}
              {searched && (
                <div className="space-y-3" data-testid="bulk-results">
                  {/* Found */}
                  <div className="border border-sev-low/30 bg-sev-low/5 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-sev-low mb-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Found in platform ({found.length})
                    </div>
                    {found.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {found.slice(0, 20).map(v => (
                          <span key={v} className="text-[10px] font-mono bg-bg-base px-1.5 py-0.5 rounded border border-border text-text-secondary">{v}</span>
                        ))}
                        {found.length > 20 && <span className="text-[10px] text-text-muted">+{found.length - 20} more</span>}
                      </div>
                    ) : (
                      <p className="text-[10px] text-text-muted">No matches found</p>
                    )}
                  </div>

                  {/* Not found */}
                  <div className="border border-sev-critical/30 bg-sev-critical/5 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-sev-critical">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Not in platform ({notFound.length})
                      </div>
                      {notFound.length > 0 && (
                        <button
                          onClick={() => exportNotFound(notFound)}
                          className="text-[10px] text-text-muted hover:text-accent flex items-center gap-0.5 transition-colors"
                          data-testid="export-not-found"
                        >
                          <Download className="w-3 h-3" /> Export gaps
                        </button>
                      )}
                    </div>
                    {notFound.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {notFound.slice(0, 20).map(v => (
                          <span key={v} className="text-[10px] font-mono bg-bg-base px-1.5 py-0.5 rounded border border-border text-text-secondary">{v}</span>
                        ))}
                        {notFound.length > 20 && <span className="text-[10px] text-text-muted">+{notFound.length - 20} more</span>}
                      </div>
                    ) : (
                      <p className="text-[10px] text-text-muted">All IOCs found!</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
              <button onClick={handleClose}
                className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:bg-bg-hover transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSearch}
                disabled={parsed.length === 0}
                className="text-xs px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                data-testid="bulk-search-submit"
              >
                <Search className="w-3.5 h-3.5" />
                Search {parsed.length > 0 ? `${parsed.length} IOCs` : ''}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
