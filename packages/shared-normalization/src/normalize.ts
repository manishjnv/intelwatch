import { type IOCType } from './ioc-detect.js';

export function normalizeIOCValue(value: string, type: IOCType): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  switch (type) {
    case 'ip': return trimmed.replace(/\[\.\]/g, '.').replace(/\(\.\)/g, '.').trim();
    case 'domain': return trimmed.replace(/\[\.\]/g, '.').replace(/\(\.\)/g, '.').toLowerCase().replace(/\.$/, '').trim();
    case 'hash_md5': case 'hash_sha1': case 'hash_sha256': return trimmed.replace(/^0x/i, '').toLowerCase().trim();
    case 'url': return trimmed.replace(/hxxp/gi, 'http').replace(/\[:\]/g, ':').replace(/\[\.\]/g, '.').replace(/\(\.\)/g, '.').trim();
    case 'email': return trimmed.toLowerCase().trim();
    case 'cve': return trimmed.toUpperCase().trim();
    default: return trimmed;
  }
}
