// DESIGN LOCKED — see UI_DESIGN_LOCK.md
// Framer Motion values are FROZEN: rotateX:2 rotateY:-2 scale:1.01 duration:0.2
import React from 'react'
import { motion } from 'framer-motion'
interface IntelCardProps { children: React.ReactNode; className?: string; onClick?: () => void }
export function IntelCard({ children, className='', onClick }: IntelCardProps) {
  return (
    <motion.div
      className={`bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg p-4 cursor-pointer ${className}`}
      onClick={onClick}
      whileHover={{ rotateX:2, rotateY:-2, scale:1.01, boxShadow:'var(--shadow-lg)', transition:{duration:0.2} }}
      whileTap={{ scale: 0.99 }}
      style={{ transformStyle:'preserve-3d', perspective:1000 }}
    >
      {children}
    </motion.div>
  )
}
