/**
 * @module CweChain
 * @description CWE weakness chain mapper. Maps CVE-referenced CWEs to
 * categories, severity, and common attack chains. Generates human-readable
 * attack narratives. DECISION-029 Phase F.
 */

export interface CweEntry {
  id: string;
  name: string;
  category: string;
  severity: number;
  commonChains: string[];
}

// ── Curated CWE Database (Top 40) ──────────────────────────────

const CWE_DATABASE: CweEntry[] = [
  // Injection
  { id: 'CWE-79', name: 'Cross-site Scripting (XSS)', category: 'injection', severity: 70, commonChains: ['CWE-20', 'CWE-116'] },
  { id: 'CWE-89', name: 'SQL Injection', category: 'injection', severity: 90, commonChains: ['CWE-20', 'CWE-943'] },
  { id: 'CWE-78', name: 'OS Command Injection', category: 'injection', severity: 95, commonChains: ['CWE-20', 'CWE-77'] },
  { id: 'CWE-77', name: 'Command Injection', category: 'injection', severity: 90, commonChains: ['CWE-20'] },
  { id: 'CWE-94', name: 'Code Injection', category: 'injection', severity: 90, commonChains: ['CWE-20'] },
  { id: 'CWE-434', name: 'Unrestricted Upload', category: 'injection', severity: 85, commonChains: ['CWE-20', 'CWE-78'] },
  { id: 'CWE-502', name: 'Deserialization of Untrusted Data', category: 'injection', severity: 90, commonChains: ['CWE-20'] },
  { id: 'CWE-22', name: 'Path Traversal', category: 'injection', severity: 80, commonChains: ['CWE-20', 'CWE-706'] },
  { id: 'CWE-943', name: 'Improper Neutralization of Special Elements in Data Query Logic', category: 'injection', severity: 80, commonChains: ['CWE-20'] },
  { id: 'CWE-116', name: 'Improper Encoding or Escaping of Output', category: 'injection', severity: 65, commonChains: ['CWE-20'] },
  { id: 'CWE-706', name: 'Use of Incorrectly-Resolved Name', category: 'injection', severity: 70, commonChains: ['CWE-22'] },

  // Memory
  { id: 'CWE-787', name: 'Out-of-bounds Write', category: 'memory', severity: 95, commonChains: ['CWE-119', 'CWE-120'] },
  { id: 'CWE-125', name: 'Out-of-bounds Read', category: 'memory', severity: 75, commonChains: ['CWE-119', 'CWE-787'] },
  { id: 'CWE-416', name: 'Use After Free', category: 'memory', severity: 90, commonChains: ['CWE-119', 'CWE-787'] },
  { id: 'CWE-476', name: 'NULL Pointer Dereference', category: 'memory', severity: 60, commonChains: ['CWE-119'] },
  { id: 'CWE-190', name: 'Integer Overflow', category: 'memory', severity: 80, commonChains: ['CWE-119', 'CWE-787'] },
  { id: 'CWE-119', name: 'Improper Restriction of Operations within Memory Buffer', category: 'memory', severity: 85, commonChains: ['CWE-787', 'CWE-125'] },
  { id: 'CWE-120', name: 'Buffer Copy without Checking Size', category: 'memory', severity: 85, commonChains: ['CWE-119', 'CWE-787'] },
  { id: 'CWE-415', name: 'Double Free', category: 'memory', severity: 80, commonChains: ['CWE-119'] },
  { id: 'CWE-122', name: 'Heap-based Buffer Overflow', category: 'memory', severity: 90, commonChains: ['CWE-119', 'CWE-787'] },

  // Auth
  { id: 'CWE-287', name: 'Improper Authentication', category: 'auth', severity: 85, commonChains: ['CWE-306', 'CWE-863'] },
  { id: 'CWE-798', name: 'Hard-coded Credentials', category: 'auth', severity: 80, commonChains: ['CWE-287', 'CWE-259'] },
  { id: 'CWE-352', name: 'Cross-Site Request Forgery', category: 'auth', severity: 65, commonChains: ['CWE-346', 'CWE-693'] },
  { id: 'CWE-306', name: 'Missing Authentication for Critical Function', category: 'auth', severity: 85, commonChains: ['CWE-287'] },
  { id: 'CWE-863', name: 'Incorrect Authorization', category: 'auth', severity: 80, commonChains: ['CWE-287'] },
  { id: 'CWE-862', name: 'Missing Authorization', category: 'auth', severity: 85, commonChains: ['CWE-287', 'CWE-863'] },
  { id: 'CWE-259', name: 'Use of Hard-coded Password', category: 'auth', severity: 80, commonChains: ['CWE-798'] },
  { id: 'CWE-346', name: 'Origin Validation Error', category: 'auth', severity: 65, commonChains: ['CWE-352'] },
  { id: 'CWE-693', name: 'Protection Mechanism Failure', category: 'auth', severity: 70, commonChains: [] },

  // Crypto
  { id: 'CWE-327', name: 'Use of Broken Crypto Algorithm', category: 'crypto', severity: 70, commonChains: ['CWE-326'] },
  { id: 'CWE-326', name: 'Inadequate Encryption Strength', category: 'crypto', severity: 65, commonChains: ['CWE-327'] },
  { id: 'CWE-295', name: 'Improper Certificate Validation', category: 'crypto', severity: 70, commonChains: [] },

  // Config
  { id: 'CWE-732', name: 'Incorrect Permission Assignment', category: 'config', severity: 75, commonChains: [] },
  { id: 'CWE-269', name: 'Improper Privilege Management', category: 'config', severity: 80, commonChains: ['CWE-732'] },
  { id: 'CWE-250', name: 'Execution with Unnecessary Privileges', category: 'config', severity: 70, commonChains: ['CWE-269'] },

  // Info Disclosure
  { id: 'CWE-200', name: 'Exposure of Sensitive Information', category: 'info-disclosure', severity: 65, commonChains: [] },
  { id: 'CWE-209', name: 'Error Message Information Leak', category: 'info-disclosure', severity: 50, commonChains: ['CWE-200'] },
  { id: 'CWE-532', name: 'Insertion of Sensitive Info into Log', category: 'info-disclosure', severity: 55, commonChains: ['CWE-200'] },

  // Input validation (root cause for many)
  { id: 'CWE-20', name: 'Improper Input Validation', category: 'injection', severity: 65, commonChains: ['CWE-79', 'CWE-89', 'CWE-78'] },
];

