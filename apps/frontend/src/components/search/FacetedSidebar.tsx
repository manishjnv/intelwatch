/**
 * @module components/search/FacetedSidebar
 * @description Faceted filter sidebar for IOC search with type/severity/TLP/confidence/enrichment filters.
 */
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Filter, ChevronDown, ChevronRight, X, RotateCcw } from 'lucide-react'
import type { EsSearchFilters, EsSearchFacets, FacetBucket } from '@/hooks/use-es-search'

// ─── Types ───────────────────────────────────────────────────

interface FacetedSidebarProps {
  facets: EsSearchFacets
  activeFilters: EsSearchFilters
  onFilterChange: (f: Partial<EsSearchFilters>) => void
  onClearAll: () => void
  className?: string
}

// ─── Constants ───────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  ip: 'IP Address', domain: 'Domain', url: 'URL',
  hash_sha256: 'SHA-256', hash_md5: 'MD5', cve: 'CVE', email: 'Email',
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-sev-critical', high: 'bg-sev-high',
  medium: 'bg-sev-medium', low: 'bg-sev-low',
}

const TLP_COLORS: Record<string, string> = {
  RED: 'bg-sev-critical', AMBER: 'bg-sev-medium',
  GREEN: 'bg-sev-low', WHITE: 'bg-gray-300',
}

const CONFIDENCE_PRESETS = [
  { label: 'High (70+)', min: 70, max: 100 },
  { label: 'Medium+ (30+)', min: 30, max: 100 },
  { label: 'All', min: 0, max: 100 },
]

// ─── Helper: collapsible section ─────────────────────────────

