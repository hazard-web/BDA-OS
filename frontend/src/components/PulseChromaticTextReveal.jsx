import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'

const EASE_IN_OUT = [0.42, 0, 0.58, 1]
const EASE_OUT = [0.16, 1, 0.3, 1]

/** Warm trail that reads on the welcome peak (no purple default). */
const CHROMATIC_PALETTE = ['#f5f0e6', '#E88A2D', '#c4d48a', '#7eb8a8', '#fbbf24']

const TRAIL_HALF_WIDTH = 14
const REVEAL_START = `-${TRAIL_HALF_WIDTH}%`
const REVEAL_FINISH = `${100 + TRAIL_HALF_WIDTH}%`

function composeChromaticGradient(colors, foregroundColor) {
  const palette = colors.length > 0 ? colors : CHROMATIC_PALETTE
  const colorStops = palette.map((color, index) => {
    const offset =
      palette.length === 1
        ? 0
        : -TRAIL_HALF_WIDTH + (index / (palette.length - 1)) * TRAIL_HALF_WIDTH * 2
    const operator = offset < 0 ? '-' : '+'
    const distance = Number(Math.abs(offset).toFixed(2))
    return `${color} calc(var(--chromatic-sweep) ${operator} ${distance}%)`
  })

  return `linear-gradient(90deg, ${foregroundColor} 0%, ${foregroundColor} calc(var(--chromatic-sweep) - ${TRAIL_HALF_WIDTH}%), ${colorStops.join(', ')}, transparent calc(var(--chromatic-sweep) + ${TRAIL_HALF_WIDTH}%), transparent 100%)`
}

/**
 * Chromatic edge sweep over cycling words. Adapted from beui ChromaticTextReveal.
 * @see https://beui.dev/components/motion/text-animation
 */
export default function PulseChromaticTextReveal({
  prefix,
  words,
  colors = CHROMATIC_PALETTE,
  foregroundColor = '#ffffff',
  duration = 1.2,
  delay = 0,
  pauseDuration = 0.8,
  loop = true,
  startOnView = true,
  once = true,
  inViewMargin,
  className = '',
}) {
  const ref = useRef(null)
  const timerRef = useRef(null)
  const [wordIndex, setWordIndex] = useState(0)
  const reduceMotion = useReducedMotion()
  const isInView = useInView(ref, {
    once,
    margin: inViewMargin,
    amount: 0.4,
  })
  const shouldReveal = !startOnView || isInView || reduceMotion
  const backgroundImage = composeChromaticGradient(colors, foregroundColor)
  const hasWords = words.length > 0
  const activeIndex = hasWords ? wordIndex % words.length : 0
  const activeWord = words[activeIndex] ?? ''
  const sizingWords = Array.from(new Set(words))

  const clearPendingWord = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const scheduleNextWord = useCallback(() => {
    clearPendingWord()
    const isLastWord = activeIndex === words.length - 1
    if (reduceMotion || !shouldReveal || words.length < 2 || (isLastWord && !loop)) {
      return
    }

    timerRef.current = window.setTimeout(() => {
      setWordIndex((index) => (index + 1) % words.length)
    }, pauseDuration * 1000)
  }, [
    activeIndex,
    clearPendingWord,
    loop,
    pauseDuration,
    reduceMotion,
    shouldReveal,
    words.length,
  ])

  useEffect(() => clearPendingWord, [clearPendingWord])

  return (
    <span ref={ref} className={['pwc-chromatic', className].filter(Boolean).join(' ')}>
      <span className="pwc-chromatic-prefix">
        {prefix}
        {hasWords ? '\u00A0' : null}
      </span>
      {hasWords ? (
        <span className="pwc-chromatic-grid">
          {sizingWords.map((word) => (
            <span key={word} aria-hidden className="pwc-chromatic-sizer">
              {word}
            </span>
          ))}
          <motion.span
            key={`${activeWord}-${activeIndex}`}
            aria-hidden
            initial={
              reduceMotion
                ? false
                : {
                    opacity: 0.56,
                    filter: 'blur(6px)',
                    y: 5,
                  }
            }
            animate={{
              '--chromatic-sweep': shouldReveal ? REVEAL_FINISH : REVEAL_START,
              opacity: 1,
              filter: 'blur(0px)',
              y: 0,
            }}
            transition={{
              '--chromatic-sweep': reduceMotion
                ? { duration: 0 }
                : { duration, delay, ease: EASE_IN_OUT },
              opacity: reduceMotion
                ? { duration: 0 }
                : { duration: 0.28, ease: EASE_OUT },
              filter: reduceMotion
                ? { duration: 0 }
                : { duration: 0.36, ease: EASE_OUT },
              y: reduceMotion ? { duration: 0 } : { duration: 0.36, ease: EASE_OUT },
            }}
            onAnimationComplete={scheduleNextWord}
            className="pwc-chromatic-active"
            style={{
              '--chromatic-sweep': reduceMotion ? REVEAL_FINISH : REVEAL_START,
              backgroundImage,
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
            }}
          >
            {activeWord}
          </motion.span>
          <span className="pwc-chromatic-sr">{activeWord}</span>
        </span>
      ) : null}
    </span>
  )
}
