/**
 * @module components/brand/ModuleIcons
 * @description Custom cyber-themed SVG icons for each ETIP module.
 * Designed for sidebar nav (16px), cards (20px), and page headers (24-32px).
 * Consistent geometric style with HUD accents.
 */
import { cn } from '@/lib/utils'

interface IconProps {
  size?: number
  className?: string
}

const defaults = { size: 20 }

/** Dashboard — grid with pulse dot */
export function IconDashboard({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
      <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" opacity="0.6"/>
    </svg>
  )
}

/** IOC Intelligence — shield with scanning crosshair */
export function IconIOC({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      <path d="M12 3L20 7v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V7l8-4z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.2" opacity="0.6"/>
      <line x1="12" y1="7" x2="12" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
      <line x1="12" y1="15" x2="12" y2="17" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
      <line x1="7" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
      <line x1="15" y1="12" x2="17" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
      <circle cx="12" cy="12" r="1" fill="currentColor"/>
    </svg>
  )
}

/** Feed Ingestion — data stream with arrow into funnel */
export function IconFeed({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      {/* Signal waves */}
      <path d="M4 6c2-2 4-2 6 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.4"/>
      <path d="M5 3.5c3-2 5-2 8 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.25"/>
      {/* Down arrow */}
      <line x1="7" y1="7" x2="7" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M4.5 10.5L7 13l2.5-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Funnel / pipeline */}
      <path d="M13 6h8l-3 5v4l-2 3v-7l-3-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx="17" cy="6" r="1" fill="currentColor" opacity="0.5"/>
      {/* Output dot */}
      <circle cx="16" cy="19" r="1.2" fill="currentColor" opacity="0.6"/>
    </svg>
  )
}

/** AI Enrichment — brain/chip with neural connections */
export function IconAI({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      {/* Chip body */}
      <rect x="6" y="6" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6"/>
      {/* Inner circuit */}
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
      <circle cx="12" cy="12" r="1" fill="currentColor"/>
      {/* Pin connectors */}
      <line x1="9" y1="6" x2="9" y2="3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="15" y1="6" x2="15" y2="3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="9" y1="18" x2="9" y2="21" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="15" y1="18" x2="15" y2="21" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="6" y1="9" x2="3" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="6" y1="15" x2="3" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="18" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="18" y1="15" x2="21" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      {/* Neural sparks */}
      <circle cx="3" cy="9" r="0.8" fill="currentColor" opacity="0.4"/>
      <circle cx="21" cy="15" r="0.8" fill="currentColor" opacity="0.4"/>
    </svg>
  )
}

/** Threat Graph — interconnected nodes */
export function IconGraph({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      {/* Connections */}
      <line x1="12" y1="5" x2="5" y2="12" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
      <line x1="12" y1="5" x2="19" y2="10" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
      <line x1="5" y1="12" x2="10" y2="19" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
      <line x1="19" y1="10" x2="10" y2="19" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
      <line x1="5" y1="12" x2="19" y2="10" stroke="currentColor" strokeWidth="1" opacity="0.2"/>
      {/* Nodes */}
      <circle cx="12" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <circle cx="12" cy="5" r="1" fill="currentColor"/>
      <circle cx="5" cy="12" r="2" stroke="currentColor" strokeWidth="1.4" fill="none"/>
      <circle cx="5" cy="12" r="0.8" fill="currentColor" opacity="0.7"/>
      <circle cx="19" cy="10" r="2" stroke="currentColor" strokeWidth="1.4" fill="none"/>
      <circle cx="19" cy="10" r="0.8" fill="currentColor" opacity="0.7"/>
      <circle cx="10" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      <circle cx="10" cy="19" r="1" fill="currentColor"/>
    </svg>
  )
}

/** Threat Actors — masked figure with target */
export function IconActors({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      {/* Head */}
      <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
      {/* Body */}
      <path d="M3 21v-2c0-3 3-5 7-5s7 2 7 5v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      {/* Crosshair overlay */}
      <circle cx="18" cy="7" r="3" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/>
      <line x1="18" y1="3" x2="18" y2="4.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <line x1="18" y1="9.5" x2="18" y2="11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <line x1="14" y1="7" x2="15.5" y2="7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <line x1="20.5" y1="7" x2="22" y2="7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <circle cx="18" cy="7" r="0.8" fill="currentColor" opacity="0.6"/>
    </svg>
  )
}

