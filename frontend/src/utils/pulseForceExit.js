import {
  endCheckInOnLogout,
  getElapsedSeconds,
  pulseDayKey,
  readCheckInAt,
  readCheckInActiveEmail,
  readCheckInSession,
  stampCheckInBeforeHide,
  stopCheckIn,
} from './pulseCheckIn'
import { broadcastPulseLogout } from './pulseAuthSync'
import { closeCheckInPip } from './pulseCheckInPip'
import { peekPulseLocation } from './pulseLocation'
import { clearWelcomeCurtainSeen } from './pulseWelcomeCurtain'

/** Set on pagehide; consumed on next boot unless this load is a browser reload. */
const EXIT_FLAG = 'pulsePendingForceExit'
/** Shared across tabs — any live Pulse tab refreshes this. */
const ALIVE_AT = 'pulseSessionAliveAt'
/** Per-tab marker; survives reload; empty on a brand-new tab. */
const TAB_SESSION = 'pulseAuthTabSession'

const HEARTBEAT_MS = 1500
/** New tab after kill: if alive-at is older than this and this tab has no session mark. */
const ALIVE_STALE_MS = 8000

let exiting = false
let unloadWatchInstalled = false
let heartbeatTimer = 0
let heartbeatInstalled = false
/** True after boot has decided whether to honor a pending tab-close exit. */
let bootExitConsumed = false

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

/** True only for an explicit refresh (F5 / Ctrl+R), not Ctrl+Shift+T restore. */
function isBrowserReload() {
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0]
    if (nav?.type) return nav.type === 'reload'
  } catch {
    /* ignore */
  }
  try {
    return typeof performance !== 'undefined' && performance.navigation?.type === 1
  } catch {
    return false
  }
}

function touchSessionAlive() {
  try {
    localStorage.setItem(ALIVE_AT, String(Date.now()))
  } catch {
    /* ignore */
  }
}

function clearSessionAlive() {
  try {
    localStorage.removeItem(ALIVE_AT)
  } catch {
    /* ignore */
  }
}

