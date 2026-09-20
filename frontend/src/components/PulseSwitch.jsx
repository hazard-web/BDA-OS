import { useEffect, useId, useRef, useState } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'

const THUMB_SPRING = { type: 'spring', stiffness: 800, damping: 80, mass: 4 }

/**
 * Spring-driven toggle with press feedback.
 * Adapted from beui Switch for Pulse.
 */
export default function PulseSwitch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  ariaLabel,
  className = '',
}) {
  const id = useId()
  const thumbRef = useRef(null)
  const reduce = useReducedMotion()
  const [isPressed, setIsPressed] = useState(false)
  const [isPointer, setIsPointer] = useState(false)

  useEffect(() => {
    if (!thumbRef.current || reduce) return
    if (disabled && isPressed) {
      animate(thumbRef.current, { x: [0, -2, 2, -1, 0] }, { delay: 0.2, duration: 0.6 })
    }
  }, [disabled, isPressed, reduce])

  const squish = !disabled && isPointer && isPressed && !reduce

  return (
    <div className={['pulse-switch', disabled ? 'is-disabled' : '', className].filter(Boolean).join(' ')}>
      <motion.button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel || label}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onCheckedChange(!checked)
        }}
        onPointerDown={(e) => {
          setIsPressed(true)
          setIsPointer(e.pointerType === 'mouse' || e.pointerType === 'pen' || e.pointerType === 'touch')
        }}
        onPointerUp={() => setIsPressed(false)}
        onPointerLeave={() => setIsPressed(false)}
        initial={false}
        data-state={checked ? 'checked' : 'unchecked'}
        className={[
          'pulse-switch-track',
          checked ? 'is-on' : 'is-off',
        ].join(' ')}
      >
        <motion.div
          ref={thumbRef}
          layout
          transition={reduce ? { duration: 0 } : THUMB_SPRING}
          animate={{ scale: squish ? 0.9 : 1 }}
          className={[
            'pulse-switch-thumb',
            squish ? (checked ? 'is-squish-end' : 'is-squish-start') : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      </motion.button>
      {label ? (
        <label htmlFor={id} className="pulse-switch-label">
          {label}
        </label>
      ) : null}
    </div>
  )
}
