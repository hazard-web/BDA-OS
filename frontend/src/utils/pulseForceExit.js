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

const RELOAD_EXPECT_KEY = 'pulseExpectReload'

let exiting = false
let reloadGuardsInstalled = false

function apiRoot() {
  const base = import.meta.env.DEV
    ? ''
    : (import.meta.env.VITE_API_BASE_URL || 'https://people-os-api-uat.onrender.com').replace(/\/+$/, '')
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

/** Mark the next unload as a refresh so we do not sign out / check out. */
export function markPulseReloadExpected() {
  try {
    sessionStorage.setItem(RELOAD_EXPECT_KEY, '1')
  } catch {
    /* ignore */
  }
  window.setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOAD_EXPECT_KEY)
    } catch {
      /* ignore */
    }
  }, 2500)
}

export function isPulseReloadExpected() {
  try {
    return sessionStorage.getItem(RELOAD_EXPECT_KEY) === '1'
  } catch {
    return false
  }
}

export function clearPulseReloadExpected() {
  try {
    sessionStorage.removeItem(RELOAD_EXPECT_KEY)
  } catch {
    /* ignore */
  }
}

/** Listen for refresh gestures so tab-close still signs out after a prior reload. */
export function installPulseReloadGuards() {
  if (typeof window === 'undefined' || reloadGuardsInstalled) return
  reloadGuardsInstalled = true

  window.addEventListener('keydown', (event) => {
    if (event.key === 'F5') markPulseReloadExpected()
    if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'r') {
      markPulseReloadExpected()
    }
  })

  try {
    if (window.navigation?.addEventListener) {
      window.navigation.addEventListener('navigate', (event) => {
        if (event.navigationType === 'reload') markPulseReloadExpected()
      })
    }
  } catch {
    /* ignore */
  }

  window.addEventListener('pageshow', () => {
    clearPulseReloadExpected()
  })
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
 * Check out (keepalive) + clear session. Safe to call during pagehide / freeze.
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

  // Fire server check-out while the token is still valid (tab may die immediately).
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
    broadcastPulseLogout()
  } catch {
    /* ignore */
  }

  // Allow a later login in the same tab (sleep / lock path).
  window.setTimeout(() => {
    exiting = false
  }, 1500)

  return true
}