function FilterSection({
  title, children, defaultOpen = true, count,
}: { title: string; children: React.ReactNode; defaultOpen?: boolean; count?: number }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {title}
          {count != null && count > 0 && (
            <span className="text-[10px] bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">{count}</span>
          )}
        </span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

// ─── Helper: checkbox list ───────────────────────────────────

function CheckboxList({
  buckets, activeValues, onChange, colorMap, labelMap,
}: {
  buckets: FacetBucket[]
  activeValues: string[]
  onChange: (values: string[]) => void
  colorMap?: Record<string, string>
  labelMap?: Record<string, string>
}) {
  const toggle = (key: string) => {
    const next = activeValues.includes(key)
      ? activeValues.filter(v => v !== key)
      : [...activeValues, key]
    onChange(next)
  }

  return (
    <div className="space-y-1" data-testid="checkbox-list">
      {buckets.map(b => (
        <label
          key={b.key}
          className={cn(
            'flex items-center gap-2 px-1.5 py-1 rounded-md cursor-pointer text-xs transition-colors',
            activeValues.includes(b.key) ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-bg-hover',
          )}
        >
          <input
            type="checkbox"
            checked={activeValues.includes(b.key)}
            onChange={() => toggle(b.key)}
            className="sr-only"
          />
          <div className={cn(
            'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0',
            activeValues.includes(b.key) ? 'bg-accent border-accent' : 'border-border-strong',
          )}>
            {activeValues.includes(b.key) && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          {colorMap?.[b.key] && <span className={cn('w-2 h-2 rounded-full shrink-0', colorMap[b.key])} />}
          <span className="flex-1 truncate">{labelMap?.[b.key] ?? b.key}</span>
          <span className="text-text-muted text-[10px] tabular-nums">{b.count}</span>
        </label>
      ))}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────

export function FacetedSidebar({ facets, activeFilters, onFilterChange, onClearAll, className }: FacetedSidebarProps) {
  const activeCount = (activeFilters.type?.length ?? 0)
    + (activeFilters.severity?.length ?? 0)
    + (activeFilters.tlp?.length ?? 0)
    + (activeFilters.enriched ? 1 : 0)
    + (activeFilters.confidenceMin != null && activeFilters.confidenceMin > 0 ? 1 : 0)

  return (
    <div className={cn('flex flex-col bg-bg-secondary/30 border-r border-border overflow-y-auto', className)} data-testid="faceted-sidebar">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
          <Filter className="w-3.5 h-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="text-[10px] bg-accent text-white px-1.5 py-0.5 rounded-full" data-testid="active-filter-count">
              {activeCount}
            </span>
          )}
        </span>
        {activeCount > 0 && (
          <button
            onClick={onClearAll}
            className="flex items-center gap-1 text-[10px] text-text-muted hover:text-accent transition-colors"
            data-testid="clear-all-filters"
          >
            <RotateCcw className="w-3 h-3" />
            Clear all
          </button>
        )}
      </div>

      {/* IOC Type */}
      <FilterSection title="IOC Type" count={activeFilters.type?.length}>
        <CheckboxList
          buckets={facets.byType}
          activeValues={activeFilters.type ?? []}
          onChange={v => onFilterChange({ type: v.length ? v : undefined })}
          labelMap={TYPE_LABELS}
        />
      </FilterSection>

      {/* Severity */}
      <FilterSection title="Severity" count={activeFilters.severity?.length}>
        <CheckboxList
          buckets={facets.bySeverity}
          activeValues={activeFilters.severity ?? []}
          onChange={v => onFilterChange({ severity: v.length ? v : undefined })}
          colorMap={SEVERITY_COLORS}
        />
      </FilterSection>

      {/* Confidence Range */}
      <FilterSection title="Confidence" count={activeFilters.confidenceMin != null && activeFilters.confidenceMin > 0 ? 1 : 0}>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              value={activeFilters.confidenceMin ?? 0}
              onChange={e => onFilterChange({ confidenceMin: Number(e.target.value) || undefined })}
              className="flex-1 h-1 accent-accent"
              data-testid="confidence-slider"
            />
            <span className="text-[10px] text-text-muted tabular-nums w-8 text-right">
              {activeFilters.confidenceMin ?? 0}+
            </span>
          </div>
          <div className="flex gap-1">
            {CONFIDENCE_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => onFilterChange({ confidenceMin: p.min > 0 ? p.min : undefined, confidenceMax: p.max < 100 ? p.max : undefined })}
                className={cn(
                  'text-[10px] px-2 py-1 rounded-md border transition-colors',
                  (activeFilters.confidenceMin ?? 0) === p.min
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-text-muted hover:text-text-secondary hover:border-border-strong',
                )}
                data-testid={`confidence-preset-${p.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </FilterSection>

      {/* TLP */}
      <FilterSection title="TLP" count={activeFilters.tlp?.length} defaultOpen={false}>
        <CheckboxList
          buckets={facets.byTlp}
          activeValues={activeFilters.tlp ?? []}
          onChange={v => onFilterChange({ tlp: v.length ? v : undefined })}
          colorMap={TLP_COLORS}
        />
      </FilterSection>

      {/* Enrichment */}
      <FilterSection title="Enrichment" count={activeFilters.enriched ? 1 : 0} defaultOpen={false}>
        <label className="flex items-center gap-2 px-1.5 py-1 rounded-md cursor-pointer text-xs text-text-secondary hover:bg-bg-hover transition-colors">
          <input
            type="checkbox"
            checked={activeFilters.enriched ?? false}
            onChange={e => onFilterChange({ enriched: e.target.checked || undefined })}
            className="sr-only"
          />
          <div className={cn(
            'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0',
            activeFilters.enriched ? 'bg-accent border-accent' : 'border-border-strong',
          )}>
            {activeFilters.enriched && (
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <span>Has enrichment data</span>
        </label>
      </FilterSection>

      {/* Active filters summary */}
      {activeCount > 0 && (
        <div className="px-3 py-2 border-t border-border">
          <div className="flex flex-wrap gap-1">
            {(activeFilters.type ?? []).map(t => (
              <FilterPill key={`type-${t}`} label={TYPE_LABELS[t] ?? t} onRemove={() => {
                onFilterChange({ type: (activeFilters.type ?? []).filter(v => v !== t) })
              }} />
            ))}
            {(activeFilters.severity ?? []).map(s => (
              <FilterPill key={`sev-${s}`} label={s} onRemove={() => {
                onFilterChange({ severity: (activeFilters.severity ?? []).filter(v => v !== s) })
              }} />
            ))}
            {(activeFilters.tlp ?? []).map(t => (
              <FilterPill key={`tlp-${t}`} label={`TLP:${t}`} onRemove={() => {
                onFilterChange({ tlp: (activeFilters.tlp ?? []).filter(v => v !== t) })
              }} />
            ))}
            {activeFilters.enriched && (
              <FilterPill label="Enriched" onRemove={() => onFilterChange({ enriched: undefined })} />
            )}
            {activeFilters.confidenceMin != null && activeFilters.confidenceMin > 0 && (
              <FilterPill label={`≥${activeFilters.confidenceMin}%`} onRemove={() => onFilterChange({ confidenceMin: undefined })} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-full">
      {label}
      <button onClick={onRemove} className="hover:text-sev-critical transition-colors">
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  )
}

// ─── Mobile filter trigger ───────────────────────────────────

export function MobileFilterTrigger({
  activeCount, onClick,
}: { activeCount: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs bg-bg-elevated border border-border rounded-lg px-3 py-2 hover:border-accent transition-colors md:hidden"
      data-testid="mobile-filter-trigger"
    >
      <Filter className="w-3.5 h-3.5" />
      Filters
      {activeCount > 0 && (
        <span className="text-[10px] bg-accent text-white px-1.5 py-0.5 rounded-full">{activeCount}</span>
      )}
    </button>
  )
}
