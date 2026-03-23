/**
 * Constants for typosquatting detection algorithms.
 * Homoglyphs include ASCII, Cyrillic, and Greek confusables (Unicode TR39).
 */

export const HOMOGLYPHS: Record<string, string[]> = {
  a: ['@', '4', 'à', 'á', 'â', 'ã', 'а', 'α'],  // +Cyrillic а, Greek α
  b: ['d', '6', 'ь'],
  c: ['(', 'ç', 'с', 'ϲ'],  // +Cyrillic с, Greek ϲ
  d: ['b', 'cl'],
  e: ['3', 'è', 'é', 'ê', 'е', 'ε'],  // +Cyrillic е, Greek ε
  g: ['9', 'q', 'ɡ'],
  h: ['lh', 'һ'],  // +Cyrillic һ
  i: ['1', 'l', '!', 'í', 'ì', 'і'],  // +Cyrillic і
  j: ['ј'],  // +Cyrillic ј
  k: ['lk', 'κ'],  // +Greek κ
  l: ['1', 'i', '|'],
  m: ['rn', 'nn', 'м'],  // +Cyrillic м
  n: ['r', 'ñ', 'п'],  // +Cyrillic п
  o: ['0', 'ø', 'ö', 'ò', 'ó', 'о', 'ο'],  // +Cyrillic о, Greek ο
  p: ['р', 'ρ'],  // +Cyrillic р, Greek ρ
  q: ['9', 'g'],
  s: ['5', '$', 'ś', 'ѕ'],  // +Cyrillic ѕ
  t: ['7', '+', 'τ'],  // +Greek τ
  u: ['v', 'ú', 'ù', 'ü'],
  v: ['u', 'ν'],  // +Greek ν
  w: ['vv', 'ω'],  // +Greek ω
  x: ['х', 'χ'],  // +Cyrillic х, Greek χ
  y: ['ý', 'у'],  // +Cyrillic у
  z: ['2'],
};

/** Combosquatting keywords — most common brand impersonation suffixes/prefixes. */
export const COMBO_KEYWORDS = [
  'support', 'login', 'verify', 'secure', 'account',
  'update', 'portal', 'help', 'service', 'manage',
];

/** QWERTY keyboard adjacency map (covers QWERTZ/AZERTY overlaps). */
export const KEYBOARD_ADJACENCY: Record<string, string[]> = {
  q: ['w', 'a'], w: ['q', 'e', 'a', 's'], e: ['w', 'r', 's', 'd'],
  r: ['e', 't', 'd', 'f'], t: ['r', 'y', 'f', 'g'], y: ['t', 'u', 'g', 'h'],
  u: ['y', 'i', 'h', 'j'], i: ['u', 'o', 'j', 'k'], o: ['i', 'p', 'k', 'l'],
  p: ['o', 'l'],
  a: ['q', 'w', 's', 'z'], s: ['a', 'w', 'e', 'd', 'z', 'x'],
  d: ['s', 'e', 'r', 'f', 'x', 'c'], f: ['d', 'r', 't', 'g', 'c', 'v'],
  g: ['f', 't', 'y', 'h', 'v', 'b'], h: ['g', 'y', 'u', 'j', 'b', 'n'],
  j: ['h', 'u', 'i', 'k', 'n', 'm'], k: ['j', 'i', 'o', 'l', 'm'],
  l: ['k', 'o', 'p'],
  z: ['a', 's', 'x'], x: ['z', 's', 'd', 'c'], c: ['x', 'd', 'f', 'v'],
  v: ['c', 'f', 'g', 'b'], b: ['v', 'g', 'h', 'n'], n: ['b', 'h', 'j', 'm'],
  m: ['n', 'j', 'k'],
};

export const VOWELS = ['a', 'e', 'i', 'o', 'u'];

export const COMMON_TLDS = [
  '.com', '.net', '.org', '.io', '.co', '.info', '.biz',
  '.xyz', '.online', '.site', '.app', '.dev', '.me', '.us',
  '.uk', '.de', '.fr', '.ru', '.cn',
];

export const HOSTING_PROVIDERS = [
  'Cloudflare', 'AWS', 'GoDaddy', 'Namecheap', 'OVH',
  'DigitalOcean', 'Hetzner', 'BulletproofHost', 'FastFlux',
  null,
];

/** TLD risk scoring — Interisle 2025 abuse data. */
export const TLD_RISK_SCORES: Record<string, number> = {
  '.top': 0.95, '.tk': 0.95, '.xyz': 0.90, '.online': 0.85, '.site': 0.85,
  '.club': 0.80, '.work': 0.80, '.buzz': 0.80, '.icu': 0.80, '.link': 0.75,
  '.info': 0.70, '.biz': 0.65, '.cc': 0.65, '.ws': 0.65, '.pw': 0.65,
  '.cn': 0.60, '.ru': 0.60, '.co': 0.40, '.io': 0.30, '.app': 0.20,
  '.dev': 0.20, '.com': 0.15, '.net': 0.15, '.org': 0.15,
};
