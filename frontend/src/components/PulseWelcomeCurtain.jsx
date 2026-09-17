import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import gsap from 'gsap'
import { periodForHour } from './PulseGreetingBanner'
import { markWelcomeCurtainSeen, pickWelcomeLine } from '../utils/pulseWelcomeCurtain'
import '../pages/pulse-welcome-curtain.css'

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

/** Welcome curtain — GSAP timeline for hold → peek → left-to-right roll. */
export default function PulseWelcomeCurtain({ name, email, hour = new Date().getHours(), onDone }) {
  const rootRef = useRef(null)
  const tlRef = useRef(null)
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

  const advance = () => {
    const tl = tlRef.current
    if (!tl || finished.current) return
    const t = tl.time()
    const peekAt = tl.labels.peek ?? 0
    const pullAt = tl.labels.pull ?? 0
    if (t < peekAt) {
      tl.tweenTo(peekAt, { duration: 0.2 })
      return
    }
    if (t < pullAt) {
      tl.tweenTo(pullAt, { duration: 0.15 })
      return
    }
    finish()
  }

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const hold = reduce ? 1 : 7
    const peekDur = reduce ? 0.2 : 0.55
    const pullDur = reduce ? 0.35 : 1.85

    const drape = root.querySelector('.pwc-drape')
    const fabric = root.querySelector('.pwc-drape-fabric')
    const photo = root.querySelector('.pwc-drape-photo')
    const roll = root.querySelector('.pwc-roll')
    const gather = root.querySelector('.pwc-gather')
    const edge = root.querySelector('.pwc-edge')
    const stage = root.querySelector('.pwc-stage')
    const stageBits = root.querySelectorAll('.pwc-stage-item')
    const kid = root.querySelector('.pwc-kid')
    const mascot = root.querySelector('.pwc-kid .pwc-mascot')
    const arms = root.querySelector('.pwc-kid .pwc-arms')
    const hint = root.querySelector('.pwc-hint')

    gsap.set(kid, { autoAlpha: 0, xPercent: -40, y: '8vh', scale: 0.86, left: 0 })
    gsap.set(roll, { autoAlpha: 0, scaleX: 0.45 })
    gsap.set([gather, edge], { autoAlpha: 0 })
    gsap.set(drape, { xPercent: 0, forceClearProps: false })
    gsap.set(fabric, { scaleX: 1, transformOrigin: 'left center' })
    gsap.set(stageBits, { autoAlpha: 0, y: 14 })

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: 'power2.out' },
        onComplete: finish,
      })
      tlRef.current = tl

      // Enter
      tl.to(stageBits, {
        autoAlpha: 1,
        y: 0,
        duration: 0.55,
        stagger: 0.09,
        ease: 'power3.out',
      }, 0)

      if (photo && !reduce) {
        tl.fromTo(photo, { scale: 1.04 }, {
          scale: 1.08,
          duration: hold + peekDur + 0.4,
          ease: 'none',
        }, 0)
      }

      if (hint && !reduce) {
        tl.to(hint, {
          opacity: 0.75,
          duration: 1.2,
          yoyo: true,
          repeat: Math.max(1, Math.floor(hold / 1.2) - 1),
          ease: 'sine.inOut',
        }, 1.1)
      }

      // Hold beat
      tl.to({}, { duration: hold })

      // Peek
      tl.addLabel('peek')
      tl.call(() => {
        root.classList.add('is-peek')
        root.classList.remove('is-hold')
      })
      tl.to(stage, { autoAlpha: 0, y: -10, duration: 0.35, ease: 'power2.in' }, 'peek')
      tl.to(kid, {
        autoAlpha: 1,
        xPercent: 0,
        y: '2vh',
        scale: 1,
        duration: peekDur,
        ease: 'back.out(1.4)',
      }, 'peek')
      tl.to(drape, { xPercent: 3.2, duration: peekDur, ease: 'power2.out' }, 'peek')
      tl.to(roll, { autoAlpha: 1, scaleX: 1, duration: peekDur * 0.85, ease: 'back.out(1.6)' }, 'peek')
      tl.to([gather, edge], { autoAlpha: 1, duration: 0.3 }, 'peek+=0.1')

      // Pull — left → right over My Space (transparent shell)
      tl.addLabel('pull')
      tl.call(() => {
        root.classList.add('is-pull')
        root.classList.remove('is-peek')
        root.style.backgroundColor = 'transparent'
      })

      tl.to(drape, {
        xPercent: 110,
        duration: pullDur,
        ease: 'power3.inOut',
      }, 'pull')
      tl.to(fabric, {
        scaleX: 0.9,
        duration: pullDur,
        ease: 'power3.inOut',
      }, 'pull')
      tl.to(gather, {
        width: 200,
        duration: pullDur * 0.45,
        ease: 'power2.out',
      }, 'pull')
      tl.to(kid, {
        left: '100%',
        x: 16,
        duration: pullDur,
        ease: 'power3.inOut',
      }, 'pull')

      if (mascot && !reduce) {
        tl.to(mascot, {
          rotation: 7,
          y: -6,
          duration: 0.34,
          yoyo: true,
          repeat: Math.floor(pullDur / 0.34) - 1,
          ease: 'sine.inOut',
          transformOrigin: '70% 80%',
        }, 'pull')
      }
      if (arms && !reduce) {
        tl.to(arms, {
          rotation: 10,
          duration: 0.34,
          yoyo: true,
          repeat: Math.floor(pullDur / 0.34) - 1,
          ease: 'sine.inOut',
          transformOrigin: '80px 108px',
        }, 'pull')
      }

      tl.to(root, { autoAlpha: 0, duration: 0.2, ease: 'power1.in' })
    }, root)

    return () => {
      tlRef.current = null
      ctx.revert()
    }
  }, [email])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        advance()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return createPortal(
    (
      <div
        ref={rootRef}
        className={`pwc is-hold is-${period}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwc-title"
        aria-describedby="pwc-line"
        onClick={advance}
      >
        <div className="pwc-drape" aria-hidden="true">
          <div className="pwc-drape-fabric">
            <div className="pwc-drape-photo" />
            <div className="pwc-pleats" />
            <div className="pwc-gather" />
            <div className="pwc-sheen" />
          </div>
          <div className="pwc-roll">
            <span className="pwc-roll-core" />
            <span className="pwc-roll-shine" />
          </div>
          <div className="pwc-edge" />
        </div>

        <div className="pwc-kid" aria-hidden="true">
          <WelcomeKid grabbing />
        </div>

        <div className="pwc-stage">
          <div className="pwc-stage-item pwc-stage-mascot">
            <WelcomeKid />
          </div>
          <p className="pwc-kicker pwc-stage-item">Welcome back</p>
          <h1 id="pwc-title" className="pwc-stage-item">{hello}</h1>
          <p id="pwc-line" className="pwc-line pwc-stage-item">
            <span className="pwc-highlight">{line}</span>
          </p>
          <p className="pwc-hint pwc-stage-item">Tap anywhere to continue</p>
        </div>
      </div>
    ),
    document.body,
  )
}
