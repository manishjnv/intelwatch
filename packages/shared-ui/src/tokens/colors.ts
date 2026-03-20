// ⛔ DESIGN LOCKED — see UI_DESIGN_LOCK.md
// These values are the single source of truth.
// Never change without [DESIGN-APPROVED] in your Claude prompt.

export const colors = {
  bg: {
    base:      '#07090e',
    primary:   '#0d1117',
    secondary: '#131920',
    elevated:  '#1a2332',
    hover:     '#1e2a3a',
    active:    '#243244',
  },
  border: {
    default: '#1e2d42',
    strong:  '#2a3f5a',
    focus:   '#3b82f6',
  },
  text: {
    primary:   '#e2e8f0',
    secondary: '#94a3b8',
    muted:     '#64748b',
    link:      '#60a5fa',
  },
  accent: {
    default: '#3b82f6',
    hover:   '#2563eb',
    glow:    'rgba(59, 130, 246, 0.15)',
  },
  severity: {
    critical: '#ef4444',
    high:     '#f97316',
    medium:   '#eab308',
    low:      '#22c55e',
    info:     '#64748b',
  },
  tlp: {
    white: '#e2e8f0',
    green: '#22c55e',
    amber: '#eab308',
    red:   '#ef4444',
  },
} as const

export type Severity = keyof typeof colors.severity
export type TLP      = keyof typeof colors.tlp
