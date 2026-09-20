import { Component, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import gsap from 'gsap'
import { periodForHour } from './PulseGreetingBanner'
import { markWelcomeCurtainSeen, pickWelcomeLine } from '../utils/pulseWelcomeCurtain'
import PulseChromaticTextReveal from './PulseChromaticTextReveal'
import PulseTextReveal from './PulseTextReveal'
import '../pages/pulse-welcome-curtain.css'

function displayName(name) {
  const value = String(name || '').trim()
  return value && value !== 'there' ? value : 'there'
}

/** If the curtain throws, skip it so Pulse still loads. */
class WelcomeSafe extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    try {
      markWelcomeCurtainSeen(this.props.email)
    } catch {
      /* ignore */
    }
    this.props.onDone?.()
  }

  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}

function WelcomeCurtainInner({ name, email, hour = new Date().getHours(), onDone }) {
  const rootRef = useRef(null)
  const tlRef = useRef(null)
  const finished = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  const period = periodForHour(hour)
  const line = useMemo(() => {
    try {
      return pickWelcomeLine(email, period, new Date().getDay())
    } catch {
      return 'Another day, another step towards your goals. Lets make it count!'
    }
  }, [email, period])
  const hello = displayName(name)
  const dateLabel = format(new Date(), 'EEE, d MMM yyyy')

  const finish = () => {
    if (finished.current) return
    finished.current = true
    try {
      markWelcomeCurtainSeen(email)
    } catch {
      /* ignore */
    }
    onDoneRef.current?.()
  }

  /** Jump straight to slide-open — no peek / tween lag. */
  const openCurtain = () => {
    const tl = tlRef.current
    if (!tl || finished.current) return
    try {
      const pullAt = tl.labels.pull ?? 0
      if (tl.time() < pullAt) {
        tl.time(pullAt)
        return
      }
    } catch {
      /* fall through */
    }
    finish()
  }

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const hold = reduce ? 1 : 8.5
    const pullDur = reduce ? 0.4 : 1.1

    const drape = root.querySelector('.pwc-drape')
    const copy = root.querySelector('.pwc-copy')
    const dateEl = root.querySelector('.pwc-date')
    const buddy = root.querySelector('.pwc-buddy')

    if (!drape || !buddy) {
      finish()
      return undefined
    }

    gsap.set(drape, { xPercent: 0 })
    gsap.set(buddy, { x: 0 })

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ onComplete: finish })
      tlRef.current = tl

      tl.to({}, { duration: hold })

      tl.addLabel('pull')
      tl.call(() => {
        root.classList.add('is-pull')
        root.classList.remove('is-hold')
        // Reveal the dashboard already mounted underneath — no green hold plate.
        root.style.backgroundColor = 'transparent'
      })

      const fadeTargets = [copy, dateEl].filter(Boolean)
      if (fadeTargets.length) {
        tl.to(fadeTargets, {
          autoAlpha: 0,
          duration: 0.18,
          ease: 'power1.out',
        }, 'pull')
      }

      tl.to(drape, {
        xPercent: 110,
        duration: pullDur,
        ease: 'power2.inOut',
      }, 'pull')

      tl.to(buddy, {
        x: () => Math.round(window.innerWidth * 0.55),
        duration: pullDur,
        ease: 'power2.inOut',
      }, 'pull')

      tl.to(root, {
        autoAlpha: 0,
        duration: 0.12,
        ease: 'power1.in',
      })
    }, root)

    return () => {
      tlRef.current = null
      try {
        ctx.revert()
      } catch {
        /* ignore */
      }
    }
  }, [email])

  useEffect(() => {
    const held = new Set()

    const onKeyDown = (event) => {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        held.add(event.key)
      }
      const escDown = held.has('Escape')
      const openDown = held.has('Enter') || held.has(' ')
      if (escDown && openDown) {
        event.preventDefault()
        openCurtain()
        return
      }
      if ((event.key === 'Enter' || event.key === ' ') && !escDown) {
        event.preventDefault()
        openCurtain()
      }
    }

    const onKeyUp = (event) => {
      held.delete(event.key)
      if (event.key === 'Meta' || event.key === 'Control' || event.key === 'Alt') {
        held.clear()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', () => held.clear())
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  if (typeof document === 'undefined' || !document.body) return null

  return createPortal(
    (
      <div
        ref={rootRef}
        className={`pwc is-hold is-${period}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwc-title"
        aria-describedby="pwc-line"
        onClick={openCurtain}
      >
        <div className="pwc-drape" aria-hidden="true">
          <div className="pwc-drape-fabric">
            <div className="pwc-drape-photo" />
            <div className="pwc-veil" />
          </div>
        </div>

        <div className="pwc-stage">
          <time className="pwc-date" dateTime={format(new Date(), 'yyyy-MM-dd')}>
            {dateLabel}
          </time>

          <div className="pwc-hero">
            <img
              className="pwc-buddy"
              src="/pulse-welcome-buddy.png"
              alt=""
              draggable={false}
            />
            <div className="pwc-copy">
              <h1 id="pwc-title" className="pwc-title">
                <PulseChromaticTextReveal
                  className="pwc-title-chromatic"
                  prefix="Welcome back,"
                  words={[hello]}
                  colors={['#fff8ee', '#E88A2D', '#c4d48a', '#9bc4b8', '#f5d78e']}
                  foregroundColor="#ffffff"
                  duration={1.2}
                  delay={0.12}
                  loop={false}
                  startOnView={false}
                  once
                />
              </h1>
              <p id="pwc-line" className="pwc-line">
                <span className="pwc-highlight">
                  <PulseTextReveal
                    text={line}
                    className="pwc-line-reveal"
                    split="word"
                    stagger={0.045}
                    delay={0.55}
                    blur={10}
                    yOffset="32%"
                  />
                </span>
              </p>
              <button
                type="button"
                className="pwc-cta"
                onClick={(event) => {
                  event.stopPropagation()
                  openCurtain()
                }}
              >
                <span className="pwc-cta-arrow" aria-hidden="true">→</span>
                Enter Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    ),
    document.body,
  )
}

export default function PulseWelcomeCurtain(props) {
  return (
    <WelcomeSafe email={props.email} onDone={props.onDone}>
      <WelcomeCurtainInner {...props} />
    </WelcomeSafe>
  )
}
