/**
 * @module @etip/shared-normalization/cpe
 * @description NIST CPE 2.3 URI parser for vulnerability tracking.
 * Parses, formats, validates, and matches CPE URIs.
 */

export interface CPEComponents {
  part: 'a' | 'h' | 'o';
  vendor: string;
  product: string;
  version: string;
  update: string;
  edition: string;
  language: string;
  swEdition: string;
  targetSw: string;
  targetHw: string;
  other: string;
}

const CPE_PREFIX = 'cpe:2.3:';
const CPE_FIELD_COUNT = 13; // cpe:2.3:part:v:p:ver:upd:ed:lang:sw_ed:tgt_sw:tgt_hw:other
const VALID_PARTS = new Set(['a', 'h', 'o']);

/**
 * Split a CPE URI respecting escaped colons (\:).
 * Replaces \: with a placeholder, splits on :, then restores.
 */
function splitCPE(uri: string): string[] {
  const placeholder = '<<ESCAPED_COLON>>';
  const escaped = uri.replace(/\\:/g, placeholder);
  // eslint-disable-next-line no-useless-escape
  return escaped.split(':').map((s) => s.replaceAll(placeholder, '\\:'));
}

/** Parse a CPE 2.3 URI into components. Returns null for invalid URIs. */
export function parseCPE(uri: string): CPEComponents | null {
  if (!uri || !uri.startsWith(CPE_PREFIX)) return null;

  const parts = splitCPE(uri);
  if (parts.length !== CPE_FIELD_COUNT) return null;

  const part = parts[2]!;
  if (!VALID_PARTS.has(part)) return null;

  return {
    part: part as CPEComponents['part'],
    vendor: parts[3]!,
    product: parts[4]!,
    version: parts[5]!,
    update: parts[6]!,
    edition: parts[7]!,
    language: parts[8]!,
    swEdition: parts[9]!,
    targetSw: parts[10]!,
    targetHw: parts[11]!,
    other: parts[12]!,
  };
}

/** Build a CPE 2.3 URI from partial components. Missing fields default to *. */
export function formatCPE(components: Partial<CPEComponents>): string {
  const p = components.part ?? 'a';
  const fields = [
    'cpe', '2.3', p,
    components.vendor ?? '*',
    components.product ?? '*',
    components.version ?? '*',
    components.update ?? '*',
    components.edition ?? '*',
    components.language ?? '*',
    components.swEdition ?? '*',
    components.targetSw ?? '*',
    components.targetHw ?? '*',
    components.other ?? '*',
  ];
  return fields.join(':');
}

/** Check if a CPE URI matches a target pattern (wildcard * matches anything). */
export function matchCPE(cpe: string, target: string): boolean {
  const a = parseCPE(cpe);
  const b = parseCPE(target);
  if (!a || !b) return false;

  const fields: (keyof CPEComponents)[] = [
    'part', 'vendor', 'product', 'version', 'update',
    'edition', 'language', 'swEdition', 'targetSw', 'targetHw', 'other',
  ];

  return fields.every((f) => {
    const av = a[f];
    const bv = b[f];
    return av === '*' || bv === '*' || av === bv;
  });
}

/** Quick validation: checks format without full parse. */
export function isValidCPE(uri: string): boolean {
  return parseCPE(uri) !== null;
}
