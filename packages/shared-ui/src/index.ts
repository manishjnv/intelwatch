// ⛔ packages/shared-ui — DESIGN LOCKED barrel export
// All exports from this package are design-locked per UI_DESIGN_LOCK.md
// Importing these components commits you to the locked design contract.

// Tokens
export * from './tokens/colors'

// Primitives (infrastructure — NOT design-locked)
export { Popover, PopoverTrigger, PopoverContent }       from './primitives/popover'
export { Tooltip, TooltipTrigger, TooltipContent }       from './primitives/tooltip'

// ⛔ LOCKED components — require [DESIGN-APPROVED] to modify
export { EntityChip, ENTITY_TYPE_CONFIG, INTERNET_SEARCH_URLS } from './components/EntityChip'
export type { EntityType, Severity }                             from './components/EntityChip'
export { InvestigationPanel }                                    from './components/InvestigationPanel'
export { TopStatsBar }                                           from './components/TopStatsBar'
export { IntelCard }                                             from './components/IntelCard'
export { SeverityBadge, SeverityDot }                           from './components/SeverityBadge'
export { GlobalSearch, useGlobalSearch }                        from './components/GlobalSearch'
export { PageStatsBar, CompactStat }                            from './components/PageStatsBar'

// UI helpers (mandated by 20-UI-UX — NOT design-locked)
export { TooltipHelp }    from './components/TooltipHelp'
export { InlineHelp }     from './components/InlineHelp'
export { SkeletonBlock }  from './components/SkeletonBlock'
