import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
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

/** Aceternity Floating Dock magnification — vertical rail. */
function DockItem({ mouseY, title, icon, active, onClick, reduced }) {
  const ref = useRef(null)
  const freeze = reduced || active

  const distance = useTransform(mouseY, (value) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { y: 0, height: 0 }
    return value - bounds.y - bounds.height / 2
  })

  const sizeTransform = useTransform(distance, [-150, 0, 150], [40, 64, 40])
  const iconTransform = useTransform(distance, [-150, 0, 150], [18, 30, 18])
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
    >
      <motion.span
        ref={ref}
        className="pulse-fd-well"
        style={freeze ? { width: 40, height: 40 } : { width: size, height: size }}
        whileTap={freeze ? undefined : { scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 520, damping: 28, mass: 0.35 }}
      >
        <motion.span
          className="pulse-fd-glyph"
          style={freeze ? { width: 20, height: 20 } : { width: iconSize, height: iconSize }}
        >
          {icon}
        </motion.span>
      </motion.span>
      <span className="pulse-fd-label">{title}</span>
    </button>
  )
}

/** Full-height left rail with Bitrix layout + Aceternity dock magnification. */
export default function PulseFloatingDock({ items = [] }) {
  const mouseY = useMotionValue(Infinity)
  const reduced = usePrefersReducedMotion()
  const list = Array.isArray(items) ? items : []
  const main = list.filter((item) => item.key !== 'more')
  const more = list.find((item) => item.key === 'more')

  return (
    <aside className="pulse-fd-wrap" aria-label="BDA OS modules">
      <motion.nav
        className="pulse-fd"
        onMouseMove={(event) => {
          if (!reduced) mouseY.set(event.clientY)
        }}
        onMouseLeave={() => mouseY.set(Infinity)}
      >
        <div className="pulse-fd-brand" aria-hidden="true" />
        <div className="pulse-fd-stack">
          {main.map((item) => (
            <DockItem
              key={item.key}
              mouseY={mouseY}
              title={item.title}
              icon={item.icon}
              active={item.active}
              onClick={item.onClick}
              reduced={reduced}
            />
          ))}
        </div>
        {more ? (
          <div className="pulse-fd-foot">
            <DockItem
              mouseY={mouseY}
              title={more.title}
              icon={more.icon}
              active={more.active}
              onClick={more.onClick}
              reduced={reduced}
            />
          </div>
        ) : null}
      </motion.nav>
    </aside>
  )
}
