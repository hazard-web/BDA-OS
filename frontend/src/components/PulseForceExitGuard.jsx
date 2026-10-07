import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isPulseAuxiliaryTab } from '../utils/pulseOpenPage'
import { isCheckedIn, PULSE_CHECKIN_EVENT } from '../utils/pulseCheckIn'
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
 * Tab close / kill / shut down → check out (+ sign out on hard exit).
 * Laptop sleep (`freeze`) → check out immediately (stay signed in).
 * Screen lock alone → pause only (see startScreenLockCheckOutWatch).
 *
 * Do not tear down the screen-lock watcher on route changes or loading flickers —
 * restarting IdleDetector without a user gesture silently drops permission.
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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (!localStorage.getItem('token')) return undefined

    startPulseSessionHeartbeat()
    cancelPulseUnloadPending()

    const onPageHide = (event) => {
      markPulseUnloadPending(event)
    }

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      cancelPulseUnloadPending()
    }

    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [pathname, loading, email])

  // Sleep / suspend → check out immediately (backup if screen-lock watcher missed it).
  useEffect(() => {
    if (!email || loading || auxiliary) return undefined

    const checkOutForSleep = () => {
      if (liveExitRef.current) return
      if (!isCheckedIn(email)) return
      liveExitRef.current = true
      forcePulseCheckOutOnly({ email, reason: 'sleep' })
      window.setTimeout(() => {
        liveExitRef.current = false
      }, 2000)
    }

    const onFreeze = () => checkOutForSleep()
    document.addEventListener('freeze', onFreeze)

    return () => {
      document.removeEventListener('freeze', onFreeze)
    }
  }, [email, pathname, loading, auxiliary])

  // Screen-lock watcher — start on check-in, stop only on check-out / logout.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (!email || loading) return undefined

    if (isCheckedIn(email)) startScreenLockCheckOutWatch(email)

    const onCheckIn = (event) => {
      const detailEmail = String(event?.detail?.email || '').toLowerCase()
      if (detailEmail && detailEmail !== String(email).toLowerCase()) return
      if (event?.detail?.checkedInAt) startScreenLockCheckOutWatch(email)
      else stopScreenLockCheckOutWatch()
    }

    window.addEventListener(PULSE_CHECKIN_EVENT, onCheckIn)
    return () => {
      window.removeEventListener(PULSE_CHECKIN_EVENT, onCheckIn)
      // Keep watcher alive across React remounts while still checked in.
      // Only stop when this user signs out (email effect tears down) or checks out.
    }
  }, [email, loading])

  useEffect(() => () => {
    // True unmount / account switch — release the detector.
    stopScreenLockCheckOutWatch()
  }, [email])

  return null
}
