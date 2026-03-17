// DESIGN LOCKED — see UI_DESIGN_LOCK.md
// FROZEN: Cmd+K/Ctrl+K trigger, category order, online fallback order
import React, { useEffect, useState } from 'react'
import { Search, Shield, UserX, Bug, Target, ShieldAlert, FileSearch, Globe } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

interface SearchResult { id:string; type:string; value:string; label?:string; severity?:string; category:SearchCategory }
type SearchCategory = 'iocs'|'actors'|'malware'|'campaigns'|'vulnerabilities'|'investigations'|'online'

const CATEGORIES: {key:SearchCategory;heading:string;icon:React.ElementType}[] = [
  { key:'iocs',            heading:'Indicators of Compromise', icon:Shield      },
  { key:'actors',          heading:'Threat Actors',            icon:UserX       },
  { key:'malware',         heading:'Malware Families',         icon:Bug         },
  { key:'campaigns',       heading:'Campaigns',                icon:Target      },
  { key:'vulnerabilities', heading:'Vulnerabilities',          icon:ShieldAlert },
  { key:'investigations',  heading:'Investigations',           icon:FileSearch  },
  { key:'online',          heading:'Search Online',            icon:Globe       },
]

const ONLINE_FALLBACKS = (q:string) => [
  { label:'VirusTotal',          url:`https://www.virustotal.com/gui/search/${encodeURIComponent(q)}`           },
  { label:'MITRE ATT&CK',       url:`https://attack.mitre.org/techniques/?query=${encodeURIComponent(q)}`     },
  { label:'Shodan',              url:`https://www.shodan.io/search?query=${encodeURIComponent(q)}`              },
  { label:'NVD',                 url:`https://nvd.nist.gov/vuln/search/results?query=${encodeURIComponent(q)}` },
  { label:'Google Threat Intel', url:`https://www.google.com/search?q=${encodeURIComponent(q)}+threat+intelligence` },
]

interface GlobalSearchProps { open:boolean; onClose:()=>void }

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    if (!open) return
    const handler = (e:KeyboardEvent) => {
      if (e.key==='Escape') { onClose(); setQuery('') }
      if (e.key==='ArrowDown') setSelected(s => s+1)
      if (e.key==='ArrowUp')   setSelected(s => Math.max(0,s-1))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const { data: results } = useQuery<SearchResult[]>({
    queryKey: ['global-search', query],
    queryFn: async () => {
      if (!query.trim() || query.length < 2) return []
      const res = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}&limit=20`)
      return res.json()
    },
    enabled: query.length >= 2,
    staleTime: 30_000,
  })

  if (!open) return null

  const grouped = CATEGORIES.reduce<Record<SearchCategory,SearchResult[]>>((acc,cat) => {
    acc[cat.key] = (results ?? []).filter(r => r.category === cat.key)
    return acc
  }, {} as Record<SearchCategory,SearchResult[]>)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/60" onClick={()=>{ onClose(); setQuery('') }}/>
      <div className="relative w-full max-w-2xl bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-[var(--shadow-lg)] overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
          <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0"/>
          <input autoFocus value={query} onChange={e=>{setQuery(e.target.value);setSelected(0)}}
            placeholder="Search IOCs, actors, CVEs, malware…"
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none"/>
          <kbd className="text-[10px] text-[var(--text-muted)] border border-[var(--border)] px-1.5 py-0.5 rounded">ESC</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-[var(--border)]">
          {CATEGORIES.map(cat => {
            const items = cat.key==='online' ? [] : grouped[cat.key] ?? []
            if (cat.key!=='online' && items.length===0) return null
            return (
              <div key={cat.key} className="py-2">
                <div className="flex items-center gap-2 px-4 py-1 mb-1">
                  <cat.icon className="w-3 h-3 text-[var(--text-muted)]"/>
                  <span className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">{cat.heading}</span>
                </div>
                {cat.key==='online' && query.length>=2 ? (
                  ONLINE_FALLBACKS(query).map(({label,url}) => (
                    <a key={label} href={url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors">
                      <Globe className="w-3 h-3 shrink-0"/>
                      <span>{label}</span>
                      <span className="ml-auto text-xs text-[var(--text-muted)] font-mono truncate max-w-[200px]">{query}</span>
                    </a>
                  ))
                ) : (
                  items.map((r,i) => (
                    <div key={r.id}
                      className={`flex items-center gap-3 px-4 py-2 text-sm cursor-pointer transition-colors ${selected===i ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}>
                      <span className="font-mono text-xs">{r.value}</span>
                      {r.label && <span className="text-xs text-[var(--text-muted)]">{r.label}</span>}
                    </div>
                  ))
                )}
              </div>
            )
          })}
          {(!results||results.length===0) && query.length>=2 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
              No local results for <span className="font-mono text-[var(--text-secondary)]">{query}</span>
            </div>
          )}
          {query.length===0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">Type to search across all intelligence…</div>
          )}
        </div>
        <div className="flex items-center gap-4 px-4 py-2 border-t border-[var(--border)] text-[10px] text-[var(--text-muted)]">
          <span><kbd className="border border-[var(--border)] px-1 rounded">↑↓</kbd> navigate</span>
          <span><kbd className="border border-[var(--border)] px-1 rounded">↵</kbd> select</span>
          <span><kbd className="border border-[var(--border)] px-1 rounded">ESC</kbd> close</span>
        </div>
      </div>
    </div>
  )
}

export function useGlobalSearch() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const handler = (e:KeyboardEvent) => {
      if ((e.metaKey||e.ctrlKey) && e.key==='k') { e.preventDefault(); setOpen(o=>!o) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  return { open, setOpen }
}
