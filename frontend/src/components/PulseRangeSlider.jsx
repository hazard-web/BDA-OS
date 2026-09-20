import { useEffect, useLayoutEffect, useState } from 'react'
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'framer-motion'
import { usePulseSlider } from '../hooks/usePulseSlider'

const SPRING_GLIDE = { stiffness: 700, damping: 50, mass: 0.5 }
const SPRING_BOUNCY = { type: 'spring', stiffness: 500, damping: 14, mass: 0.7 }

/** Fill colors by score step — 25 / 50 / 75 / 100. */
const SCORE_FILL = {
  0: '#c5d0cb',
  25: '#c45c3e',
  50: '#e88a2d',
  75: '#2b7cd3',
  100: '#465a27',
}

function fillForScore(value) {
  const n = Number(value) || 0
  if (n >= 100) return SCORE_FILL[100]
  if (n >= 75) return SCORE_FILL[75]
  if (n >= 50) return SCORE_FILL[50]
  if (n >= 25) return SCORE_FILL[25]
  return SCORE_FILL[0]
}

function toneForScore(value) {
  const n = Number(value) || 0
  if (n >= 100) return 'is-100'
  if (n >= 75) return 'is-75'
  if (n >= 50) return 'is-50'
  if (n >= 25) return 'is-25'
  return 'is-0'
}

/**
 * Tick-dot range slider with a vertical-bar thumb that bounces on each step.
 * Fill color steps with the value (25 / 50 / 75 / 100).
 */
export default function PulseRangeSlider({
  showTicks = true,
  className = '',
  value,
  defaultValue = 0,
  onValueChange,
  min = 0,
  max = 100,
  step = 25,
  disabled = false,
  'aria-label': ariaLabel,
  formatValueText,
}) {
  const reduce = useReducedMotion()
  const { current, percent, dragging, min: lo, max: hi, step: stride, trackProps, sliderProps } = usePulseSlider({
    value,
    defaultValue,
    onValueChange,
    min,
    max,
    step,
    disabled,
    'aria-label': ariaLabel,
    formatValueText,
  })
  const [trackWidth, setTrackWidth] = useState(292)
  const fillColor = fillForScore(current)
  const tone = toneForScore(current)

  useLayoutEffect(() => {
    const track = trackProps.ref.current
    if (!track) return undefined
    const measure = () => {
      const width = track.getBoundingClientRect().width
      if (width > 0) setTrackWidth(width)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => observer.disconnect()
  }, [trackProps.ref])

  const target = useMotionValue(percent)
  useEffect(() => {
    target.set(percent)
  }, [percent, target])
  const smooth = useSpring(target, SPRING_GLIDE)
  const pos = reduce ? target : smooth
  const thumbX = useTransform(pos, (p) => 8 + Math.max(0, trackWidth - 20) * (p / 100))
  const fillX = useTransform(pos, (p) =>
    p >= 100 ? '0%' : `calc(${p - 100}% + ${14 - 0.16 * p}px)`,
  )

  const steps = Math.floor(Number(((hi - lo) / stride).toFixed(6)))
  const ticks =
    showTicks && steps > 0 && steps <= 50
      ? Array.from({ length: steps + 1 }, (_, i) => Number((lo + i * stride).toFixed(6)))
      : []

  return (
    <div
      {...trackProps}
      className={[
        'pulse-range-slider',
        tone,
        disabled ? 'is-disabled' : '',
        dragging ? 'is-dragging' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="pulse-range-slider-clip" aria-hidden="true">
        <motion.div
          className="pulse-range-slider-fill"
          style={{ x: fillX }}
          animate={{ backgroundColor: fillColor }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
        />
      </div>

      <div className="pulse-range-slider-ticks" aria-hidden="true">
        {ticks.map((t) => {
          const tp = hi > lo ? ((t - lo) / (hi - lo)) * 100 : 0
          return (
            <span
              key={t}
              className={`pulse-range-slider-tick${t <= current ? ' is-on' : ''}`}
              style={{ left: `${tp}%` }}
            />
          )
        })}
      </div>

      <motion.div
        {...sliderProps}
        animate={reduce ? undefined : { scaleY: dragging ? 1.35 : 1 }}
        transition={SPRING_BOUNCY}
        className="pulse-range-slider-thumb"
        style={{ x: thumbX, y: '-50%' }}
      />
    </div>
  )
}
