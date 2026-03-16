export function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;
  const a = parts[0]!;
  const b = parts[1]!;
  return (a === 10 || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || a === 127 || (a === 169 && b === 254) || a === 0 || a >= 224);
}
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
export function isValidIPv4(ip: string): boolean {
  const m = ip.match(IPV4_RE); if (!m) return false;
  return m.slice(1, 5).every((o) => { const n = parseInt(o!, 10); return n >= 0 && n <= 255; });
}
const IPV6_RE = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
export function isValidIPv6(ip: string): boolean { return IPV6_RE.test(ip); }
export function isValidIP(ip: string): boolean { return isValidIPv4(ip) || isValidIPv6(ip); }
export function classifyIP(ip: string): 'private' | 'public' | 'invalid' {
  if (!isValidIPv4(ip)) return 'invalid'; return isPrivateIP(ip) ? 'private' : 'public';
}
