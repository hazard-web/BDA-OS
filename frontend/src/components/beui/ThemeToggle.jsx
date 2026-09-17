/**
 * Adapted from beUI Theme Toggle (MIT)
 * https://beui.dev/components/motion/theme-toggle
 *
 * Rectangle (default) / circle / blinds View Transition theme reveal.
 * Wired to Pulse ThemeContext instead of next-themes.
 */
import { Moon, Sun } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useTheme } from '../../context/ThemeContext'

const EASE_OUT_CSS = 'cubic-bezier(0.16, 1, 0.3, 1)'
const VT_STYLE_ID = 'beui-theme-toggle-vt'

const VT_CSS = `
html[data-beui-vt="rect"]::view-transition-old(root) {
  animation: none;
  mix-blend-mode: normal;
}
html[data-beui-vt="rect"]::view-transition-new(root) {
  mix-blend-mode: normal;
  animation: beui-rect-reveal 400ms ease-out;
}
html[data-beui-vt="circle"]::view-transition-old(root),
html[data-beui-vt="circle-blur"]::view-transition-old(root) {
  animation: none;
  mix-blend-mode: normal;
}
html[data-beui-vt="circle"]::view-transition-new(root) {
  mix-blend-mode: normal;
  animation: beui-circle-reveal 700ms cubic-bezier(0.4, 0, 0.2, 1);
}
html[data-beui-vt="circle-blur"]::view-transition-new(root) {
  mix-blend-mode: normal;
  animation: beui-circle-blur-reveal 700ms cubic-bezier(0.4, 0, 0.2, 1);
}
html[data-beui-vt="blinds"]::view-transition-old(root) {
  animation: none;
  mix-blend-mode: normal;
}
@property --beui-vt-slat {
  syntax: "<length>";
  inherits: false;
  initial-value: 72px;
}
html[data-beui-vt="blinds"]::view-transition-new(root) {
  mix-blend-mode: normal;
  mask-image: linear-gradient(
    90deg,
    #000 0 var(--beui-vt-slat),
    transparent calc(var(--beui-vt-slat) + 20px)
  );
  mask-size: 72px 100%;
  mask-repeat: repeat;
  animation: beui-blinds-reveal 700ms ${EASE_OUT_CSS};
}
@keyframes beui-rect-reveal {
  from { clip-path: var(--beui-vt-from, inset(100% 0 0 0)); }
  to { clip-path: inset(0 0 0 0); }
}
@keyframes beui-circle-reveal {
  from { clip-path: circle(0% at var(--beui-vt-origin, 50% 100%)); }
  to { clip-path: circle(150% at var(--beui-vt-origin, 50% 100%)); }
}
@keyframes beui-circle-blur-reveal {
  from { clip-path: circle(0% at var(--beui-vt-origin, 50% 100%)); filter: blur(8px); }
  to { clip-path: circle(150% at var(--beui-vt-origin, 50% 100%)); filter: blur(0px); }
}
@keyframes beui-blinds-reveal {
  from { --beui-vt-slat: -20px; }
  to { --beui-vt-slat: 72px; }
}
`

const RECT_FROM = {
  'top-left': 'inset(0 100% 100% 0)',
  'top-right': 'inset(0 0 100% 100%)',
  'bottom-left': 'inset(100% 100% 0 0)',
  'bottom-right': 'inset(100% 0 0 100%)',
  center: 'inset(50% 50% 50% 50%)',
  'bottom-up': 'inset(100% 0 0 0)',
}

const CIRCLE_ORIGIN = {
  'top-left': '0% 0%',
  'top-right': '100% 0%',
  'bottom-left': '0% 100%',
  'bottom-right': '100% 100%',
  center: '50% 50%',
  'bottom-up': '50% 100%',
}

const BLUR_TRANSITION = { duration: 0.2, ease: 'easeInOut' }
const SWAP_BLUR = 'blur(8px)'
const ICON_VARIANTS = {
  initial: { opacity: 0, scale: 0.25, filter: SWAP_BLUR },
  animate: {
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: BLUR_TRANSITION,
  },
  exit: {
    opacity: 0,
    scale: 0.25,
    filter: SWAP_BLUR,
    transition: BLUR_TRANSITION,
  },
}

function ensureVtStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(VT_STYLE_ID)) return
  const el = document.createElement('style')
  el.id = VT_STYLE_ID
  el.textContent = VT_CSS
  document.head.appendChild(el)
}

export function useThemeToggle({
  variant = 'rectangle',
  start = 'bottom-up',
} = {}) {
  const { theme, setTheme } = useTheme()
  const reduce = useReducedMotion() ?? false
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    ensureVtStyles()
  }, [])

  const isDark = mounted && theme === 'dark'

  const toggle = () => {
    const next = isDark ? 'light' : 'dark'

    if (reduce || !('startViewTransition' in document)) {
      setTheme(next)
      return
    }

    const root = document.documentElement

    if (variant === 'rectangle') {
      root.style.setProperty('--beui-vt-from', RECT_FROM[start] || RECT_FROM['bottom-up'])
      root.dataset.beuiVt = 'rect'
    } else if (variant === 'blinds') {
      root.dataset.beuiVt = 'blinds'
    } else {
      root.style.setProperty('--beui-vt-origin', CIRCLE_ORIGIN[start] || CIRCLE_ORIGIN['bottom-up'])
      root.dataset.beuiVt = variant
    }

    const vt = document.startViewTransition(() => {
      setTheme(next)
    })

    vt.finished.finally(() => {
      delete root.dataset.beuiVt
    })
  }

  return { isDark, mounted, toggle }
}

function SwapIcon({ value, className, children }) {
  const reduce = useReducedMotion()

  return (
    <span
      className={className}
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        lineHeight: 0,
      }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          aria-hidden
          variants={ICON_VARIANTS}
          initial={reduce ? false : 'initial'}
          animate={reduce ? { opacity: 1, filter: 'blur(0px)', scale: 1 } : 'animate'}
          exit={reduce ? undefined : 'exit'}
          style={{
            gridColumn: 1,
            gridRow: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            willChange: 'opacity, filter, transform',
          }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export function ThemeToggle({
  variant = 'rectangle',
  start = 'bottom-up',
  className,
  iconClassName,
  ...rest
}) {
  const { isDark, mounted, toggle } = useThemeToggle({ variant, start })
  const label = mounted && isDark ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={toggle}
      className={className}
      {...rest}
    >
      {mounted ? (
        <SwapIcon value={isDark ? 'dark' : 'light'} className={iconClassName}>
          {isDark ? <Sun strokeWidth={1.75} /> : <Moon strokeWidth={1.75} />}
        </SwapIcon>
      ) : (
        <span className={iconClassName} aria-hidden style={{ display: 'inline-block', width: '1em', height: '1em' }} />
      )}
    </button>
  )
}

export default ThemeToggle
