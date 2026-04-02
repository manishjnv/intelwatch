/**
 * @module components/ioc/IocContextMenu
 * @description Right-click context menu for IOC rows — copy, defang, OSINT search,
 * graph navigation, lifecycle change.
 */
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Copy, ShieldOff, ExternalLink, Search, GitBranch,
  Target, ChevronRight,
} from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { defang } from '@/utils/defang'
import { LIFECYCLE_STATES } from './ioc-constants'
import type { IOCRecord } from '@/hooks/use-intel-data'

interface IocContextMenuProps {
  ioc: IOCRecord | null
  position: { x: number; y: number } | null
  onClose: () => void
  onLifecycleChange?: (iocId: string, state: string) => void
}

const OSINT_LINKS = [
  { label: 'Search VirusTotal', icon: Search, url: (v: string) => `https://www.virustotal.com/gui/search/${encodeURIComponent(v)}` },
  { label: 'Search Shodan', icon: Search, url: (v: string) => `https://www.shodan.io/search?query=${encodeURIComponent(v)}` },
  { label: 'Search AbuseIPDB', icon: ExternalLink, url: (v: string) => `https://www.abuseipdb.com/check/${encodeURIComponent(v)}`, types: ['ip'] },
]

export function IocContextMenu({ ioc, position, onClose, onLifecycleChange }: IocContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Close on outside click or Escape
  useEffect(() => {
    if (!ioc) return
    const handleClick = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose() }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey) }
  }, [ioc, onClose])

  if (!ioc || !position) return null

  const copyValue = async () => {
    await navigator.clipboard.writeText(ioc.normalizedValue)
    toast('Copied to clipboard', 'success')
    onClose()
  }

  const copyDefanged = async () => {
    const defanged = defang(ioc.normalizedValue, ioc.iocType)
    await navigator.clipboard.writeText(defanged)
    toast('Copied defanged value', 'success')
    onClose()
  }

  const openOsint = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
    onClose()
  }

  // Constrain to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 220),
    top: Math.min(position.y, window.innerHeight - 340),
    zIndex: 60,
  }

  return (
    <div ref={menuRef} style={style} data-testid="ioc-context-menu"
      className="bg-bg-elevated border border-border rounded-lg shadow-2xl py-1 w-52 text-xs">
      {/* Copy */}
      <MenuItem icon={<Copy className="w-3 h-3" />} label="Copy Value" onClick={copyValue} testId="ctx-copy" />
      <MenuItem icon={<ShieldOff className="w-3 h-3" />} label="Copy Defanged" onClick={copyDefanged} testId="ctx-defang" />

      <Divider />

      {/* OSINT links */}
      {OSINT_LINKS
        .filter(l => !l.types || l.types.includes(ioc.iocType))
        .map(l => (
          <MenuItem key={l.label} icon={<l.icon className="w-3 h-3" />} label={l.label}
            onClick={() => openOsint(l.url(ioc.normalizedValue))} testId={`ctx-${l.label.toLowerCase().replace(/\s+/g, '-')}`} />
        ))}

      <Divider />

      {/* Graph navigation */}
      <MenuItem icon={<GitBranch className="w-3 h-3" />} label="Show in Threat Graph"
        onClick={() => { navigate(`/graph?ioc=${encodeURIComponent(ioc.normalizedValue)}`); onClose() }} testId="ctx-graph" />

      {/* Campaign stub */}
      <MenuItem icon={<Target className="w-3 h-3" />} label="Add to Campaign"
        onClick={() => { toast('Campaign assignment coming soon', 'info'); onClose() }} testId="ctx-campaign" />

      <Divider />

      {/* Lifecycle submenu */}
      <div className="px-1">
        <div className="flex items-center gap-2 px-2 py-1.5 text-text-muted">
          <ChevronRight className="w-3 h-3" />
          <span>Change Lifecycle</span>
        </div>
        <div className="pl-5 space-y-0.5">
          {LIFECYCLE_STATES.filter(s => s !== ioc.lifecycle).map(s => (
            <button key={s} data-testid={`ctx-lifecycle-${s}`}
              onClick={() => { onLifecycleChange?.(ioc.id, s); onClose() }}
              className="w-full text-left px-2 py-1 rounded hover:bg-bg-hover text-text-primary capitalize transition-colors">
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function MenuItem({ icon, label, onClick, testId }: { icon: React.ReactNode; label: string; onClick: () => void; testId?: string }) {
  return (
    <button onClick={onClick} data-testid={testId}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-text-primary hover:bg-bg-hover transition-colors">
      {icon}{label}
    </button>
  )
}

function Divider() {
  return <div className="my-1 border-t border-border" />
}
