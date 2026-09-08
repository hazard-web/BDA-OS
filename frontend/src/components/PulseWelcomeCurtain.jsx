import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { periodForHour } from './PulseGreetingBanner'
import { markWelcomeCurtainSeen, pickWelcomeLine } from '../utils/pulseWelcomeCurtain'
import '../pages/pulse-welcome-curtain.css'

const HOLD_MS = 8000
const PEEK_MS = 560
const PULL_MS = 2000

function firstName(name) {
  const value = String(name || '').trim()
  if (!value || value === 'there') return 'there'
  return value.split(/\s+/)[0]
}

function WelcomeKid({ grabbing = false }) {
  return (
    <svg className={`pwc-mascot${grabbing ? ' is-grabbing' : ''}`} viewBox="0 0 180 176" aria-hidden="true">
      <ellipse cx="58" cy="158" rx="13" ry="7" fill="#c45c26" />
      <ellipse cx="96" cy="158" rx="13" ry="7" fill="#c45c26" />
      <rect x="50" y="130" width="14" height="26" rx="7" fill="#f0c2a0" />
      <rect x="88" y="130" width="14" height="26" rx="7" fill="#f0c2a0" />
      <rect x="44" y="94" width="62" height="46" rx="18" fill="#1A5F4A" />
      <rect x="58" y="102" width="34" height="8" rx="4" fill="#c45c26" />
      <g className="pwc-arms">
        <path d="M48 108c-18-2-28-18-26-32" fill="none" stroke="#f0c2a0" strokeWidth="11" strokeLinecap="round" />
        <path d="M98 104c22-8 46-6 58 8" fill="none" stroke="#f0c2a0" strokeWidth="11" strokeLinecap="round" />
        <circle cx="22" cy="74" r="9" fill="#f3c7a4" />
        <circle cx="160" cy="114" r="10" fill="#f3c7a4" />
        <path d="M154 108c8 2 12 8 10 14" fill="none" stroke="#c45c26" strokeWidth="2.4" strokeLinecap="round" />
      </g>
      <ellipse cx="36" cy="62" rx="7" ry="9" fill="#f3c7a4" />
      <ellipse cx="118" cy="62" rx="7" ry="9" fill="#f3c7a4" />
      <ellipse cx="78" cy="60" rx="44" ry="42" fill="#f3c7a4" />
      <path d="M38 54c2-32 80-34 82 4-18-16-64-16-82-4z" fill="#2c1c14" />
      <ellipse cx="44" cy="40" rx="10" ry="12" fill="#2c1c14" />
      <ellipse cx="78" cy="28" rx="13" ry="15" fill="#2c1c14" />
      <ellipse cx="112" cy="40" rx="10" ry="12" fill="#2c1c14" />
      <path d="M76 18c0-10 12-16 12-16 2 8-2 14-12 16z" fill="#1A5F4A" />
      <ellipse cx="62" cy="64" rx="10" ry="12" fill="#fff8ee" />
      <path d="M88 66c9 0 16 1 20-2" fill="none" stroke="#1a1410" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="64" cy="66" r="4.4" fill="#1a1410" />
      <circle cx="65.6" cy="64" r="1.5" fill="#fff" />
      <path d="M52 50c6-4 14-3 18 1" fill="none" stroke="#2c1c14" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M90 52c6-3 14 0 18 4" fill="none" stroke="#2c1c14" strokeWidth="2.4" strokeLinecap="round" />
      <ellipse cx="46" cy="76" rx="8" ry="4.5" fill="#e58b7a" opacity="0.55" />
      <ellipse cx="110" cy="76" rx="8" ry="4.5" fill="#e58b7a" opacity="0.55" />
      <path d="M64 84c7 10 24 10 30 0" fill="none" stroke="#c45c26" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  )
}

/** Welcome, then kid pulls one velvet sheet from left to right. */
export default function PulseWelcomeCurtain({ name, email, hour = new Date().getHours(), onDone }) {
  const [phase, setPhase] = useState('hold')
  const finished = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const period = periodForHour(hour)
  const line = useMemo(
    () => pickWelcomeLine(email, period, new Date().getDay()),
    [email, period],
  )
  const hello = firstName(name)

  const finish = () => {
    if (finished.current) return
    finished.current = true
    markWelcomeCurtainSeen(email)
    onDoneRef.current?.()
  }

  const beginOpen = () => {
    if (finished.current) return
    setPhase((prev) => {
      if (prev === 'hold') return 'peek'
      if (prev === 'peek') return 'pull'
      return prev
    })
    if (phase === 'pull') finish()
  }

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (phase === 'hold') {
      const timer = window.setTimeout(() => setPhase('peek'), reduce ? 1200 : HOLD_MS)
      return () => window.clearTimeout(timer)
    }
    if (phase === 'peek') {
      const timer = window.setTimeout(() => setPhase('pull'), reduce ? 200 : PEEK_MS)
      return () => window.clearTimeout(timer)
    }
    if (phase === 'pull') {
      const timer = window.setTimeout(finish, reduce ? 400 : PULL_MS)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [phase, email])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        beginOpen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  return createPortal(
    (
      <div
        className={`pwc is-${phase} is-${period}`}
        role={phase === 'hold' ? 'dialog' : 'presentation'}
        aria-modal={phase === 'hold' ? 'true' : undefined}
        aria-labelledby={phase === 'hold' ? 'pwc-title' : undefined}
        aria-describedby={phase === 'hold' ? 'pwc-line' : undefined}
        onClick={beginOpen}
      >
        <div className="pwc-drape" aria-hidden="true">
          <div className="pwc-drape-photo" />
          <div className="pwc-pleats" />
        </div>

        {phase !== 'hold' ? (
          <div className="pwc-kid">
            <WelcomeKid grabbing />
          </div>
        ) : null}

        {phase === 'hold' ? (
          <div className="pwc-stage">
            <WelcomeKid />
            <p className="pwc-kicker">Welcome back</p>
            <h1 id="pwc-title">{hello}</h1>
            <p id="pwc-line" className="pwc-line">
              <span className="pwc-highlight">{line}</span>
            </p>
          </div>
        ) : null}
      </div>
    ),
    document.body,
  )
}
