import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isPulseAuxiliaryTab } from '../utils/pulseOpenPage'
import {
  forcePulseExit,
  installPulseReloadGuards,
  isPulseReloadExpected,
  PULSE_SLEEP_EXIT_MS,
} from '../utils/pulseForceExit'

/**
 * Tab close → check out + sign out (must check in again after next login).
 * System sleep / screen lock → same when the page stays open.
 * Refresh is allowed without signing out.
 * Skips auxiliary tabs (timer, notes, opened module tabs).
 */
export default function PulseForceExitGuard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const email = user?.email
  const liveExitRef = useRef(false)

  useEffect(() => {
    installPulseReloadGuards()
  }, [])

  useEffect(() => {
    if (!email) return undefined
    if (isPulseAuxiliaryTab(pathname)) return undefined

    const exitWhileAlive = (reason) => {
      if (liveExitRef.current) return
      liveExitRef.current = true
      const ran = forcePulseExit({ reason, email })
      if (ran) {
        try {
          logout()
        } catch {
          /* ignore */
        }
        navigate('/login', { replace: true })
      }
      window.setTimeout(() => {
        liveExitRef.current = false
      }, 2000)
    }

    const onUnload = (event) => {
      // bfcache freeze — leave session alone
      if (event?.persisted) return
      // Real refresh (gesture / Navigation API) — not prior page load type
      if (isPulseReloadExpected()) return
      forcePulseExit({ reason: 'tab-close', email })
    }

    let hiddenAt = 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      if (!hiddenAt) return
      const gap = Date.now() - hiddenAt
      hiddenAt = 0
      if (gap >= PULSE_SLEEP_EXIT_MS) exitWhileAlive('sleep')
    }

    const onFreeze = () => exitWhileAlive('sleep')

    let idleAbort
    const startIdle = async () => {
      if (!('IdleDetector' in window)) return
      try {
        const request = window.IdleDetector.requestPermission
        const permission = request ? await request() : 'granted'
        if (permission !== 'granted') return
        idleAbort = new AbortController()
        const detector = new window.IdleDetector()
        detector.addEventListener('change', () => {
          if (detector.screenState === 'locked') exitWhileAlive('screen-lock')
        })
        await detector.start({ threshold: 60_000, signal: idleAbort.signal })
      } catch {
        /* unsupported / denied */
      }
    }
    void startIdle()

    window.addEventListener('pagehide', onUnload)
    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('freeze', onFreeze)

    return () => {
      idleAbort?.abort()
      window.removeEventListener('pagehide', onUnload)
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('freeze', onFreeze)
    }
  }, [email, logout, navigate, pathname])

  return null
}