function ensureTabSession() {
  try {
    if (!sessionStorage.getItem(TAB_SESSION)) {
      sessionStorage.setItem(TAB_SESSION, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
    }
  } catch {
    /* ignore */
  }
}

function hasTabSession() {
  try {
    return Boolean(sessionStorage.getItem(TAB_SESSION))
  } catch {
    return false
  }
}

function clearTabSession() {
  try {
    sessionStorage.removeItem(TAB_SESSION)
  } catch {
    /* ignore */
  }
}

function readAliveAt() {
  try {
    return Number(localStorage.getItem(ALIVE_AT) || 0) || 0
  } catch {
    return 0
  }
}

function isAliveStale() {
  const at = readAliveAt()
  if (!at) return true
  return Date.now() - at > ALIVE_STALE_MS
}

function hasPendingExit() {
  try {
    const pending = localStorage.getItem(EXIT_FLAG)
    if (!pending) return false
    const at = Number(pending) || 0
    if (at && Date.now() - at > 86_400_000) {
      localStorage.removeItem(EXIT_FLAG)
      return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * Call from AuthContext.login / OAuth so a fresh sign-in is never treated as a
 * closed-tab restore (clears exit flag, starts alive + tab session).
 */
export function acknowledgePulseLogin() {
  exiting = false
  bootExitConsumed = true
  try {
    localStorage.removeItem(EXIT_FLAG)
    touchSessionAlive()
    ensureTabSession()
  } catch {
    /* ignore */
  }
  // Fresh sign-in should always get Welcome back (tab-close exit is not logout()).
  clearWelcomeCurtainSeen()
  startPulseSessionHeartbeat()
}

/**
 * pagehide/beforeunload cannot tell reload from tab-close by themselves.
 * Mark a pending exit only for a real unload — not bfcache / soft hide
 * (Chrome Memory Saver + laptop sleep often fire pagehide with persisted=true,
 * which used to look like “logged out after a few minutes idle”).
 * @param {{ persisted?: boolean } | null} [event]
 */
export function markPulseUnloadPending(event = null) {
  try {
    // Entering back-forward cache — tab is still open; do not sign out on resume.
    if (event && event.persisted) return
    localStorage.setItem(EXIT_FLAG, String(Date.now()))
    clearSessionAlive()
  } catch {
    /* ignore */
  }
}

/** Another visible tab is still open — cancel a sibling tab's close flag. */
export function cancelPulseUnloadPending() {
  if (!bootExitConsumed) return
  try {
    localStorage.removeItem(EXIT_FLAG)
  } catch {
    /* ignore */
  }
  touchSessionAlive()
  ensureTabSession()
}

function wasTabDiscardedByBrowser() {
  try {
    return typeof document !== 'undefined' && document.wasDiscarded === true
  } catch {
    return false
  }
}

/**
 * Call once on app boot (before profile fetch when possible).
 * @returns {boolean} true if this visit follows a closed/killed tab and should sign out
 */
export function consumePulseUnloadExit() {
  bootExitConsumed = true
  try {
    const reload = isBrowserReload()
    const token = localStorage.getItem('token')

    // Refresh in the same tab — keep the session.
    if (reload) {
      localStorage.removeItem(EXIT_FLAG)
      ensureTabSession()
      touchSessionAlive()
      return false
    }

    if (!token) {
      localStorage.removeItem(EXIT_FLAG)
      return false
    }

    // Chrome Memory Saver / discarded background tab — keep the session.
    // pagehide still ran (and may have set EXIT_FLAG), but this is idle discard,
    // not an intentional close.
    if (wasTabDiscardedByBrowser()) {
      localStorage.removeItem(EXIT_FLAG)
      ensureTabSession()
      touchSessionAlive()
      return false
    }

    // Closed tab (hard pagehide sets EXIT_FLAG). Soft idle discard / bfcache
    // are filtered above and in markPulseUnloadPending(persisted).
    if (hasPendingExit()) {
      localStorage.removeItem(EXIT_FLAG)
      return true
    }

    // Do not sign out on “stale heartbeat + new tab” alone — Chrome Memory Saver
    // and laptop sleep clear sessionStorage / pause timers and looked like a kill.
    // Intentional close is covered by EXIT_FLAG from non-persisted pagehide.
    ensureTabSession()
    touchSessionAlive()
    return false
  } catch {
    return false
  }
}

/**
 * bfcache restore after idle is not a tab close — keep the session.
 * (Older builds set EXIT_FLAG on persisted pagehide; clear it instead of logging out.)
 */
export function handlePulseBfcacheRestore() {
  if (typeof window === 'undefined') return false
  try {
    localStorage.removeItem(EXIT_FLAG)
    touchSessionAlive()
    ensureTabSession()
  } catch {
    /* ignore */
  }
  return false
}

/** Keep multi-tab sessions alive: a live tab clears another tab's close flag. */
export function installPulseUnloadWatch() {
  if (typeof window === 'undefined' || unloadWatchInstalled) return
  unloadWatchInstalled = true

  const clearIfAlive = () => {
    if (!bootExitConsumed) return
    if (hasPendingExit() && isAliveStale()) return
    if (document.visibilityState === 'visible' && localStorage.getItem('token')) {
      cancelPulseUnloadPending()
    }
  }

  window.addEventListener('storage', (event) => {
    if (event.key === EXIT_FLAG && event.newValue) clearIfAlive()
  })
  document.addEventListener('visibilitychange', clearIfAlive)
  window.addEventListener('focus', clearIfAlive)
}

/** Call while signed in so tab-kill (no unload) is still detected on the next visit. */
export function startPulseSessionHeartbeat() {
  if (typeof window === 'undefined') return
  if (heartbeatInstalled) {
    touchSessionAlive()
    return
  }
  heartbeatInstalled = true
  ensureTabSession()
  touchSessionAlive()

  const beat = () => {
    if (!localStorage.getItem('token')) return
    touchSessionAlive()
  }

  heartbeatTimer = window.setInterval(beat, HEARTBEAT_MS)
  document.addEventListener('visibilitychange', beat)
  window.addEventListener('focus', beat)
}

export function stopPulseSessionHeartbeat() {
  heartbeatInstalled = false
  if (heartbeatTimer) {
    window.clearInterval(heartbeatTimer)
    heartbeatTimer = 0
  }
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
 * Check out (keepalive) only — keeps the session signed in.
 * Used for sleep / screen-lock so people are not bounced to login after a break.
 * @returns {boolean} true if a check-out was attempted
 */
export function forcePulseCheckOutOnly({ email: emailHint, reason = 'sleep' } = {}) {
  if (typeof window === 'undefined') return false

  const token = localStorage.getItem('token')
  if (!token) return false

  const email =
    readCheckInActiveEmail()
    || String(emailHint || '').toLowerCase().trim()
    || emailFromToken(token)
    || null

  const wasCheckedIn = Boolean(email && readCheckInAt(email))
  if (!wasCheckedIn || !email) return false

  const current = readCheckInSession(email)
  const autoOut = reason === 'sleep' || reason === 'shutdown'
  const activeMs = autoOut
    ? Math.max(0, Number(current?.activeMs) || 0)
    : Math.max(0, getElapsedSeconds(email) * 1000)
  postCheckOutKeepalive({ token, email, activeMs })

  try {
    stopCheckIn(email, { reason })
    closeCheckInPip()
  } catch {
    /* ignore */
  }

  return true
}

let screenLockStop = null
let screenLockEmail = null
let lastIdlePermission = null

/** @returns {'granted'|'denied'|'prompt'|'unsupported'|null} */
export function getIdleDetectionPermission() {
  return lastIdlePermission
}

/**
 * Request Idle Detection while we still have a user gesture (check-in click).
 * @returns {Promise<'granted'|'denied'|'unsupported'>}
 */
export async function requestIdleDetectionPermission() {
  if (typeof window === 'undefined' || !('IdleDetector' in window)) {
    lastIdlePermission = 'unsupported'
    return 'unsupported'
  }
  try {
    const request = window.IdleDetector.requestPermission
    const permission = request ? await request() : 'granted'
    lastIdlePermission = permission === 'granted' ? 'granted' : 'denied'
    return lastIdlePermission
  } catch {
    lastIdlePermission = 'denied'
    return 'denied'
  }
}

/** Stop an active screen-lock watcher. */
export function stopScreenLockCheckOutWatch() {
  if (typeof screenLockStop === 'function') {
    screenLockStop()
  }
  screenLockStop = null
  screenLockEmail = null
}

/**
 * Watch Mac screen lock / sleep and check out.
 *
 * Switching tabs or other sites must NOT check out — only real lock/sleep:
 *  1. IdleDetector screenState === 'locked' (needs Idle detection permission)
 *  2. Desktop companion powerMonitor lock-screen
 *  3. Page Lifecycle `freeze` (system sleep)
 */
export function startScreenLockCheckOutWatch(email) {
  const next = String(email || '').toLowerCase().trim()
  if (typeof window === 'undefined' || !next) return () => {}

  if (screenLockStop && screenLockEmail === next) return screenLockStop

  stopScreenLockCheckOutWatch()
  screenLockEmail = next

  let stopped = false
  const ac = new AbortController()
  let pollId = 0
  let desktopPollId = 0
  /** @type {{ screenState?: string } | null} */
  let detector = null

  const checkOut = () => {
    if (stopped) return
    const active = readCheckInActiveEmail() || next
    if (!readCheckInAt(active)) return
    forcePulseCheckOutOnly({ email: active, reason: 'sleep' })
  }

  const maybeCheckOutFromDetector = () => {
    if (stopped || !detector) return
    try {
      if (detector.screenState === 'locked') checkOut()
    } catch {
      /* ignore */
    }
  }

  const pollDesktopLock = async () => {
    if (stopped) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 800)
    try {
      const res = await fetch('http://127.0.0.1:39217/state', {
        method: 'GET',
        signal: controller.signal,
      })
      if (!res.ok) return
      const data = await res.json()
      if (data?.pendingLockCheckout) {
        checkOut()
        try {
          await fetch('http://127.0.0.1:39217/ack-lock-checkout', { method: 'POST' })
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* companion not running */
    } finally {
      window.clearTimeout(timer)
    }
  }

  const onVisibility = () => {
    if (stopped) return
    // Tab/app switch also hides the page — never check out from hide/show alone.
    // Only probe lock signals (IdleDetector / desktop) when visibility changes.
    maybeCheckOutFromDetector()
    void pollDesktopLock()
  }

  const onFreeze = () => {
    const active = readCheckInActiveEmail() || next
    if (readCheckInAt(active)) stampCheckInBeforeHide(active)
    checkOut()
  }

  const startIdleDetector = async () => {
    if (!('IdleDetector' in window)) {
      lastIdlePermission = 'unsupported'
      return
    }
    try {
      if (lastIdlePermission !== 'granted') {
        const permission = await requestIdleDetectionPermission()
        if (stopped || permission !== 'granted') return
      }

      detector = new window.IdleDetector()
      detector.addEventListener('change', maybeCheckOutFromDetector)
      await detector.start({ threshold: 60_000, signal: ac.signal })
      if (stopped) return
      maybeCheckOutFromDetector()
      pollId = window.setInterval(maybeCheckOutFromDetector, 2000)
    } catch {
      lastIdlePermission = lastIdlePermission || 'denied'
      detector = null
    }
  }

  document.addEventListener('visibilitychange', onVisibility)
  document.addEventListener('freeze', onFreeze)
  const onFocus = () => {
    if (document.visibilityState === 'visible') onVisibility()
  }
  window.addEventListener('focus', onFocus)

  void startIdleDetector()
  desktopPollId = window.setInterval(() => {
    void pollDesktopLock()
  }, 1000)
  void pollDesktopLock()

  screenLockStop = () => {
    stopped = true
    ac.abort()
    if (pollId) window.clearInterval(pollId)
    if (desktopPollId) window.clearInterval(desktopPollId)
    document.removeEventListener('visibilitychange', onVisibility)
    document.removeEventListener('freeze', onFreeze)
    window.removeEventListener('focus', onFocus)
    detector = null
  }
  return screenLockStop
}

/**
 * Check out (keepalive) + clear session. Safe during tab-close boot.
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
    localStorage.removeItem(ALIVE_AT)
    clearTabSession()
    clearWelcomeCurtainSeen()
    stopPulseSessionHeartbeat()
    broadcastPulseLogout()
  } catch {
    /* ignore */
  }

  window.setTimeout(() => {
    exiting = false
  }, 1500)

  return true
}

// Catch Ctrl+Shift+T / bfcache restore even before React remounts.
if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) handlePulseBfcacheRestore()
  })
}
