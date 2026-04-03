/**
 * @module components/search/SearchSyntaxHelper
 * @description Enhanced search syntax reference popover with all supported operators.
 */
import { X } from 'lucide-react'

interface SearchSyntaxHelperProps {
  onClose: () => void
}

const SYNTAX_SECTIONS = [
  {
    title: 'Filter by field',
    items: [
      { syntax: 'type:ip', desc: 'Filter by IOC type (ip, domain, url, hash_sha256, hash_md5, cve, email)' },
      { syntax: 'severity:critical', desc: 'Filter by severity (critical, high, medium, low)' },
      { syntax: 'tag:botnet', desc: 'Filter by tag name' },
      { syntax: 'actor:APT29', desc: 'Filter by threat actor attribution' },
      { syntax: 'campaign:SolarWinds', desc: 'Filter by campaign name' },
    ],
  },
  {
    title: 'Advanced operators',
    items: [
      { syntax: 'confidence:>80', desc: 'Confidence score above threshold' },
      { syntax: 'confidence:<30', desc: 'Confidence score below threshold' },
      { syntax: 'seen:7d', desc: 'Last seen within N days' },
      { syntax: 'seen:24h', desc: 'Last seen within N hours' },
      { syntax: '"cobalt strike"', desc: 'Exact phrase match' },
    ],
  },
  {
    title: 'Tips',
    items: [
      { syntax: '/', desc: 'Press / to focus the search bar' },
      { syntax: 'Esc', desc: 'Clear search and unfocus' },
      { syntax: 'Enter', desc: 'Submit search and save to history' },
    ],
  },
]

export function SearchSyntaxHelper({ onClose }: SearchSyntaxHelperProps) {
  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-bg-elevated border border-border rounded-xl p-4 shadow-xl z-50" data-testid="syntax-helper">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-text-primary">Search Syntax Reference</p>
        <button onClick={onClose} className="p-1 rounded hover:bg-bg-hover text-text-muted" data-testid="syntax-close">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SYNTAX_SECTIONS.map(section => (
          <div key={section.title}>
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-medium mb-1.5">{section.title}</p>
            <div className="space-y-1">
              {section.items.map(item => (
                <div key={item.syntax} className="flex items-start gap-2 text-xs">
                  <code className="text-accent font-mono bg-bg-base px-1.5 py-0.5 rounded border border-border-subtle whitespace-nowrap shrink-0">
                    {item.syntax}
                  </code>
                  <span className="text-text-secondary leading-snug">{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
