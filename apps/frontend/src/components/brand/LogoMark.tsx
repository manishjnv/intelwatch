/**
 * @module components/brand/LogoMark
 * @description Inline SVG logo — cyber shield with scanning eye.
 * Uses useId() for unique gradient IDs (safe with multiple instances).
 */
import { useId } from 'react'

interface LogoMarkProps {
  size?: number
  className?: string
}

export function LogoMark({ size = 32, className }: LogoMarkProps) {
  const uid = useId().replace(/:/g, '')
  const gid = `lm-g-${uid}`
  const bid = `lm-b-${uid}`
  const cid = `lm-c-${uid}`

  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32" fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00ff88"/>
          <stop offset="50%" stopColor="#00ddff"/>
          <stop offset="100%" stopColor="#3b82f6"/>
        </linearGradient>
        <linearGradient id={bid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--bg-primary, #0d1117)"/>
          <stop offset="100%" stopColor="var(--bg-base, #07090e)"/>
        </linearGradient>
        <radialGradient id={cid} cx="50%" cy="48%" r="30%">
          <stop offset="0%" stopColor="#00ff88"/>
          <stop offset="100%" stopColor="#00ddff" stopOpacity="0"/>
        </radialGradient>
      </defs>
      {/* Rounded square */}
      <rect width="32" height="32" rx="7" fill={`url(#${bid})`}/>
      <rect x="1" y="1" width="30" height="30" rx="6"
        fill="none" stroke={`url(#${gid})`} strokeWidth="1.2" opacity="0.5"/>
      {/* Shield — curved */}
      <path d="M16 5 C16 5,17 5,17.5 5.2 L26 9 C26.5 9.2,27 9.8,27 10.4
        L27 18 C27 21,25 24,22 26 C20 27.5,17 28.5,16.2 28.8
        C16 28.9,15.8 28.8,15.8 28.8 C15 28.5,12 27.5,10 26
        C7 24,5 21,5 18 L5 10.4 C5 9.8,5.5 9.2,6 9
        L14.5 5.2 C15 5,16 5,16 5 Z"
        fill={`url(#${bid})`} stroke={`url(#${gid})`} strokeWidth="1.4"/>
      {/* Ring */}
      <circle cx="16" cy="15.5" r="5.5"
        fill="none" stroke={`url(#${gid})`} strokeWidth="1.2" opacity="0.6"/>
      {/* Glowing core */}
      <circle cx="16" cy="15.5" r="3" fill={`url(#${cid})`} opacity="0.4"/>
      <circle cx="16" cy="15.5" r="2.2" fill={`url(#${gid})`}/>
      <circle cx="16" cy="15.5" r="1" fill="#fff" opacity="0.95"/>
      {/* Radar sweep */}
      <line x1="16" y1="15.5" x2="21.5" y2="13"
        stroke="#00ff88" strokeWidth="1" opacity="0.7" strokeLinecap="round"/>
      {/* Keystone dot */}
      <circle cx="16" cy="5" r="1.5" fill="#00ff88" opacity="0.9"/>
    </svg>
  )
}
