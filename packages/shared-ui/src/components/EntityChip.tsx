// DESIGN LOCKED — see UI_DESIGN_LOCK.md
import React, { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover'
import { Copy, Search, ExternalLink, GitBranch, Plus, Globe } from 'lucide-react'

export const ENTITY_TYPE_CONFIG = {
  ip:              { bg:'bg-blue-500/10',   text:'text-blue-300',   border:'border-blue-500/20',   label:'IP Address'   },
  ipv6:            { bg:'bg-blue-500/10',   text:'text-blue-300',   border:'border-blue-500/20',   label:'IPv6'         },
  domain:          { bg:'bg-purple-500/10', text:'text-purple-300', border:'border-purple-500/20', label:'Domain'       },
  fqdn:            { bg:'bg-purple-500/10', text:'text-purple-300', border:'border-purple-500/20', label:'FQDN'         },
  url:             { bg:'bg-cyan-500/10',   text:'text-cyan-300',   border:'border-cyan-500/20',   label:'URL'          },
  email:           { bg:'bg-green-500/10',  text:'text-green-300',  border:'border-green-500/20',  label:'Email'        },
  file_hash_md5:   { bg:'bg-slate-500/10',  text:'text-slate-300',  border:'border-slate-500/20',  label:'MD5'          },
  file_hash_sha1:  { bg:'bg-slate-500/10',  text:'text-slate-300',  border:'border-slate-500/20',  label:'SHA1'         },
  file_hash_sha256:{ bg:'bg-slate-500/10',  text:'text-slate-300',  border:'border-slate-500/20',  label:'SHA256'       },
  cve:             { bg:'bg-orange-500/10', text:'text-orange-300', border:'border-orange-500/20', label:'CVE'          },
  actor:           { bg:'bg-red-500/10',    text:'text-red-300',    border:'border-red-500/20',    label:'Threat Actor' },
  malware:         { bg:'bg-pink-500/10',   text:'text-pink-300',   border:'border-pink-500/20',   label:'Malware'      },
  campaign:        { bg:'bg-amber-500/10',  text:'text-amber-300',  border:'border-amber-500/20',  label:'Campaign'     },
  asn:             { bg:'bg-teal-500/10',   text:'text-teal-300',   border:'border-teal-500/20',   label:'ASN'          },
  cidr:            { bg:'bg-teal-500/10',   text:'text-teal-300',   border:'border-teal-500/20',   label:'CIDR'         },
} as const

export type EntityType = keyof typeof ENTITY_TYPE_CONFIG
export type Severity   = 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'INFO'

export const INTERNET_SEARCH_URLS: Record<EntityType,(v:string)=>string> = {
  ip:              (v) => `https://www.shodan.io/host/${v}`,
  ipv6:            (v) => `https://www.shodan.io/host/${v}`,
  domain:          (v) => `https://www.virustotal.com/gui/domain/${v}`,
  fqdn:            (v) => `https://www.virustotal.com/gui/domain/${v}`,
  url:             (v) => `https://urlscan.io/search/#${encodeURIComponent(v)}`,
  email:           (v) => `https://haveibeenpwned.com/account/${encodeURIComponent(v)}`,
  file_hash_md5:   (v) => `https://www.virustotal.com/gui/file/${v}`,
  file_hash_sha1:  (v) => `https://www.virustotal.com/gui/file/${v}`,
  file_hash_sha256:(v) => `https://www.virustotal.com/gui/file/${v}`,
  cve:             (v) => `https://nvd.nist.gov/vuln/detail/${v}`,
  actor:           (v) => `https://attack.mitre.org/groups/?query=${encodeURIComponent(v)}`,
  malware:         (v) => `https://malpedia.caad.fkie.fraunhofer.de/search?q=${encodeURIComponent(v)}`,
  campaign:        (v) => `https://www.google.com/search?q=${encodeURIComponent(v)}+cyber+campaign`,
  asn:             (v) => `https://bgp.he.net/${v}`,
  cidr:            (v) => `https://bgp.he.net/net/${v}`,
}

const SEV_DOT: Record<Severity,string> = {
  CRITICAL:'bg-red-500', HIGH:'bg-orange-500', MEDIUM:'bg-yellow-500', LOW:'bg-green-500', INFO:'bg-slate-500'
}

interface EntityChipProps {
  type: EntityType; value: string; severity?: Severity
  showCopy?: boolean; showSearch?: boolean
  onInvestigate?: (type:EntityType,value:string)=>void
  onGraph?: (type:EntityType,value:string)=>void
}

export function EntityChip({ type, value, severity, showCopy=true, showSearch=true, onInvestigate, onGraph }: EntityChipProps) {
  const cfg = ENTITY_TYPE_CONFIG[type]
  const isHash = type.startsWith('file_hash')
  return (
    <Popover>
      <PopoverTrigger asChild>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs cursor-pointer transition-all ${cfg.bg} ${cfg.text} ${cfg.border} hover:opacity-80`}>
          <span className="w-3 h-3 shrink-0" aria-hidden/>
          <span className={isHash ? 'font-mono text-[10px] max-w-[120px] truncate' : ''}>{value}</span>
          {severity && <span className={`w-1.5 h-1.5 rounded-full ${SEV_DOT[severity]} shrink-0`}/>}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-72 bg-[var(--bg-elevated)] border border-[var(--border)] shadow-lg p-3 z-50 rounded-lg">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
            {severity && <span className={`text-xs ${cfg.text}`}>{severity}</span>}
          </div>
          <p className="text-xs text-[var(--text-secondary)] font-mono break-all">{value}</p>
          <div className="grid grid-cols-3 gap-1 pt-1 border-t border-[var(--border)]">
            {showCopy && (
              <button onClick={(e)=>{e.stopPropagation();navigator.clipboard.writeText(value)}}
                className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded hover:bg-[var(--bg-hover)]">
                <Copy className="w-3 h-3"/> Copy
              </button>
            )}
            {showSearch && (
              <button className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded hover:bg-[var(--bg-hover)]">
                <Search className="w-3 h-3"/> Search
              </button>
            )}
            <button onClick={()=>window.open(INTERNET_SEARCH_URLS[type](value),'_blank','noopener')}
              className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded hover:bg-[var(--bg-hover)]">
              <Globe className="w-3 h-3"/> Online
            </button>
            <button onClick={()=>onInvestigate?.(type,value)}
              className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded hover:bg-[var(--bg-hover)]">
              <Plus className="w-3 h-3"/> Investigate
            </button>
            <button onClick={()=>onGraph?.(type,value)}
              className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded hover:bg-[var(--bg-hover)]">
              <GitBranch className="w-3 h-3"/> Graph
            </button>
            <button className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded hover:bg-[var(--bg-hover)]">
              <ExternalLink className="w-3 h-3"/> Detail
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
