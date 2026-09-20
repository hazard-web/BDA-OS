import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useHeatCalendar } from './context'
import { cn, EASE_OUT, fmtDay, fmtRange } from './utils'

/**
 * One floating tip (portaled) — never stacks exit clones inside the grid.
 */
export function HeatCalendarTooltip({ children, className }) {
  const { gridRef, tooltipId, tip, tooltip, hover, clear } = useHeatCalendar()
  const tipRef = useRef(null)
  const [coords, setCoords] = useState({ x: 0, y: 0, below: false, ready: false })

  // Only follow pointer hover — pinned selection keeps range dimming, not a sticky tip pile
  const open = Boolean(tooltip && hover && tip)

  const content = useMemo(() => {
    if (!tooltip) return null
    if (typeof children === 'function') return children(tooltip)
    if (children) return children
    const when =
      tooltip.days > 1 && tooltip.startDate && tooltip.endDate
        ? `${fmtRange.format(tooltip.startDate)} – ${fmtRange.format(tooltip.endDate)}`
        : fmtDay.format(tooltip.date)
    return (
      <>
        <span className="pulse-hc-tip-value">{tooltip.label}</span>
        <span className="pulse-hc-tip-when">{when}</span>
        {tooltip.days > 1 ? <span className="pulse-hc-tip-days">{tooltip.days} days</span> : null}
      </>
    )
  }, [children, tooltip])

  useLayoutEffect(() => {
    if (!open || !tip || !gridRef.current) {
      setCoords((c) => (c.ready ? { ...c, ready: false } : c))
      return undefined
    }

    const place = () => {
      const grid = gridRef.current
      const cell = grid?.querySelector(`[data-heat-cell="${tip.w}-${tip.d}"]`)
      const tipEl = tipRef.current
      if (!grid || !cell) return
      const c = cell.getBoundingClientRect()
      const tw = tipEl?.offsetWidth || 160
      const th = tipEl?.offsetHeight || 28
      const pad = 10
      let x = c.left + c.width / 2
      let below = false
      let y = c.top - 8
      if (y - th < pad) {
        below = true
        y = c.bottom + 8
      }
      const half = tw / 2
      if (x - half < pad) x = half + pad
      if (x + half > window.innerWidth - pad) x = window.innerWidth - pad - half
      if (below && y + th > window.innerHeight - pad) {
        below = false
        y = c.top - 8
      }
      setCoords({ x, y, below, ready: true })
    }

    place()
    const raf = requestAnimationFrame(place)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, tip, tooltip?.label, tooltip?.date, gridRef])

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <span id={tooltipId} className="pulse-hc-tip-sr" role="status" />
      <AnimatePresence mode="wait">
        {open ? (
          <motion.div
            key="pulse-hc-tip"
            ref={tipRef}
            role="tooltip"
            className={cn('pulse-hc-tip is-portal', coords.below && 'is-below', className)}
            style={{
              left: coords.x,
              top: coords.y,
              visibility: coords.ready ? 'visible' : 'hidden',
            }}
            initial={{ opacity: 0, y: coords.below ? -4 : 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.08 } }}
            transition={{ duration: 0.12, ease: EASE_OUT }}
            onPointerDown={() => clear?.()}
          >
            {content}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>,
    document.body,
  )
}
