import NumberFlow from '@number-flow/react'
import { motion, useReducedMotion } from 'framer-motion'

const ease = [0.22, 1, 0.36, 1]

/** Soft enter for My Space overview sections. Use fade on glass so transform does not kill blur. */
export function PulseMotion({ children, className, delay = 0, y = 10, style, fade = false }) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className} style={style}>{children}</div>
  return (
    <motion.div
      className={className}
      style={style}
      initial={fade ? { opacity: 0 } : { opacity: 0, y }}
      animate={fade ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: fade ? 0.32 : 0.38, delay, ease }}
    >
      {children}
    </motion.div>
  )
}

/** Stagger children for KPI / card grids. */
export function PulseStagger({ children, className }) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
      }}
    >
      {children}
    </motion.div>
  )
}

export function PulseStaggerItem({ children, className }) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.34, ease } },
      }}
      whileHover={{ y: -2, transition: { duration: 0.18 } }}
    >
      {children}
    </motion.div>
  )
}

/** Animated count for KPI / leave numbers (Number Flow). */
export function PulseCount({ value, suffix = '', prefix = '' }) {
  const reduce = useReducedMotion()
  if (reduce) {
    return (
      <span>
        {prefix}
        {value}
        {suffix}
      </span>
    )
  }
  return (
    <span className="pulse-count">
      {prefix}
      <NumberFlow value={Number(value) || 0} />
      {suffix}
    </span>
  )
}
