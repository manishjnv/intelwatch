/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: { extend: {
    colors: { 'bg-base': '#07090e', 'bg-primary': '#0d1117', 'bg-secondary': '#131920', 'bg-elevated': '#1a2332', 'bg-hover': '#1e2a3a', 'bg-active': '#243244', border: '#1e2d42', 'border-strong': '#2a3f5a', 'border-focus': '#3b82f6', 'text-primary': '#e2e8f0', 'text-secondary': '#94a3b8', 'text-muted': '#64748b', 'text-link': '#60a5fa', accent: '#3b82f6', 'accent-hover': '#2563eb', 'sev-critical': '#ef4444', 'sev-high': '#f97316', 'sev-medium': '#eab308', 'sev-low': '#22c55e', 'sev-info': '#64748b' },
    boxShadow: { 'glow-blue': '0 0 20px rgba(59,130,246,0.2)', card: '0 4px 6px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4)', 'card-hover': '0 10px 25px rgba(0,0,0,0.6), 0 4px 10px rgba(0,0,0,0.4)' },
    fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
  }},
  plugins: [],
};
