import { useEffect, useRef, useState } from 'react'
import { periodForHour } from './PulseGreetingBanner'
import './pulse-checkin-buddy.css'

const SRC = {
  enter: '/pulse-checkin-buddy-walk.png',
  work: '/pulse-checkin-buddy-work.png',
  bye: '/pulse-checkin-buddy-bye.png',
}

function buddyLine(mode, hour = new Date().getHours()) {
  const period = periodForHour(hour)
  if (mode === 'bye') {
    if (period === 'evening') return { title: 'Good night', note: 'Rest well' }
    if (period === 'afternoon') return { title: 'See you', note: 'Nice work today' }
    return { title: 'Bye for now', note: 'Have a good day' }
  }
  if (period === 'morning') return { title: 'Good morning', note: 'Ready when you are' }
  if (period === 'afternoon') return { title: 'Good afternoon', note: 'Keep going' }
  return { title: 'Good evening', note: 'Almost there' }
}

export default function PulseCheckinBuddy({ checkedIn }) {
  const wasIn = useRef(Boolean(checkedIn))
  const skipEnter = useRef(Boolean(checkedIn))
  const [mode, setMode] = useState(checkedIn ? 'work' : 'hidden')
  const [sayOpen, setSayOpen] = useState(Boolean(checkedIn))
  const [hour] = useState(() => new Date().getHours())

  useEffect(() => {
    if (checkedIn) {
      wasIn.current = true
      setSayOpen(true)
      if (skipEnter.current) {
        skipEnter.current = false
        setMode('work')
        const hide = window.setTimeout(() => setSayOpen(false), 4200)
        return () => window.clearTimeout(hide)
      }
      setMode('enter')
      const toWork = window.setTimeout(() => setMode('work'), 1100)
      const hide = window.setTimeout(() => setSayOpen(false), 5200)
      return () => {
        window.clearTimeout(toWork)
        window.clearTimeout(hide)
      }
    }
    if (!wasIn.current) {
      setMode('hidden')
      setSayOpen(false)
      return undefined
    }
    wasIn.current = false
    setMode('bye')
    setSayOpen(true)
    const timer = window.setTimeout(() => {
      setMode('hidden')
      setSayOpen(false)
    }, 1900)
    return () => window.clearTimeout(timer)
  }, [checkedIn])

  if (mode === 'hidden') return null

  const line = buddyLine(mode, hour)

  return (
    <div className={`pulse-checkin-buddy is-${mode}${sayOpen ? ' has-say' : ' say-out'}`} aria-hidden="true">
      {sayOpen ? (
        <div className={`pulse-checkin-buddy-say is-${mode} is-${periodForHour(hour)}`} role="presentation">
          <strong>{line.title}</strong>
          <span>{line.note}</span>
        </div>
      ) : null}
      <img src={SRC[mode]} alt="" />
    </div>
  )
}