/** Malware Analysis — virus with scan beam */
export function IconMalware({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      {/* Body */}
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.6"/>
      {/* Inner pattern */}
      <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.5"/>
      {/* Tendrils */}
      <line x1="12" y1="3" x2="12" y2="7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="12" y1="16.5" x2="12" y2="21" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="3" y1="12" x2="7.5" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="16.5" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="5.6" y1="5.6" x2="8.8" y2="8.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="15.2" y1="15.2" x2="18.4" y2="18.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="18.4" y1="5.6" x2="15.2" y2="8.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="8.8" y1="15.2" x2="5.6" y2="18.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      {/* Tendril tips */}
      <circle cx="12" cy="3" r="1" fill="currentColor" opacity="0.4"/>
      <circle cx="12" cy="21" r="1" fill="currentColor" opacity="0.4"/>
      <circle cx="3" cy="12" r="1" fill="currentColor" opacity="0.4"/>
      <circle cx="21" cy="12" r="1" fill="currentColor" opacity="0.4"/>
    </svg>
  )
}

/** Vulnerability Intel — warning shield with crack */
export function IconVuln({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      {/* Triangle */}
      <path d="M12 3L22 20H2L12 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
      {/* Exclamation */}
      <line x1="12" y1="9" x2="12" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="17" r="1" fill="currentColor"/>
      {/* Scan corner marks */}
      <path d="M2.5 18l2-1" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.3"/>
      <path d="M21.5 18l-2-1" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.3"/>
    </svg>
  )
}

