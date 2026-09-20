import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

const STATUS_REVEAL = {
  'Needs improvement': {
    kind: 'motivate',
    tone: 'low',
    title: 'Needs improvement',
    quote: 'Pick one area this week. Small fixes move the score.',
    cta: 'Got it',
  },
  Developing: {
    kind: 'motivate',
    tone: 'mid',
    title: 'Developing',
    quote: 'You’re building the habit. Close open loops and next month climbs.',
    cta: 'Got it',
  },
  Dependable: {
    kind: 'motivate',
    tone: 'ok',
    title: 'Dependable',
    quote: 'Solid base. One more stretch outcome and Strong is close.',
    cta: 'Got it',
  },
  Strong: {
    kind: 'party',
    tone: 'strong',
    title: 'Strong',
    quote: 'Clean month. Keep the bar and push for Exceptional.',
    cta: 'Nice',
    partyMs: 6000,
  },
  Exceptional: {
    kind: 'legendary',
    tone: 'top',
    title: 'Exceptional',
    quote: 'Top tier. This is the standard others chase.',
    cta: 'Let’s go',
    partyMs: 12000,
  },
}

function getContentHost() {
  return (
    document.querySelector('.pulse-body .pulse-scroll-plain')
    || document.querySelector('.pulse-scroll.pulse-scroll-plain')
    || document.querySelector('.pulse-body')
    || null
  )
}

const SHAPES = ['confetti', 'ribbon', 'diamond', 'spark', 'star', 'coin', 'flake']
const ORIGINS = [
  'bottom-left',
  'bottom-right',
  'top-left',
  'top-right',
  'center',
  'mid-left',
  'mid-right',
]

function buildBits({ count, mode, waves, layer }) {
  const colors = mode === 'legendary'
    ? ['#f59e0b', '#fbbf24', '#fcd34d', '#176b5b', '#34d399', '#e88a2d', '#fff7ed', '#fde68a', '#86efac', '#ffffff']
    : ['#176b5b', '#22c55e', '#34d399', '#38bdf8', '#60a5fa', '#e88a2d', '#a78bfa', '#f472b6', '#fde68a', '#ffffff']

  const fine = layer === 'glitter'

  return Array.from({ length: count }, (_, i) => {
    const origin = ORIGINS[i % ORIGINS.length]
    const wave = Math.floor(i / ORIGINS.length) % waves
    const shape = fine ? (i % 2 === 0 ? 'spark' : 'flake') : SHAPES[i % SHAPES.length]
    const spread = 0.1 + ((i * 19) % 85) / 100
    const rise = (fine ? 200 : 300) + ((i * 29) % (fine ? 280 : 420))
    const drift = (fine ? 100 : 150) + ((i * 37) % (fine ? 240 : 360))
    const base = fine
      ? 2.5 + (i % 4)
      : shape === 'ribbon'
        ? 4 + (i % 5)
        : shape === 'spark'
          ? 3 + (i % 4)
          : 9 + (i % 8) * 2.4
    const angle = ((i * 137.508) % 360) * (Math.PI / 180)
    const flutter = shape === 'ribbon' || shape === 'confetti' ? 28 + (i % 5) * 10 : 0

    let xPeak = 0
    let xEnd = 0
    let yPeak = 0
    let yEnd = 0

    if (origin === 'bottom-left') {
      xPeak = drift * spread
      xEnd = drift * (spread + 0.32) + flutter
      yPeak = -rise
      yEnd = -rise + 110 + ((i * 17) % 160)
    } else if (origin === 'bottom-right') {
      xPeak = -drift * spread
      xEnd = -drift * (spread + 0.32) - flutter
      yPeak = -rise
      yEnd = -rise + 110 + ((i * 17) % 160)
    } else if (origin === 'top-left') {
      xPeak = drift * spread
      xEnd = drift * (spread + 0.34) + flutter
      yPeak = rise * 0.62
      yEnd = rise * 0.95 + ((i * 11) % 120)
    } else if (origin === 'top-right') {
      xPeak = -drift * spread
      xEnd = -drift * (spread + 0.34) - flutter
      yPeak = rise * 0.62
      yEnd = rise * 0.95 + ((i * 11) % 120)
    } else if (origin === 'mid-left') {
      xPeak = drift * 0.85
      xEnd = drift * 1.15 + flutter
      yPeak = -rise * 0.35 + ((i % 2) ? 40 : -60)
      yEnd = yPeak + 140 + ((i * 9) % 90)
    } else if (origin === 'mid-right') {
      xPeak = -drift * 0.85
      xEnd = -drift * 1.15 - flutter
      yPeak = -rise * 0.35 + ((i % 2) ? 40 : -60)
      yEnd = yPeak + 140 + ((i * 9) % 90)
    } else {
      const dist = 100 + ((i * 41) % 300)
      xPeak = Math.cos(angle) * dist * 0.75
      xEnd = Math.cos(angle) * dist * 1.15
      yPeak = Math.sin(angle) * dist * 0.4 - 60
      yEnd = Math.sin(angle) * dist * 0.25 + 130 + ((i * 13) % 100)
    }

    return {
      id: `${layer}-${i}`,
      origin,
      shape,
      layer,
      xPeak,
      xMid: xPeak * 0.45 + (flutter ? (i % 2 ? flutter : -flutter) * 0.4 : 0),
      xEnd,
      yPeak,
      yMid: yPeak * 0.48,
      yEnd,
      delay: wave * 0.42 + ((i % 24) * 0.028) + (fine ? 0.12 : 0),
      duration: fine
        ? 1.5 + (i % 6) * 0.15
        : shape === 'ribbon'
          ? 2.55 + (i % 5) * 0.22
          : 2.05 + ((i % 8) * 0.18),
      size: base,
      rotate: (i * 53) % 360,
      spin: shape === 'ribbon' ? 640 + (i % 4) * 90 : fine ? 400 + (i % 5) * 50 : 300 + (i % 5) * 70,
      color: colors[i % colors.length],
      glow: fine || shape === 'spark' || shape === 'coin' || mode === 'legendary',
    }
  })
}

