import { useEffect, useRef, useState } from 'react'

function reduceMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function safeSeconds(value) {
  return Math.max(0, Math.floor(Number(value) || 0))
}

/**
 * Visual reply for a real check-in or check-out press.
 * Hydration and the live tick stay still. `gesture` increments only on that press.
 */
export function useCheckInReply(checkedInAt, elapsed, gesture = 0) {
  const elapsedRef = useRef(elapsed)
  elapsedRef.current = elapsed
  const primed = useRef(false)
  const wasIn = useRef(false)
  const seenGesture = useRef(gesture)
  const rising = useRef(false)
  const turn = useRef(null)
  const nowIn = Boolean(checkedInAt)
  if (turn.current == null) {
    turn.current = { gesture, in: nowIn }
  } else if (gesture !== turn.current.gesture && nowIn !== turn.current.in) {
    rising.current = nowIn && safeSeconds(elapsed) > 0 && !reduceMotion()
    turn.current = { gesture, in: nowIn }
  } else if (gesture !== turn.current.gesture || nowIn !== turn.current.in) {
    turn.current = { gesture, in: nowIn }
  }
  const [shown, setShown] = useState(() => safeSeconds(elapsed))
  const [settling, setSettling] = useState(false)
  const [waking, setWaking] = useState(false)
  const [dayClosed, setDayClosed] = useState(false)

  useEffect(() => {
    if (rising.current) return
    setShown(safeSeconds(elapsed))
  }, [elapsed])

  useEffect(() => {
    const nowIn = Boolean(checkedInAt)
    const secs = safeSeconds(elapsedRef.current)
    if (!primed.current) {
      primed.current = true
      wasIn.current = nowIn
      seenGesture.current = gesture
      setShown(secs)
      return undefined
    }

    const gestured = gesture !== seenGesture.current
    seenGesture.current = gesture
    const turned = gestured && nowIn !== wasIn.current
    wasIn.current = nowIn
    if (!turned) return undefined

    if (nowIn) {
      setDayClosed(false)
      setSettling(true)
      setWaking(true)
      const settleTimer = window.setTimeout(() => setSettling(false), 480)
      const wakeTimer = window.setTimeout(() => setWaking(false), 700)
      if (reduceMotion() || secs <= 0) {
        rising.current = false
        setShown(secs)
        return () => {
          window.clearTimeout(settleTimer)
          window.clearTimeout(wakeTimer)
        }
      }
      rising.current = true
      const start = performance.now()
      const duration = Math.min(980, 480 + Math.min(secs, 10 * 3600) / 50)
      let raf = 0
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration)
        const eased = 1 - (1 - t) ** 3
        setShown(Math.round(secs * eased))
        if (t < 1) {
          raf = requestAnimationFrame(tick)
          return
        }
        rising.current = false
        setShown(secs)
      }
      setShown(0)
      raf = requestAnimationFrame(tick)
      return () => {
        window.clearTimeout(settleTimer)
        window.clearTimeout(wakeTimer)
        cancelAnimationFrame(raf)
        rising.current = false
      }
    }

    rising.current = false
    setShown(secs)
    setSettling(true)
    setDayClosed(true)
    const settleTimer = window.setTimeout(() => setSettling(false), 480)
    const closeTimer = window.setTimeout(() => setDayClosed(false), 3200)
    return () => {
      window.clearTimeout(settleTimer)
      window.clearTimeout(closeTimer)
    }
  }, [checkedInAt, gesture])

  return { shown, settling, waking, dayClosed }
}
