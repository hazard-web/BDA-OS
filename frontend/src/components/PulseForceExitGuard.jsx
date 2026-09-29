import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isPulseAuxiliaryTab } from '../utils/pulseOpenPage'
import { isCheckedIn } from '../utils/pulseCheckIn'
import {
  cancelPulseUnloadPending,
  forcePulseCheckOutOnly,
  installPulseUnloadWatch,
  markPulseUnloadPending,
  startPulseSessionHeartbeat,
  startScreenLockCheckOutWatch,
  stopScreenLockCheckOutWatch,
} from '../utils/pulseForceExit'

/**
 * Tab close / kill / Ctrl+Shift+T restore → check out + sign out
 * (reload must stay signed in).
 * System sleep / screen lock → check out only (session stays signed in).
 *
 * Pending tab-close exit is consumed in AuthProvider boot (before profile fetch).
 * bfcache restore is handled on pageshow so the timer cannot resume.
 */
export default function PulseForceExitGuard() {
  const { user, loading } = useAuth()
  const { pathname } = useLocation()
  const email = user?.email
  const liveExitRef = useRef(false)
  const auxiliary = isPulseAuxiliaryTab(pathname)

  useEffect(() => {
    installPulseUnloadWatch()
  }, [])

  // Heartbeat + unload markers whenever a token exists (main or service tabs).
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (!localStorage.getItem('token')) return undefined

    startPulseSessionHeartbeat()
    cancelPulseUnloadPending()

    const onUnload = () => {
      markPulseUnloadPending()
    }

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      if (localStorage.getItem('pulsePendingForceExit')) return
      cancelPulseUnloadPending()
    }

    window.addEventListener('pagehide', onUnload)
    window.addEventListener('beforeunload', onUnload)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('pagehide', onUnload)
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [pathname, loading, email])

  useEffect(() => {
    if (!email || loading || auxiliary) return undefined

    const checkOutOnly = () => {
      if (liveExitRef.current) return
      liveExitRef.current = true
      forcePulseCheckOutOnly({ email, reason: 'sleep' })
      window.setTimeout(() => {
        liveExitRef.current = false
      }, 2000)
    }

    const onFreeze = () => checkOutOnly()
    document.addEventListener('freeze', onFreeze)

    // Resume lock watch if already checked in (permission may already be granted).
    if (isCheckedIn(email)) startScreenLockCheckOutWatch(email)

    return () => {
      stopScreenLockCheckOutWatch()
      document.removeEventListener('freeze', onFreeze)
    }
  }, [email, pathname, loading, auxiliary])

  return null
}