function ParticleField({ count = 160, mode = 'party', waves = 3 }) {
  const bits = useMemo(() => {
    const main = buildBits({ count, mode, waves, layer: 'main' })
    const glitter = buildBits({
      count: Math.round(count * 0.55),
      mode,
      waves: waves + 1,
      layer: 'glitter',
    })
    return [...main, ...glitter]
  }, [count, mode, waves])

  return (
    <div className={`pulse-perf-reveal-bits is-${mode}`} aria-hidden="true">
      {bits.map((bit) => (
        <motion.span
          key={bit.id}
          className={[
            'pulse-perf-reveal-bit',
            `is-${bit.origin}`,
            `is-${bit.shape}`,
            `is-${bit.layer}`,
            bit.glow ? 'is-glow' : '',
          ].filter(Boolean).join(' ')}
          style={{
            '--bit-color': bit.color,
            width: bit.shape === 'ribbon' ? bit.size * 0.32 : bit.size,
            height: bit.shape === 'ribbon'
              ? bit.size * 3.4
              : bit.shape === 'confetti'
                ? bit.size * 0.52
                : bit.size,
            background: bit.shape === 'star' || bit.shape === 'diamond' || bit.shape === 'flake'
              ? 'transparent'
              : bit.color,
            color: bit.color,
          }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.12, rotate: 0 }}
          animate={{
            x: [0, bit.xMid, bit.xPeak, bit.xEnd],
            y: [0, bit.yMid, bit.yPeak, bit.yEnd],
            opacity: [0, 1, 1, 0],
            scale: [0.12, 1.28, 1.02, 0.5],
            rotate: [0, bit.rotate * 0.3, bit.rotate, bit.rotate + bit.spin],
          }}
          transition={{
            duration: bit.duration,
            delay: bit.delay,
            ease: [0.12, 0.9, 0.2, 1],
            times: [0, 0.18, 0.5, 1],
            repeat: mode === 'legendary' ? 2 : 1,
            repeatDelay: 0.28,
          }}
        />
      ))}
    </div>
  )
}

/**
 * Content-area only reveal:
 * 1) Centered status card
 * 2) After dismiss — party on content for Strong (6s) / Exceptional (12s)
 */
export default function PulsePerformanceReveal({
  status,
  month,
  ready = false,
}) {
  const reveal = STATUS_REVEAL[String(status || '').trim()] || null
  const [host, setHost] = useState(null)
  const [phase, setPhase] = useState('idle') // idle | card | party

  useEffect(() => {
    setHost(getContentHost())
  }, [ready])

  useEffect(() => {
    if (!ready || !reveal) {
      setPhase('idle')
      return undefined
    }
    const timer = window.setTimeout(() => setPhase('card'), 280)
    return () => window.clearTimeout(timer)
  }, [ready, reveal, month, status])

  useEffect(() => {
    if (phase !== 'party' || !reveal?.partyMs) return undefined
    const timer = window.setTimeout(() => setPhase('idle'), reveal.partyMs)
    return () => window.clearTimeout(timer)
  }, [phase, reveal])

  const dismissCard = () => {
    if (reveal?.kind === 'party' || reveal?.kind === 'legendary') {
      setPhase('party')
      return
    }
    setPhase('idle')
  }

  if (!host || !reveal || phase === 'idle') return null

  const isCelebrate = reveal.kind === 'party' || reveal.kind === 'legendary'

  return createPortal(
    <AnimatePresence mode="wait">
      {phase === 'card' ? (
        <motion.div
          key="card"
          className={`pulse-perf-reveal pulse-perf-reveal--content is-${reveal.tone} is-${reveal.kind}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-label={`${reveal.title} performance`}
          onClick={(e) => {
            if (e.target === e.currentTarget) dismissCard()
          }}
        >
          <motion.div
            className="pulse-perf-reveal-card"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 360, damping: 26 }}
          >
            <header className="pulse-perf-reveal-chrome">
              <h4>Performance</h4>
            </header>
            <div className="pulse-perf-reveal-body">
              <strong className="pulse-perf-reveal-title">{reveal.title}</strong>
              <p className="pulse-perf-reveal-quote">{reveal.quote}</p>
              <button type="button" className="pulse-perf-reveal-cta" onClick={dismissCard}>
                {reveal.cta}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}

      {phase === 'party' && isCelebrate ? (
        <motion.div
          key="party"
          className={`pulse-perf-reveal pulse-perf-reveal--content pulse-perf-reveal--party is-${reveal.tone} is-${reveal.kind}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          aria-hidden="true"
        >
          <ParticleField
            count={reveal.kind === 'legendary' ? 220 : 170}
            mode={reveal.kind === 'legendary' ? 'legendary' : 'party'}
            waves={reveal.kind === 'legendary' ? 5 : 4}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>,
    host,
  )
}
