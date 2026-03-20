/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../../packages/shared-ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-base':      'var(--bg-base)',
        'bg-primary':   'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-elevated':  'var(--bg-elevated)',
        'bg-hover':     'var(--bg-hover)',
        'bg-active':    'var(--bg-active)',
        border:         'var(--border)',
        'border-strong':'var(--border-strong)',
        'border-focus': 'var(--border-focus)',
        'text-primary': 'var(--text-primary)',
        'text-secondary':'var(--text-secondary)',
        'text-muted':   'var(--text-muted)',
        'text-link':    'var(--text-link)',
        accent:         'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'sev-critical': 'var(--sev-critical)',
        'sev-high':     'var(--sev-high)',
        'sev-medium':   'var(--sev-medium)',
        'sev-low':      'var(--sev-low)',
        'sev-info':     'var(--sev-info)',
      },
      boxShadow: {
        'glow-blue':  'var(--shadow-glow-blue)',
        'glow-red':   'var(--shadow-glow-red)',
        'card':       'var(--shadow-md)',
        'card-hover': 'var(--shadow-lg)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
