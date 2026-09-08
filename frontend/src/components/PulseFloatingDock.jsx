import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import './pulse-floating-dock.css'

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
  return reduced
}

function DockIcon({ mouseX, title, icon, active, onClick, reduced }) {
  const ref = useRef(null)
  const [hovered, setHovered] = useState(false)

  const distance = useTransform(mouseX, (value) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 }
    return value - bounds.x - bounds.width / 2
  })

  const sizeTransform = useTransform(distance, [-150, 0, 150], [44, 80, 44])
  const iconTransform = useTransform(distance, [-150, 0, 150], [20, 40, 20])
  const spring = { mass: 0.1, stiffness: 150, damping: 12 }
  const size = useSpring(sizeTransform, spring)
  const iconSize = useSpring(iconTransform, spring)

  return (
    <button
      type="button"
      className={`pulse-fd-hit${active ? ' is-on' : ''}`}
      aria-label={title}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.span
        ref={ref}
        className="pulse-fd-well"
        style={reduced ? { width: 44, height: 44 } : { width: size, height: size }}
      >
        <AnimatePresence>
          {hovered ? (
            <motion.span
              className="pulse-fd-tip"
              initial={{ opacity: 0, y: 8, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: 4, x: '-50%' }}
            >
              {title}
            </motion.span>
          ) : null}
        </AnimatePresence>
        <motion.span
          className="pulse-fd-glyph"
          style={reduced ? { width: 20, height: 20 } : { width: iconSize, height: iconSize }}
        >
          {icon}
        </motion.span>
      </motion.span>
    </button>
  )
}

export default function PulseFloatingDock({ items }) {
  const mouseX = useMotionValue(Infinity)
  const reduced = usePrefersReducedMotion()

  return (
    <div className="pulse-fd-wrap">
      <motion.nav
        className="pulse-fd"
        aria-label="Pulse modules"
        onMouseMove={(event) => {
          if (!reduced) mouseX.set(event.clientX)
        }}
        onMouseLeave={() => mouseX.set(Infinity)}
      >
        {items.map((item) => (
          <DockIcon
            key={item.key}
            mouseX={mouseX}
            title={item.title}
            icon={item.icon}
            active={item.active}
            onClick={item.onClick}
            reduced={reduced}
          />
        ))}
      </motion.nav>
    </div>
  )
}
