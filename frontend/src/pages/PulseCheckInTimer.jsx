import { useEffect, useState } from 'react'
import {
  formatElapsed,
  getElapsedSeconds,
  PULSE_CHECKIN_EVENT,
  readCheckInAt,
  readCheckInActiveEmail,
} from '../utils/pulseCheckIn'
import './pulse-checkin-timer.css'

/** Standalone popup timer window. */
export default function PulseCheckInTimer() {
  const [email] = useState(() => readCheckInActiveEmail())
  const [checkedInAt, setCheckedInAt] = useState(() => (email ? readCheckInAt(email) : null))
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    document.title = 'BDA OS · Working'
  }, [])

  useEffect(() => {
    const sync = () => {
      const active = readCheckInActiveEmail()
      const at = active ? readCheckInAt(active) : null
      setCheckedInAt(at)
      if (active && at) setElapsed(getElapsedSeconds(active))
      if (!at) {
        window.setTimeout(() => window.close(), 600)
      }
    }

    const onChange = () => sync()
    const onStorage = (event) => {
      if (!event.key || event.key.startsWith('pulseMySpaceCheckIn:') || event.key === 'pulseCheckInActiveEmail') {
        sync()
      }
    }

    window.addEventListener(PULSE_CHECKIN_EVENT, onChange)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(PULSE_CHECKIN_EVENT, onChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    if (!checkedInAt || !email) {
      setElapsed(0)
      return undefined
    }
    const tick = () => {
      const next = getElapsedSeconds(email)
      setElapsed(next)
      document.title = `BDA OS · ${formatElapsed(next)}`
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [checkedInAt, email])

  if (!checkedInAt) {
    return (
      <div className="pulse-checkin-timer pulse-checkin-timer--idle">
        <p>Not checked in</p>
        <button type="button" onClick={() => window.close()}>
          Close
        </button>
      </div>
    )
  }

  return (
    <div className="pulse-checkin-timer" role="timer" aria-live="polite">
      <span className="pulse-checkin-timer-dot" aria-hidden="true" />
      <div className="pulse-checkin-timer-meta">
        <div className="pulse-checkin-timer-label">BDA OS · Working</div>
        <div className="pulse-checkin-timer-time">{formatElapsed(elapsed)}</div>
      </div>
    </div>
  )
}
