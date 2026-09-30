import { useEffect, useRef, useState } from 'react'
import { periodForHour } from './PulseGreetingBanner'
import './pulse-checkin-buddy.css'

const SRC = {
  enter: '/pulse-checkin-buddy-walk.png',
  work: '/pulse-checkin-buddy-work.png',
  bye: '/pulse-checkin-buddy-bye.png',
}

const CAKE = {
  enter: '/pulse-checkin-buddy-walk-cake.png',
  work: '/pulse-checkin-buddy-work-cake.png',
  bye: '/pulse-checkin-buddy-bye-cake.png',
}

function buddyLine(mode, hour = new Date().getHours(), { birthday = false } = {}) {
  if (birthday) {
    if (mode === 'bye') {
      return { title: 'Happy birthday', note: 'Party hard' }
    }
    return { title: 'Happy birthday', note: 'Take a light day' }
  }
  const period = periodForHour(hour)
  if (mode === 'bye') {
    if (period === 'evening') return { title: 'Day closed', note: 'Rest well' }
    if (period === 'afternoon') return { title: 'Day closed', note: 'Hours are locked' }
    return { title: 'Day closed', note: 'See you tomorrow' }
  }
  if (period === 'morning') return { title: 'Good morning', note: 'The day is yours' }
  if (period === 'afternoon') return { title: 'Good afternoon', note: 'Pick it back up' }
  return { title: 'Good evening', note: 'Still with you' }
}

function BirthdayCap() {
  return (
    <span className="pulse-buddy-cap" aria-hidden="true">
      <svg viewBox="8 4 48 72">
        <defs>
          <linearGradient id="pulseBuddyCapPaper" x1="0" y1="0" x2="1" y2="0.15">
            <stop offset="0" stopColor="#ffb2a4" />
            <stop offset="0.28" stopColor="#f06a58" />
            <stop offset="0.62" stopColor="#d43332" />
            <stop offset="1" stopColor="#7d1822" />
          </linearGradient>
          <linearGradient id="pulseBuddyCapGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff1c4" />
            <stop offset="0.42" stopColor="#f3b133" />
            <stop offset="1" stopColor="#b47412" />
          </linearGradient>
          <radialGradient id="pulseBuddyCapPom" cx="36%" cy="32%" r="68%">
            <stop offset="0" stopColor="#fffdf8" />
            <stop offset="0.55" stopColor="#f3ece2" />
            <stop offset="1" stopColor="#c9bbaa" />
          </radialGradient>
        </defs>
        <path
          d="M32 16 C39 30 48 50 51.5 66.5 C42 70.5 22 70.5 12.5 66.5 C16 50 25 30 32 16 Z"
          fill="url(#pulseBuddyCapPaper)"
        />
        <path d="M30.5 20 C27 36 23 52 21 64" fill="none" stroke="#ffd4c8" strokeWidth="1.7" strokeLinecap="round" opacity="0.72" />
        <path d="M38 28 C41 40 45 54 47.5 64" fill="none" stroke="#6e1218" strokeWidth="1.1" strokeLinecap="round" opacity="0.28" />
        <path d="M22.5 42 C30 46.2 40 45.4 46.2 39.6" fill="none" stroke="url(#pulseBuddyCapGold)" strokeWidth="3.1" strokeLinecap="round" />
        <path d="M18.2 55.5 C28 60.6 42 59.4 50.2 52.2" fill="none" stroke="url(#pulseBuddyCapGold)" strokeWidth="3.3" strokeLinecap="round" />
        <g>
          <circle cx="32" cy="13.2" r="5.4" fill="url(#pulseBuddyCapPom)" />
          <circle cx="27.6" cy="14.6" r="3.5" fill="#fffdf8" />
          <circle cx="36.2" cy="15" r="3.3" fill="#eadfd2" />
          <circle cx="32.4" cy="10" r="3.1" fill="#ffffff" />
          <circle cx="30.2" cy="11.4" r="1.1" fill="#ffffff" opacity="0.9" />
        </g>
      </svg>
    </span>
  )
}

export default function PulseCheckinBuddy({ checkedIn, gesture = 0, birthday = false }) {
  const wasIn = useRef(false)
  const gestureSeen = useRef(gesture)
  const playedEnter = useRef(false)
  const [mode, setMode] = useState('hidden')
  const [sayOpen, setSayOpen] = useState(false)
  const [hour] = useState(() => new Date().getHours())

  useEffect(() => {
    const gestured = gesture !== gestureSeen.current
    if (gestured) gestureSeen.current = gesture

    if (checkedIn) {
      wasIn.current = true
      // Walk in on the check-in gesture even if checkedIn landed a tick earlier
      // (startCheckIn event before setCheckGesture used to skip enter).
      if (gestured && !playedEnter.current) {
        playedEnter.current = true
        setSayOpen(true)
        setMode('enter')
        const toWork = window.setTimeout(() => setMode('work'), 1100)
        const hide = window.setTimeout(() => setSayOpen(false), 5200)
        return () => {
          window.clearTimeout(toWork)
          window.clearTimeout(hide)
        }
      }
      setMode('work')
      if (!gestured) setSayOpen(false)
      return undefined
    }

    if (!wasIn.current) {
      setMode('hidden')
      setSayOpen(false)
      return undefined
    }
    wasIn.current = false
    playedEnter.current = false
    if (!gestured) {
      setMode('hidden')
      setSayOpen(false)
      return undefined
    }
    setMode('bye')
    setSayOpen(true)
    const timer = window.setTimeout(() => {
      setMode('hidden')
      setSayOpen(false)
    }, birthday ? 3600 : 2800)
    return () => window.clearTimeout(timer)
  }, [checkedIn, gesture, birthday])

  if (mode === 'hidden') return null

  const line = buddyLine(mode, hour, { birthday })

  return (
    <div className={`pulse-checkin-buddy is-${mode}${birthday ? ' is-birthday' : ''}${sayOpen ? ' has-say' : ' say-out'}`} aria-hidden="true">
      {sayOpen ? (
        <div className={`pulse-checkin-buddy-say is-${mode} is-${periodForHour(hour)}`} role="presentation">
          <strong>{line.title}</strong>
          <span>{line.note}</span>
        </div>
      ) : null}
      <span className="pulse-buddy-figure">
        {birthday ? <BirthdayCap /> : null}
        <img src={(birthday ? CAKE : SRC)[mode]} alt="" />
      </span>
    </div>
  )
}
