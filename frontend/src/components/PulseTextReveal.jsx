import { useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'

const EASE_OUT = [0.16, 1, 0.3, 1]
const DEFAULT_SPRING = { stiffness: 140, damping: 26, mass: 1.2 }

/**
 * One tokenizer for both modes: a line becomes the words it is made of, each
 * carrying the whitespace that follows it.
 */
function toWordGroups(line) {
  const chunks = String(line || '').match(/\S+\s*|\s+/g) ?? []
  return chunks.map((chunk) => {
    const text = chunk.replace(/\s+$/, '')
    return { text, trailing: chunk.slice(text.length) }
  })
}

/**
 * Spring / blur text reveal. Adapted from beui TextReveal for Pulse.
 * @see https://beui.dev/components/motion/text-animation
 */
export default function PulseTextReveal({
  text,
  as: Comp = 'span',
  className = '',
  split = 'word',
  stagger = 0.09,
  delay = 0,
  blur = 12,
  yOffset = '40%',
  spring,
  once = true,
  whileInView = false,
  children,
  id,
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once, amount: 0.4 })
  const reduce = useReducedMotion()
  const shouldAnimate = whileInView ? inView : true

  const lines = Array.isArray(text) ? text : [text]
  const s = { ...DEFAULT_SPRING, ...spring }

  let unitIndex = 0
  const lineCounts = new Map()

  return (
    <Comp
      ref={ref}
      id={id}
      className={['pwc-text-reveal', className].filter(Boolean).join(' ')}
    >
      {lines.map((line) => {
        const lineCount = lineCounts.get(line) ?? 0
        lineCounts.set(line, lineCount + 1)
        const lineKey = `${line}-${lineCount}`
        const unitCounts = new Map()

        const renderUnit = (unit) => {
          const d = delay + unitIndex * stagger
          unitIndex += 1
          const unitCount = unitCounts.get(unit) ?? 0
          unitCounts.set(unit, unitCount + 1)
          const unitKey = `${unit}-${unitCount}`
          const initial = reduce
            ? { opacity: 0 }
            : { y: yOffset, opacity: 0, filter: `blur(${blur}px)` }
          const animate = shouldAnimate
            ? reduce
              ? { opacity: 1 }
              : { y: 0, opacity: 1, filter: 'blur(0px)' }
            : initial
          const transition = reduce
            ? { opacity: { duration: 0.25, ease: EASE_OUT, delay: d * 0.3 } }
            : {
                y: { type: 'spring', ...s, delay: d },
                opacity: { duration: 0.7, ease: EASE_OUT, delay: d },
                filter: { duration: 0.9, ease: EASE_OUT, delay: d },
              }
          return (
            <motion.span
              key={unitKey}
              initial={initial}
              animate={animate}
              transition={transition}
              className="pwc-text-reveal-unit"
            >
              {unit}
            </motion.span>
          )
        }

        const groups = toWordGroups(line)
        const groupCounts = new Map()

        return (
          <span key={lineKey} className="pwc-text-reveal-line">
            {groups.map((group) => {
              if (split !== 'char') {
                const wordCount = groupCounts.get(group.text) ?? 0
                groupCounts.set(group.text, wordCount + 1)
                return (
                  <span key={`${group.text}-${wordCount}`} className="pwc-text-reveal-word">
                    {renderUnit(group.text || group.trailing)}
                    {group.text && group.trailing ? group.trailing : null}
                  </span>
                )
              }

              const whole = group.text + group.trailing
              const groupCount = groupCounts.get(whole) ?? 0
              groupCounts.set(whole, groupCount + 1)
              return (
                <span key={`${whole}-${groupCount}`} className="pwc-text-reveal-word">
                  {Array.from(whole).map((char) => renderUnit(char))}
                </span>
              )
            })}
          </span>
        )
      })}
      {children}
    </Comp>
  )
}
