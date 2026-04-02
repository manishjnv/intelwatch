/**
 * @module utils/defang
 * @description Defang IOC values for safe sharing — replaces dots and protocol schemes.
 */

/** Defang an IOC value based on its type. */
export function defang(value: string, iocType: string): string {
  switch (iocType) {
    case 'ip':
      return value.replace(/\./g, '[.]')
    case 'domain':
    case 'fqdn':
      return value.replace(/\./g, '[.]')
    case 'url':
      return value
        .replace(/^https:\/\//, 'hxxps://')
        .replace(/^http:\/\//, 'hxxp://')
        .replace(/\./g, '[.]')
    default:
      return value
  }
}
