/**
 * @module utils/ioc-export
 * @description Export IOC rows as CSV, JSON, or STIX 2.1 bundle.
 */
import type { IOCRecord } from '@/hooks/use-intel-data'

function download(name: string, content: string, type: string) {
  const a = document.createElement('a')
  a.download = name
  const url = URL.createObjectURL(new Blob([content], { type }))
  a.href = url
  a.click()
  if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
}

export function exportCsv(rows: IOCRecord[]) {
  const hdr = 'type,value,severity,confidence,lifecycle,firstSeen,lastSeen,tags'
  const body = rows.map(r =>
    [r.iocType, r.normalizedValue, r.severity, r.confidence, r.lifecycle,
     r.firstSeen ?? '', r.lastSeen ?? '', r.tags.join(';')]
      .map(v => `"${v}"`).join(','),
  ).join('\n')
  download('iocs.csv', hdr + '\n' + body, 'text/csv')
}

export function exportJson(rows: IOCRecord[]) {
  download('iocs.json', JSON.stringify(rows, null, 2), 'application/json')
}

export function exportStix(rows: IOCRecord[]) {
  const bundle = {
    type: 'bundle',
    id: `bundle--${crypto.randomUUID()}`,
    objects: rows.map(r => ({
      type: 'indicator', id: `indicator--${r.id}`,
      created: r.firstSeen ?? new Date().toISOString(),
      modified: r.lastSeen ?? new Date().toISOString(),
      name: r.normalizedValue,
      pattern: `[${r.iocType}:value = '${r.normalizedValue}']`,
      pattern_type: 'stix',
      confidence: r.confidence,
      labels: [r.severity, r.lifecycle],
    })),
  }
  download('iocs-stix.json', JSON.stringify(bundle, null, 2), 'application/json')
}
