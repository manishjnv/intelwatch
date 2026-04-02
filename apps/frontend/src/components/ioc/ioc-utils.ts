/**
 * @module components/ioc/ioc-utils
 * @description Shared helpers for IOC rendering — type mapping, time formatting.
 */

/** Maps backend IOC type to EntityChip type. */
export function toChipType(iocType: string): string {
  if (iocType === 'hash_sha256') return 'file_hash_sha256'
  if (iocType === 'hash_sha1') return 'file_hash_sha1'
  if (iocType === 'hash_md5') return 'file_hash_md5'
  return iocType
}

/** Formats a date string as relative time ("Today", "3d ago", "2mo ago"). */
export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}