/** Threat Hunting — crosshair scope with magnifier */
export function IconHunting({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      {/* Scope circle */}
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6"/>
      {/* Crosshair */}
      <line x1="11" y1="3" x2="11" y2="6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="11" y1="16" x2="11" y2="19" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="3" y1="11" x2="6" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="16" y1="11" x2="19" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      {/* Center dot */}
      <circle cx="11" cy="11" r="1.5" fill="currentColor" opacity="0.5"/>
      {/* Handle */}
      <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

/** Digital Risk Protection — globe with shield overlay */
export function IconDRP({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      {/* Globe */}
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
      {/* Latitude lines */}
      <ellipse cx="12" cy="12" rx="9" ry="3.5" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
      <ellipse cx="12" cy="12" rx="3.5" ry="9" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
      {/* Meridian */}
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.25"/>
      {/* Shield overlay bottom-right */}
      <path d="M17 14l4 1.5v2.5c0 2-1.5 3.5-4 4.5-2.5-1-4-2.5-4-4.5v-2.5l4-1.5z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none"/>
      <circle cx="17" cy="18" r="0.8" fill="currentColor" opacity="0.6"/>
    </svg>
  )
}

/** Correlation Engine — lightning bolt through interconnect */
export function IconCorrelation({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      {/* Lightning bolt */}
      <path d="M13 2L4 13h6l-2 9 9-11h-6l2-9z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
      {/* Connection dots */}
      <circle cx="4" cy="7" r="1.2" fill="currentColor" opacity="0.4"/>
      <circle cx="20" cy="7" r="1.2" fill="currentColor" opacity="0.4"/>
      <circle cx="20" cy="17" r="1.2" fill="currentColor" opacity="0.4"/>
      {/* Connecting dashes */}
      <line x1="5.5" y1="7" x2="8" y2="7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.3" strokeDasharray="1.5 1"/>
      <line x1="16" y1="7" x2="18.5" y2="7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.3" strokeDasharray="1.5 1"/>
      <line x1="16" y1="17" x2="18.5" y2="17" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.3" strokeDasharray="1.5 1"/>
    </svg>
  )
}

/** Enterprise Integrations — data flow between systems */
export function IconIntegrations({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      {/* Left block */}
      <rect x="2" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      {/* Right block */}
      <rect x="16" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      {/* Bottom block */}
      <rect x="9" y="14" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      {/* Connections */}
      <path d="M8 7h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="2 1.5"/>
      <path d="M5 10v4l4.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
      <path d="M19 10v4l-4.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
      {/* Center dots */}
      <circle cx="5" cy="7" r="0.8" fill="currentColor" opacity="0.5"/>
      <circle cx="19" cy="7" r="0.8" fill="currentColor" opacity="0.5"/>
      <circle cx="12" cy="17" r="0.8" fill="currentColor" opacity="0.5"/>
    </svg>
  )
}

/** RBAC & SSO — lock with key circuit */
export function IconRBAC({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      {/* Lock body */}
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6"/>
      {/* Shackle */}
      <path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      {/* Keyhole */}
      <circle cx="12" cy="16" r="1.5" fill="currentColor"/>
      <line x1="12" y1="17.5" x2="12" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Access dots */}
      <circle cx="3" cy="16" r="0.8" fill="currentColor" opacity="0.3"/>
      <circle cx="21" cy="16" r="0.8" fill="currentColor" opacity="0.3"/>
      <line x1="4" y1="16" x2="5" y2="16" stroke="currentColor" strokeWidth="0.8" opacity="0.3" strokeLinecap="round"/>
      <line x1="19" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="0.8" opacity="0.3" strokeLinecap="round"/>
    </svg>
  )
}

export function IconCustomization({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      {/* Sliders */}
      <line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      {/* Knobs */}
      <circle cx="9" cy="6" r="2" fill="currentColor" opacity="0.8"/>
      <circle cx="15" cy="12" r="2" fill="currentColor" opacity="0.8"/>
      <circle cx="11" cy="18" r="2" fill="currentColor" opacity="0.8"/>
    </svg>
  )
}

/** Billing — credit card with pulse indicator */
export function IconBilling({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      {/* Card body */}
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.6"/>
      {/* Magnetic stripe */}
      <line x1="2" y1="9" x2="22" y2="9" stroke="currentColor" strokeWidth="2.5" opacity="0.35"/>
      {/* Chip */}
      <rect x="4" y="12" width="5" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.2" opacity="0.6"/>
      {/* Pulse dot top-right */}
      <circle cx="19" cy="6.5" r="1.2" fill="currentColor" opacity="0.7"/>
      <circle cx="19" cy="6.5" r="2.2" stroke="currentColor" strokeWidth="0.8" opacity="0.3"/>
    </svg>
  )
}

/** Onboarding — rocket launch with trajectory arc */
export function IconOnboarding({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      {/* Rocket body */}
      <path d="M12 2c0 0 5 3 5 9v2l-5 3-5-3v-2C7 5 12 2 12 2z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
      {/* Flame */}
      <path d="M9 15l3 5 3-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
      {/* Fins */}
      <path d="M7 13l-2 3 4-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
      <path d="M17 13l2 3-4-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
      {/* Window */}
      <circle cx="12" cy="9" r="1.5" stroke="currentColor" strokeWidth="1.2" opacity="0.7"/>
    </svg>
  )
}

/** Admin Ops — HUD display with service grid */
export function IconAdmin({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      {/* Outer hexagon frame */}
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      {/* Inner grid dots — service indicators */}
      <circle cx="9"  cy="10" r="1.1" fill="currentColor" opacity="0.8"/>
      <circle cx="12" cy="10" r="1.1" fill="currentColor" opacity="0.8"/>
      <circle cx="15" cy="10" r="1.1" fill="currentColor" opacity="0.8"/>
      <circle cx="9"  cy="14" r="1.1" fill="currentColor" opacity="0.5"/>
      <circle cx="12" cy="14" r="1.1" fill="currentColor" opacity="0.8"/>
      <circle cx="15" cy="14" r="1.1" fill="currentColor" opacity="0.5"/>
    </svg>
  )
}

/** Reporting — document with chart bars */
export function IconReporting({ size = defaults.size, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={cn('shrink-0', className)}>
      {/* Document outline */}
      <path d="M6 3h8l5 5v13H6V3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" opacity="0.5"/>
      {/* Chart bars */}
      <rect x="9" y="12" width="2" height="6" rx="0.5" fill="currentColor" opacity="0.7"/>
      <rect x="12.5" y="14" width="2" height="4" rx="0.5" fill="currentColor" opacity="0.5"/>
      <rect x="16" y="10" width="0" height="0" rx="0" fill="none"/>
    </svg>
  )
}

/** Map module IDs to icon components */
export const MODULE_ICONS: Record<string, React.FC<IconProps>> = {
  'dashboard': IconDashboard,
  'ioc-intelligence': IconIOC,
  'feed-ingestion': IconFeed,
  'ai-enrichment': IconAI,
  'threat-graph': IconGraph,
  'threat-actors': IconActors,
  'malware-analysis': IconMalware,
  'vulnerability-intel': IconVuln,
  'threat-hunting': IconHunting,
  'digital-risk-protection': IconDRP,
  'correlation-engine': IconCorrelation,
  'enterprise-integrations': IconIntegrations,
  'rbac-sso': IconRBAC,
  'customization': IconCustomization,
  'billing': IconBilling,
  'admin-ops': IconAdmin,
  'onboarding': IconOnboarding,
  'reporting': IconReporting,
}
