/**
 * @module components/ioc/ioc-constants
 * @description IOC filter definitions, type detection patterns, lifecycle states.
 */
import type { FilterOption } from '@/components/data/FilterBar'

export const IOC_FILTERS: FilterOption[] = [
  { key: 'iocType', label: 'Type', options: [
    { value: 'ip', label: 'IP' }, { value: 'domain', label: 'Domain' },
    { value: 'url', label: 'URL' }, { value: 'hash_sha256', label: 'SHA-256' },
    { value: 'hash_md5', label: 'MD5' }, { value: 'cve', label: 'CVE' },
    { value: 'email', label: 'Email' },
  ]},
  { key: 'severity', label: 'Severity', options: [
    { value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' },
    { value: 'info', label: 'Info' },
  ]},
  { key: 'lifecycle', label: 'Lifecycle', options: [
    { value: 'new', label: 'New' }, { value: 'active', label: 'Active' },
    { value: 'aging', label: 'Aging' }, { value: 'expired', label: 'Expired' },
  ]},
  { key: 'source', label: 'Source', options: [
    { value: 'global', label: 'Global' }, { value: 'private', label: 'Private' },
  ]},
  { key: 'hasCampaign', label: 'Campaign', options: [
    { value: 'true', label: 'Campaign IOCs only' },
  ]},
]

/** Regex patterns for auto-detecting IOC type from raw value. */
export const IOC_PATTERNS: Record<string, RegExp> = {
  ip: /^(\d{1,3}\.){3}\d{1,3}$/,
  cve: /^CVE-\d{4}-\d{4,}$/i,
  hash_sha256: /^[a-fA-F0-9]{64}$/,
  hash_md5: /^[a-fA-F0-9]{32}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  url: /^https?:\/\/.+/,
  domain: /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
}

export const LIFECYCLE_STATES = ['new', 'active', 'aging', 'expired'] as const
export type LifecycleState = (typeof LIFECYCLE_STATES)[number]

export const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low', 'info'] as const
export const TLP_LEVELS = ['red', 'amber', 'green', 'white'] as const
