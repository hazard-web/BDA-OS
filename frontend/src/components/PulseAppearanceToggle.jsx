import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoonOutlined } from '@ant-design/icons'
import { Moon } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { pulseToast } from '../utils/pulseToast'

const CLICKS_FOR_TOAST = 4
const HOME_IDLE_MS = 5_000
const WANDER_SIZE = 48

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function snap(n) {
  return Math.round(n)
}

function randomPageSpot(avoid) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const size = WANDER_SIZE
  const padX = 64
  const padTop = 88
  const padBottom = 96
  const maxX = Math.max(padX, vw - padX - size)
  const maxY = Math.max(padTop, vh - padBottom - size)

  for (let i = 0; i < 12; i += 1) {
    const x = snap(padX + Math.random() * Math.max(1, maxX - padX))
    const y = snap(padTop + Math.random() * Math.max(1, maxY - padTop))
    if (!avoid) return { x, y }
    const dx = x - avoid.x
    const dy = y - avoid.y
    if (dx * dx + dy * dy > 140 * 140) return { x, y }
  }

  return {
    x: snap(clamp(vw * 0.5 - size / 2, padX, maxX)),
    y: snap(clamp(vh * 0.42, padTop, maxY)),
  }
}

function MoonMark({ variant, floating = false }) {
  if (floating) {
    return (
      <span className="pulse-theme-wander-ico" aria-hidden="true">
        <Moon strokeWidth={1.75} />
      </span>
    )
  }
  if (variant === 'switch') {
    return (
      <span className="pulse-theme-toggle" aria-hidden="true">
        <span className="pulse-theme-toggle-icon">
          <Moon strokeWidth={1.75} />
        </span>
      </span>
    )
  }
  if (variant === 'icon') {
    return (
      <span className="pulse-appearance-btn" aria-hidden="true">
        <MoonOutlined />
      </span>
    )
  }
  return <MoonOutlined />
}

export default function PulseAppearanceToggle({ variant = 'switch' }) {
  const { theme, setTheme } = useTheme()
  const slotRef = useRef(null)
  const clicks = useRef(0)
  const idleTimer = useRef(0)
  const [spot, setSpot] = useState(null)

  useEffect(() => {
    if (theme === 'dark') setTheme('light')
  }, [theme, setTheme])

  useEffect(() => () => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current)
  }, [])

  const goHome = () => {
    if (idleTimer.current) {
      window.clearTimeout(idleTimer.current)
      idleTimer.current = 0
    }
    clicks.current = 0
    setSpot(null)
  }

  const armIdleHome = () => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(goHome, HOME_IDLE_MS)
  }

  const onAttempt = (event) => {
    event.preventDefault()
    event.stopPropagation()

    clicks.current += 1
    if (clicks.current >= CLICKS_FOR_TOAST) {
      clicks.current = 0
      pulseToast.info('Coming soon')
    }

    const next = randomPageSpot(spot)
    setSpot(next)
    armIdleHome()
  }

  const floating = Boolean(spot)
  const hit = (floatingMode) => (
    <button
      type="button"
      className="pulse-theme-deny-hit"
      aria-label="Dark mode, coming soon"
      aria-disabled="true"
      title="Coming soon"
      onClick={onAttempt}
      onMouseDown={(e) => e.preventDefault()}
    >
      <MoonMark variant={variant} floating={floatingMode} />
    </button>
  )

  return (
    <>
      <span
        ref={slotRef}
        className={`pulse-theme-deny is-${variant}${floating ? ' is-away' : ''}`}
      >
        {floating ? <span className="pulse-theme-deny-ghost" aria-hidden="true" /> : hit(false)}
      </span>
      {floating
        ? createPortal(
            <div
              className="pulse-theme-wander"
              style={{ transform: `translate3d(${spot.x}px, ${spot.y}px, 0)` }}
            >
              {hit(true)}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
