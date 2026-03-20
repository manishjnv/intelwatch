/**
 * @module @etip/shared-utils/ip-validation
 * @description IP address validation and classification utilities.
 * Filters RFC 1918 private, loopback, link-local, and multicast addresses.
 */

/**
 * Check if an IPv4 address is a private/reserved address.
 * Covers: RFC 1918, loopback (127.x), link-local (169.254.x), multicast (224+).
 *
 * @param ip - IPv4 address string (e.g., '192.168.1.1')
 * @returns true if the IP is private/reserved
 *
 * @example
 * ```typescript
 * isPrivateIP('10.0.0.1');      // true
 * isPrivateIP('8.8.8.8');       // false
 * isPrivateIP('127.0.0.1');     // true
 * isPrivateIP('169.254.1.1');   // true
 * ```
 */
export function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  const a = parts[0]!;
  const b = parts[1]!;
  return (
    a === 10 ||                          // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) ||          // 192.168.0.0/16
    a === 127 ||                          // 127.0.0.0/8 (loopback)
    (a === 169 && b === 254) ||          // 169.254.0.0/16 (link-local)
    a === 0 ||                            // 0.0.0.0/8 (this network)
    (a >= 224)                            // 224.0.0.0+ (multicast + reserved)
  );
}

/** IPv4 address regex */
const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Validate that a string is a well-formed IPv4 address.
 * Checks format and octet range (0–255).
 *
 * @param ip - String to validate
 * @returns true if valid IPv4 address
 */
export function isValidIPv4(ip: string): boolean {
  const match = ip.match(IPV4_REGEX);
  if (!match) return false;
  return match.slice(1, 5).every((octet) => {
    const n = parseInt(octet, 10);
    return n >= 0 && n <= 255;
  });
}

/** Simplified IPv6 validation regex */
const IPV6_REGEX = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

/**
 * Validate that a string is a well-formed IPv6 address.
 * Basic regex check — does not expand shorthand notation.
 *
 * @param ip - String to validate
 * @returns true if valid IPv6 address
 */
export function isValidIPv6(ip: string): boolean {
  return IPV6_REGEX.test(ip);
}

/**
 * Check if a string is a valid IP address (IPv4 or IPv6).
 *
 * @param ip - String to validate
 * @returns true if valid IPv4 or IPv6
 */
export function isValidIP(ip: string): boolean {
  return isValidIPv4(ip) || isValidIPv6(ip);
}

/**
 * Classify an IP address for threat intelligence purposes.
 *
 * @param ip - IPv4 address to classify
 * @returns Classification string
 */
export function classifyIP(ip: string): 'private' | 'public' | 'invalid' {
  if (!isValidIPv4(ip)) return 'invalid';
  return isPrivateIP(ip) ? 'private' : 'public';
}
