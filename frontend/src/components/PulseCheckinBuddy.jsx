import { useEffect, useRef, useState } from 'react'
import './pulse-checkin-buddy.css'

const SRC = {
  enter: '/pulse-checkin-buddy-walk.png',
  work: '/pulse-checkin-buddy-work.png',
  bye: '/pulse-checkin-buddy-bye.png',
}

export default function PulseCheckinBuddy({ checkedIn }) {
  const wasIn = useRef(Boolean(checkedIn))
  const skipEnter = useRef(Boolean(checkedIn))
  const [mode, setMode] = useState(checkedIn ? 'work' : 'hidden')

  useEffect(() => {
    if (checkedIn) {
      wasIn.current = true
      if (skipEnter.current) {
        skipEnter.current = false
        setMode('work')
        return undefined
      }
      setMode('enter')
      const timer = window.setTimeout(() => setMode('work'), 1100)
      return () => window.clearTimeout(timer)
    }
    if (!wasIn.current) {
      setMode('hidden')
      return undefined
    }
    wasIn.current = false
    setMode('bye')
    const timer = window.setTimeout(() => setMode('hidden'), 1900)
    return () => window.clearTimeout(timer)
  }, [checkedIn])

  if (mode === 'hidden') return null

  return (
    <div className={`pulse-checkin-buddy is-${mode}`} aria-hidden="true">
      <img src={SRC[mode]} alt="" />
      {mode === 'bye' ? <span className="pulse-checkin-buddy-say">Bye bye</span> : null}
    </div>
  )
}
