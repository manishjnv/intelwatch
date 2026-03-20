// ⛔ DESIGN LOCKED — see UI_DESIGN_LOCK.md
// Framer Motion values (rotateX:2, rotateY:-2, scale:1.01, duration:0.2)
// and perspective:1000 are FROZEN.
// Do NOT modify without [DESIGN-APPROVED] in your Claude prompt.

import React from 'react'
import { motion } from 'framer-motion'

interface IntelCardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

// ⛔ FROZEN — all motion values below (UI_DESIGN_LOCK.md)
export function IntelCard({ children, className = '', onClick }: IntelCardProps) {
  return (
    <motion.div
      className={`bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-4 cursor-pointer ${className}`}
      onClick={onClick}

      // ⛔ FROZEN: these exact values, no adjustments
      whileHover={{
        rotateX: 2,
        rotateY: -2,
        scale: 1.01,
        boxShadow: 'var(--shadow-lg)',
        transition: { duration: 0.2 }, // ⛔ FROZEN: 0.2s
      }}
      whileTap={{ scale: 0.99 }}

      // ⛔ FROZEN: preserve-3d + perspective 1000
      style={{
        transformStyle: 'preserve-3d',
        perspective: 1000,
      }}
    >
      {children}
    </motion.div>
  )
}
