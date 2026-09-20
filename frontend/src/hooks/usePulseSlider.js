import { useCallback, useRef, useState } from 'react'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

function snapSliderValue(next, min, max, step) {
  if (!(max > min)) return min
  if (!(step > 0)) return clamp(next, min, max)
  const whole = Math.floor(Number(((max - min) / step).toFixed(6)))
  const lastWhole = Number((min + whole * step).toFixed(6))
  const toGrid = clamp(Math.round((next - min) / step) * step + min, min, lastWhole)
  const snapped =
    lastWhole < max && Math.abs(next - max) <= Math.abs(next - toGrid) ? max : toGrid
  return Number(snapped.toFixed(6))
}

function capturePointer(element, pointerId) {
  try {
    element.setPointerCapture(pointerId)
  } catch {
    /* pointer already gone */
  }
}

function releasePointer(element, pointerId) {
  try {
    if (element.hasPointerCapture?.(pointerId)) {
      element.releasePointerCapture(pointerId)
    }
  } catch {
    /* already dropped */
  }
}

/** Shared value + pointer/keyboard plumbing for Pulse range sliders. */
export function usePulseSlider({
  value,
  defaultValue = 0,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  'aria-label': ariaLabel,
  formatValueText,
}) {
  const trackRef = useRef(null)
  const sliderEl = useRef(null)
  const draggingRef = useRef(false)
  const [internal, setInternal] = useState(defaultValue)
  const [dragging, setDragging] = useState(false)
  const controlled = value !== undefined
  const lo = min
  const hi = max > min ? max : min
  const stride = step > 0 ? step : 1
  const current = clamp(controlled ? value : internal, lo, hi)
  const percent = hi > lo ? ((current - lo) / (hi - lo)) * 100 : 0

  const commit = useCallback(
    (next) => {
      const clean = snapSliderValue(next, lo, hi, stride)
      if (!controlled) setInternal(clean)
      onValueChange?.(clean)
    },
    [controlled, onValueChange, lo, hi, stride],
  )

  const commitFromX = useCallback(
    (clientX) => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
      commit(lo + ratio * (hi - lo))
    },
    [commit, lo, hi],
  )

  const onPointerDown = useCallback(
    (event) => {
      if (disabled) return
      draggingRef.current = true
      setDragging(true)
      capturePointer(event.currentTarget, event.pointerId)
      sliderEl.current?.focus({ preventScroll: true })
      commitFromX(event.clientX)
    },
    [disabled, commitFromX],
  )

  const onPointerMove = useCallback(
    (event) => {
      if (!draggingRef.current || disabled) return
      commitFromX(event.clientX)
    },
    [disabled, commitFromX],
  )

  const endDrag = useCallback((event) => {
    releasePointer(event.currentTarget, event.pointerId)
    draggingRef.current = false
    setDragging(false)
  }, [])

  const onKeyDown = useCallback(
    (event) => {
      if (disabled) return
      const map = {
        ArrowRight: current + stride,
        ArrowUp: current + stride,
        ArrowLeft: current - stride,
        ArrowDown: current - stride,
        PageUp: current + stride * 10,
        PageDown: current - stride * 10,
        Home: lo,
        End: hi,
      }
      if (event.key in map) {
        event.preventDefault()
        commit(map[event.key])
      }
    },
    [disabled, current, stride, lo, hi, commit],
  )

  return {
    current,
    percent,
    dragging,
    min: lo,
    max: hi,
    step: stride,
    trackProps: {
      ref: trackRef,
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onLostPointerCapture: endDrag,
    },
    sliderProps: {
      ref: (node) => {
        sliderEl.current = node
      },
      role: 'slider',
      tabIndex: disabled ? -1 : 0,
      'aria-label': ariaLabel,
      'aria-valuemin': lo,
      'aria-valuemax': hi,
      'aria-valuenow': current,
      'aria-valuetext': formatValueText?.(current),
      'aria-disabled': disabled || undefined,
      onKeyDown,
    },
  }
}
