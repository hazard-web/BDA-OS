import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isPulseAuxiliaryTab } from '../utils/pulseOpenPage'
import {
  cancelPulseUnloadPending,
  consumePulseUnloadExit,
  forcePulseCheckOutOnly,
  forcePulseExit,
  installPulseUnloadWatch,
  markPulseUnloadPending,
} from '../utils/pulseForceExit'

/**
 * Tab close → check out + sign out on the *next* visit (reload must stay signed in).
 * System sleep / screen lock → check out only (session stays signed in).
 * Other tab / minimize → stay checked in.
 */
export default function PulseForceExitGuard() {
  const { user, logout, loading } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const email = user?.email
  const liveExitRef = useRef(false)
  const bootExitDone = useRef(false)

  useEffect(() => {
    installPulseUnloadWatch()
  }, [])

  // After a real tab close, sessionStorage is gone but localStorage still has the pending flag.
  useEffect(() => {
    if (loading || bootExitDone.current) return
    bootExitDone.current = true
    if (!consumePulseUnloadExit()) return
    if (!localStorage.getItem('token') && !email) return
    const ran = forcePulseExit({ reason: 'tab-close', email })
    if (ran) {
      try {
        logout()
      } catch {
        /* ignore */
      }
      navigate('/login', { replace: true })
    }
  }, [loading, email, logout, navigate])

  useEffect(() => {
    if (!email) return undefined
    if (isPulseAuxiliaryTab(pathname)) return undefined

    cancelPulseUnloadPending()

    const checkOutOnly = () => {
      if (liveExitRef.current) return
      liveExitRef.current = true
      forcePulseCheckOutOnly({ email })
      window.setTimeout(() => {
        liveExitRef.current = false
      }, 2000)
    }

    const onUnload = (event) => {
      if (event?.persisted) return
      // Never clear the token here — reload and tab-close both fire this.
      // Reload restores via sessionStorage continue flag; tab-close exits on next boot.
      markPulseUnloadPending()
    }

    const onVisibility = () => {
      // Other tab / minimize: stay checked in. Only clear unload pending on return.
      if (document.visibilityState === 'visible') cancelPulseUnloadPending()
    }

    const onFreeze = () => checkOutOnly()

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
          if (detector.screenState === 'locked') checkOutOnly()
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
  }, [email, pathname])

  return null
}
