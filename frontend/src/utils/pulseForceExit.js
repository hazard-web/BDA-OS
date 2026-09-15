import {
  endCheckInOnLogout,
  getElapsedSeconds,
  pulseDayKey,
  readCheckInAt,
  readCheckInActiveEmail,
} from './pulseCheckIn'
import { broadcastPulseLogout } from './pulseAuthSync'
import { closeCheckInPip } from './pulseCheckInPip'
import { peekPulseLocation } from './pulseLocation'

/** Hidden this long without freeze/IdleDetector → treat as sleep and force exit. */
export const PULSE_SLEEP_EXIT_MS = 180_000

/** Set on pagehide; cleared if the same tab comes back (reload). */
const EXIT_FLAG = 'pulsePendingForceExit'
/** Survives reload in the same tab; cleared when the tab is closed. */
const CONTINUE_KEY = 'pulseSessionContinue'

let exiting = false
let unloadWatchInstalled = false

function apiRoot() {
  const base = import.meta.env.DEV
    ? ''
    : (import.meta.env.VITE_API_BASE_URL || 'https://dash-api.bdatech.in').replace(/\/+$/, '')
  return base ? `${base}/api` : '/api'
}

function emailFromToken(token) {
  try {
    const payload = JSON.parse(atob(String(token).split('.')[1] || ''))
    return String(payload?.email || '').toLowerCase() || null
  } catch {
    return null
  }
}

/**
 * pagehide/beforeunload cannot tell reload from tab-close.
 * Mark a pending exit in localStorage and a continue flag in sessionStorage.
 * Reload keeps sessionStorage → we cancel the exit on the next boot.
 * Tab close drops sessionStorage → next visit completes the exit.
 */
export function markPulseUnloadPending() {
  try {
    localStorage.setItem(EXIT_FLAG, String(Date.now()))
    sessionStorage.setItem(CONTINUE_KEY, '1')
  } catch {
    /* ignore */
  }
}

/** Another visible tab is still open — cancel a sibling tab's close flag. */
export function cancelPulseUnloadPending() {
  try {
    localStorage.removeItem(EXIT_FLAG)
  } catch {
    /* ignore */
  }
}

/**
 * Call once on app boot while a token may exist.
 * @returns {boolean} true if this visit follows a closed tab and should sign out
 */
export function consumePulseUnloadExit() {
  try {
    if (sessionStorage.getItem(CONTINUE_KEY) === '1') {
      sessionStorage.removeItem(CONTINUE_KEY)
      localStorage.removeItem(EXIT_FLAG)
      return false
    }
    const pending = localStorage.getItem(EXIT_FLAG)
    if (!pending) return false
    localStorage.removeItem(EXIT_FLAG)
    // Ignore stale flags older than 24h
    const at = Number(pending) || 0
    if (at && Date.now() - at > 86_400_000) return false
    return true
  } catch {
    return false
  }
}

/** Keep multi-tab sessions alive: a live tab clears another tab's close flag. */
export function installPulseUnloadWatch() {
  if (typeof window === 'undefined' || unloadWatchInstalled) return
  unloadWatchInstalled = true

  const clearIfAlive = () => {
    if (document.visibilityState === 'visible' && localStorage.getItem('token')) {
      cancelPulseUnloadPending()
    }
  }

  window.addEventListener('storage', (event) => {
    if (event.key === EXIT_FLAG && event.newValue) clearIfAlive()
  })
  document.addEventListener('visibilitychange', clearIfAlive)
  window.addEventListener('focus', clearIfAlive)
  clearIfAlive()
}

function postCheckOutKeepalive({ token, email, activeMs }) {
  const body = {
    email,
    activeMs: Math.max(0, Number(activeMs) || 0),
    date: pulseDayKey(),
    location: peekPulseLocation() || {},
    token,
    accessToken: token,
  }
  const json = JSON.stringify(body)
  const url = `${apiRoot()}/pulse-checkin/check-out`

  try {
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: json,
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* ignore */
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([json], { type: 'application/json' })
      navigator.sendBeacon(url, blob)
    }
  } catch {
    /* ignore */
  }
}

/**
 * Check out (keepalive) + clear session. Safe during sleep/lock or after tab-close boot.
 * @returns {boolean} true if exit ran
 */
export function forcePulseExit({ reason = 'exit', email: emailHint } = {}) {
  if (typeof window === 'undefined') return false
  if (exiting) return false

  const token = localStorage.getItem('token')
  if (!token) return false

  exiting = true

  const email =
    String(emailHint || '').toLowerCase()
    || emailFromToken(token)
    || readCheckInActiveEmail()
    || null

  const wasCheckedIn = Boolean(email && readCheckInAt(email))
  const activeMs = wasCheckedIn ? Math.max(0, getElapsedSeconds(email) * 1000) : 0

  if (wasCheckedIn && email) {
    postCheckOutKeepalive({ token, email, activeMs })
  }

  try {
    endCheckInOnLogout(email)
    closeCheckInPip()
  } catch {
    /* ignore */
  }

  try {
    localStorage.removeItem('token')
    localStorage.removeItem(EXIT_FLAG)
    sessionStorage.removeItem(CONTINUE_KEY)
    broadcastPulseLogout()
  } catch {
    /* ignore */
  }

  window.setTimeout(() => {
    exiting = false
  }, 1500)

  return true
}