/** Fast lookup by normalized ID */
const CWE_MAP = new Map<string, CweEntry>();
for (const entry of CWE_DATABASE) {
  CWE_MAP.set(entry.id, entry);
  // Also index by number only
  const num = entry.id.replace('CWE-', '');
  CWE_MAP.set(num, entry);
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Look up a CWE entry by ID. Accepts "CWE-79", "cwe-79", or just "79".
 */
export function getCweEntry(id: string): CweEntry | null {
  const normalized = id.trim().toUpperCase().replace(/^CWE[_\s-]?/, 'CWE-');
  return CWE_MAP.get(normalized) ?? CWE_MAP.get(normalized.replace('CWE-', '')) ?? null;
}

/**
 * Quick severity lookup. Returns 50 for unknown CWEs.
 */
export function getCweSeverity(id: string): number {
  return getCweEntry(id)?.severity ?? 50;
}

/**
 * Group all known CWEs by category.
 */
export function getCwesByCategoryMap(): Record<string, CweEntry[]> {
  const map: Record<string, CweEntry[]> = {};
  for (const entry of CWE_DATABASE) {
    if (!map[entry.category]) map[entry.category] = [];
    map[entry.category]!.push(entry);
  }
  return map;
}

/**
 * Build an attack chain from a list of CWE IDs.
 * Identifies root causes, max severity, and generates a narrative.
 */
export function buildCweChain(cweIds: string[]): {
  chain: CweEntry[];
  rootCauses: CweEntry[];
  maxSeverity: number;
  categories: string[];
  attackNarrative: string;
} {
  const entries: CweEntry[] = [];
  for (const id of cweIds) {
    const entry = getCweEntry(id);
    if (entry) entries.push(entry);
  }

  if (entries.length === 0) {
    return { chain: [], rootCauses: [], maxSeverity: 0, categories: [], attackNarrative: 'No known CWE weaknesses identified.' };
  }

  // Identify root causes: CWEs in our chain that no other CWE in the chain lists as a chain target
  const chainIds = new Set(entries.map((e) => e.id));
  const referencedByOthers = new Set<string>();
  for (const entry of entries) {
    for (const chainTarget of entry.commonChains) {
      if (chainIds.has(chainTarget)) {
        referencedByOthers.add(chainTarget);
      }
    }
  }

  // Root causes = entries whose commonChains reference other entries in our chain,
  // but are NOT themselves referenced by other entries
  const rootCauses = entries.filter((e) => !referencedByOthers.has(e.id));
  // If all are referenced (circular), treat lowest severity as root
  const finalRoots = rootCauses.length > 0 ? rootCauses : [entries.reduce((a, b) => a.severity <= b.severity ? a : b)];

  const maxSeverity = Math.max(...entries.map((e) => e.severity));
  const categories = [...new Set(entries.map((e) => e.category))];

  // Generate narrative
  const parts: string[] = [];
  for (const root of finalRoots) {
    const effects = entries.filter((e) => e.id !== root.id && root.commonChains.includes(e.id));
    if (effects.length > 0) {
      parts.push(`${root.name} (${root.id}) enables ${effects.map((e) => `${e.name} (${e.id})`).join(' and ')}`);
    } else {
      parts.push(`${root.name} (${root.id})`);
    }
  }
  // Add any non-root entries not yet mentioned
  const mentioned = new Set([...finalRoots.map((r) => r.id), ...finalRoots.flatMap((r) => r.commonChains)]);
  const unmentioned = entries.filter((e) => !mentioned.has(e.id));
  if (unmentioned.length > 0) {
    parts.push(unmentioned.map((e) => `${e.name} (${e.id})`).join(', '));
  }

  const attackNarrative = parts.join('; ');

  return { chain: entries, rootCauses: finalRoots, maxSeverity, categories, attackNarrative };
}
