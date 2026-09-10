import { format } from 'date-fns'
import { syncPulseDesktopCheckIn } from './pulseDesktopBridge'
import { syncPulseCheckInEvent, fetchPulseWorkDayToday } from './pulseCheckInApi'

export const PULSE_CHECKIN_EVENT = 'pulse-checkin-change'
export const PULSE_CHECKIN_POS_KEY = 'pulseCheckInFloatPos'
export const PULSE_CHECKIN_ACTIVE_EMAIL_KEY = 'pulseCheckInActiveEmail'

/** Gaps longer than this mean JS was frozen (sleep / crash / killed tab) — not counted.
 *  Must be above typical background-tab timer throttling (~1 min) so switching apps is fine. */
export const PULSE_IDLE_GAP_MS = 180_000

/** Standard workday target used for admin "target reached" logging. */
export const PULSE_TARGET_HOURS = 9

/** Match server daily cap so the UI cannot run past 14h locally. */
export const PULSE_DAILY_CAP_MS = 14 * 3_600_000

function scheduleIdle(fn) {
  try {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => {
        try {
          fn()
        } catch {
          /* ignore */
        }
      }, { timeout: 2500 })
      return
    }
  } catch {
    /* ignore */
  }
  window.setTimeout(() => {
    try {
      fn()
    } catch {
      /* ignore */
    }
  }, 0)
}

let pendingRemoteSync = 0

/** Delay desktop + API work so clicks / navigation stay smooth after check-in. */
function scheduleRemoteSync(fn) {
  if (typeof window === 'undefined') return
  if (pendingRemoteSync) window.clearTimeout(pendingRemoteSync)
  pendingRemoteSync = window.setTimeout(() => {
    pendingRemoteSync = 0
    scheduleIdle(fn)
  }, 1400)
}

export function pulseDayKey(date = new Date()) {
  return format(date, 'yyyy-MM-dd')
}

export function checkInStorageKey(email) {
  return `pulseMySpaceCheckIn:${email}:${pulseDayKey()}`
}

function sessionKey(email, day = pulseDayKey()) {
  return `pulseMySpaceCheckInSession:${email}:${day}`
}

function emitCheckIn(email, session) {
  window.dispatchEvent(
    new CustomEvent(PULSE_CHECKIN_EVENT, {
      detail: {
        email,
        checkedInAt: session?.status === 'active' ? session.checkedInAt || null : null,
        activeMs: session?.activeMs || 0,
        status: session?.status || null,
        interrupted: Boolean(session?.interrupted),
        dayKey: session?.dayKey || null,
      },
    }),
  )
}

function readRawSession(email, day = pulseDayKey()) {
  if (!email) return null
  try {
    const sessionRaw = localStorage.getItem(sessionKey(email, day))
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw)
      if (parsed && (Number(parsed.activeMs) > 0 || Number(parsed.checkedInAt) > 0 || parsed.status)) {
        return {
          checkedInAt: Number(parsed.checkedInAt) || null,
          activeMs: Math.max(0, Number(parsed.activeMs) || 0),
          lastTickAt: Number(parsed.lastTickAt) || Number(parsed.checkedInAt) || Date.now(),
          status: parsed.status === 'stopped' ? 'stopped' : parsed.status === 'active' ? 'active' : (Number(parsed.checkedInAt) > 0 ? 'active' : 'stopped'),
          stoppedAt: Number(parsed.stoppedAt) || null,
          dayKey: parsed.dayKey || day,
          timesheetLogged: Boolean(parsed.timesheetLogged),
          targetLogged: Boolean(parsed.targetLogged),
          interrupted: Boolean(parsed.interrupted),
        }
      }
    }

    // Legacy: plain timestamp only
    const legacy = localStorage.getItem(checkInStorageKey(email))
    if (!legacy) return null
    const checkedInAt = Number(legacy)
    if (!Number.isFinite(checkedInAt) || checkedInAt <= 0) return null
    return {
      checkedInAt,
      activeMs: 0,
      lastTickAt: checkedInAt,
      status: 'active',
      stoppedAt: null,
      dayKey: day,
      timesheetLogged: false,
      targetLogged: false,
      interrupted: false,
    }
  } catch {
    return null
  }
}

function writeRawSession(email, session, day = pulseDayKey()) {
  if (!email) return
  try {
    if (!session) {
      localStorage.removeItem(sessionKey(email, day))
      localStorage.removeItem(checkInStorageKey(email))
      if (localStorage.getItem(PULSE_CHECKIN_ACTIVE_EMAIL_KEY) === email) {
        localStorage.removeItem(PULSE_CHECKIN_ACTIVE_EMAIL_KEY)
      }
      return
    }
    const payload = { ...session, dayKey: session.dayKey || day }
    localStorage.setItem(sessionKey(email, day), JSON.stringify(payload))
    if (payload.status === 'active' && payload.checkedInAt) {
      localStorage.setItem(checkInStorageKey(email), String(payload.checkedInAt))
      localStorage.setItem(PULSE_CHECKIN_ACTIVE_EMAIL_KEY, email)
    } else {
      localStorage.removeItem(checkInStorageKey(email))
      if (localStorage.getItem(PULSE_CHECKIN_ACTIVE_EMAIL_KEY) === email) {
        localStorage.removeItem(PULSE_CHECKIN_ACTIVE_EMAIL_KEY)
      }
    }
  } catch {
    /* ignore */
  }
}

function projectedActiveMs(session, now = Date.now()) {
  if (!session) return 0
  if (session.status === 'stopped') return Math.max(0, session.activeMs || 0)
  const lastTickAt = session.lastTickAt || session.checkedInAt || now
  const delta = Math.max(0, now - lastTickAt)
  let activeMs = Math.max(0, session.activeMs || 0)
  // Only credit short awake gaps — sleep, shutdown, and closed tabs skip time.
  if (delta > 0 && delta < PULSE_IDLE_GAP_MS) activeMs += delta
  return Math.min(PULSE_DAILY_CAP_MS, activeMs)
}

/**
 * Freeze the clock without checking out (tab hide / sleep / shutdown).
 * Credits at most a short awake delta, then stamps lastTickAt so long gaps are skipped on resume.
 */
export function pauseCheckInClock(email, { reason = 'idle' } = {}) {
  if (!email) return null
  const day = pulseDayKey()
  const current = readRawSession(email, day)
  if (!current || current.status !== 'active') return current

  const now = Date.now()
  const lastTickAt = current.lastTickAt || current.checkedInAt || now
  const delta = Math.max(0, now - lastTickAt)
  const interrupted = delta >= PULSE_IDLE_GAP_MS || reason === 'sleep' || reason === 'shutdown'
  const activeMs = projectedActiveMs(current, now)
  const next = {
    ...current,
    activeMs,
    lastTickAt: now,
    interrupted,
    dayKey: day,
  }
  writeRawSession(email, next, day)
  emitCheckIn(email, next)
  return next
}

/**
 * After server trusted sync, clamp local timer to the server total (may be capped).
 */
export function alignLocalToServerTotal(email, serverActiveMs) {
  if (!email || serverActiveMs == null) return null
  const day = pulseDayKey()
  const prev = readRawSession(email, day)
  if (!prev) return null
  const serverMs = Math.min(PULSE_DAILY_CAP_MS, Math.max(0, Number(serverActiveMs) || 0))
  const localMs = projectedActiveMs(prev)
  // Allow up to 2 minutes of local ahead for UX; never keep a large inflate over server.
  const activeMs = Math.min(localMs, serverMs + 120_000)
  const next = {
    ...prev,
    activeMs: Math.max(serverMs, Math.min(activeMs, PULSE_DAILY_CAP_MS)),
    lastTickAt: Date.now(),
    dayKey: day,
  }
  if (Math.abs((prev.activeMs || 0) - next.activeMs) < 500) return prev
  writeRawSession(email, next, day)
  emitCheckIn(email, next)
  return next
}

/**
 * Credit only awake time. Sleep / shutdown gaps (> PULSE_IDLE_GAP_MS) are skipped.
 */
export function reconcileCheckInSession(email) {
  const day = pulseDayKey()
  const current = readRawSession(email, day)
  if (!current || current.status !== 'active') return current

  const now = Date.now()
  const lastTickAt = current.lastTickAt || current.checkedInAt || now
  const delta = Math.max(0, now - lastTickAt)
  const interrupted = delta >= PULSE_IDLE_GAP_MS
  const activeMs = projectedActiveMs(current, now)
  const targetMs = PULSE_TARGET_HOURS * 3_600_000
  const targetLogged = current.targetLogged || activeMs >= targetMs
  const next = {
    ...current,
    activeMs: Math.min(PULSE_DAILY_CAP_MS, activeMs),
    lastTickAt: now,
    interrupted,
    targetLogged,
    dayKey: day,
  }
  writeRawSession(email, next, day)
  return next
}

export function readCheckInSession(email) {
  return readRawSession(email)
}

export function readCheckInAt(email) {
  const session = readRawSession(email)
  return session?.status === 'active' ? session.checkedInAt || null : null
}

export function isCheckedIn(email) {
  return Boolean(readCheckInAt(email))
}

/** Read-only elapsed seconds for today (frozen when checked out). */
export function getElapsedSeconds(email) {
  const session = readRawSession(email)
  if (!session) return 0
  return Math.max(0, Math.floor(projectedActiveMs(session) / 1000))
}

/**
 * Raise local day total to at least the server total (resume after refresh / new device).
 * Does not change active/stopped status by itself.
 */
export function mergeServerActiveMs(email, serverActiveMs) {
  if (!email) return null
  const day = pulseDayKey()
  const serverMs = Math.max(0, Number(serverActiveMs) || 0)
  if (serverMs <= 0) return readRawSession(email, day)

  const prev = readRawSession(email, day)
  const localMs = prev ? projectedActiveMs(prev) : 0
  const activeMs = Math.max(localMs, serverMs)
  if (prev && activeMs <= Math.max(0, prev.activeMs || 0) && localMs >= serverMs) {
    return prev
  }

  const now = Date.now()
  const next = {
    checkedInAt: prev?.status === 'active' ? prev.checkedInAt || now : prev?.checkedInAt || null,
    activeMs,
    lastTickAt: prev?.status === 'active' ? now : prev?.lastTickAt || now,
    status: prev?.status === 'active' ? 'active' : 'stopped',
    stoppedAt: prev?.status === 'active' ? null : prev?.stoppedAt || now,
    dayKey: day,
    timesheetLogged: Boolean(prev?.timesheetLogged),
    targetLogged: Boolean(prev?.targetLogged) || activeMs >= PULSE_TARGET_HOURS * 3_600_000,
    interrupted: false,
  }
  writeRawSession(email, next, day)
  emitCheckIn(email, next)
  return next
}

/** Pull today's server total into localStorage so the timer can resume. */
export async function hydrateCheckInFromServer(email) {
  if (!email) return null
  try {
    const day = await fetchPulseWorkDayToday(pulseDayKey())
    const serverMs = Math.max(0, Number(day?.totalActiveMs) || 0)
    if (serverMs <= 0) return readRawSession(email)
    return mergeServerActiveMs(email, serverMs)
  } catch {
    return readRawSession(email)
  }
}

/**
 * Check in (or resume same day). Timer continues from prior activeMs if any.
 * Pass baseActiveMs (e.g. server total) so resume is never lower than logged time.
 */
export function startCheckIn(email, timestamp = Date.now(), { baseActiveMs } = {}) {
  if (!email) return null
  const day = pulseDayKey()
  const now = Number(timestamp) || Date.now()
  const prev = readRawSession(email, day)
  const priorMs = Math.max(
    0,
    Number(prev?.activeMs) || 0,
    Number(baseActiveMs) || 0,
  )
  const session = {
    checkedInAt: now,
    activeMs: priorMs,
    lastTickAt: now,
    status: 'active',
    stoppedAt: null,
    dayKey: day,
    timesheetLogged: Boolean(prev?.timesheetLogged),
    targetLogged: Boolean(prev?.targetLogged) || priorMs >= PULSE_TARGET_HOURS * 3_600_000,
    interrupted: false,
  }
  writeRawSession(email, session, day)
  emitCheckIn(email, session)
  // Desktop must react to the CTA immediately — do not wait for API debounce.
  void syncPulseDesktopCheckIn(email, session)
  scheduleRemoteSync(() => {
    void syncPulseCheckInEvent('check-in', { email, activeMs: session.activeMs, date: day })
  })
  return session
}

/**
 * Check out — freeze timer at current elapsed; hide desktop widget immediately.
 */
export function stopCheckIn(email) {
  if (!email) return null
  const day = pulseDayKey()
  const current = readRawSession(email, day)
  if (!current) return null

  const now = Date.now()
  const activeMs =
    current.status === 'active' ? projectedActiveMs(current, now) : Math.max(0, current.activeMs || 0)
  const session = {
    ...current,
    activeMs,
    lastTickAt: now,
    status: 'stopped',
    stoppedAt: now,
    dayKey: day,
    interrupted: false,
  }
  writeRawSession(email, session, day)
  emitCheckIn(email, session)
  void syncPulseDesktopCheckIn(email, null)
  scheduleRemoteSync(() => {
    void syncPulseCheckInEvent('check-out', { email, activeMs, date: day })
  })
  return session
}

/**
 * Sign-out: stop a live timer, hide desktop/PiP companion, keep today's total for next login.
 */
export function endCheckInOnLogout(email) {
  const target =
    email ||
    readCheckInActiveEmail() ||
    null
  if (!target) {
    void syncPulseDesktopCheckIn('', null)
    return null
  }
  const active = readCheckInAt(target)
  if (active) {
    return stopCheckIn(target)
  }
  void syncPulseDesktopCheckIn(target, null)
  emitCheckIn(target, readRawSession(target))
  return null
}

/**
 * Legacy API: timestamp truthy → start; falsy → stop (freeze, not clear).
 */
export function writeCheckInAt(email, timestamp) {
  if (!email) return
  if (timestamp) {
    startCheckIn(email, timestamp)
    return
  }
  stopCheckIn(email)
}

/**
 * At midnight / first open of a new day: log yesterday to timesheet, clear timer to 00:00:00.
 */
export async function rolloverCheckInDayIfNeeded(email) {
  if (!email || typeof window === 'undefined') return false
  const today = pulseDayKey()
  try {
    // Scan last 3 calendar days for unfinished sessions
    for (let i = 1; i <= 3; i += 1) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = pulseDayKey(d)
      if (key >= today) continue
      const raw = localStorage.getItem(sessionKey(email, key))
      if (!raw) continue
      let session
      try {
        session = JSON.parse(raw)
      } catch {
        continue
      }
      if (!session) continue
      const activeMs = Math.max(0, Number(session.activeMs) || 0)
      if (!session.timesheetLogged && activeMs > 0) {
        await syncPulseCheckInEvent('finalize', { email, activeMs, date: key })
      }
      localStorage.removeItem(sessionKey(email, key))
      localStorage.removeItem(`pulseMySpaceCheckIn:${email}:${key}`)
    }
  } catch {
    /* ignore */
  }

  // Ensure today starts clean if somehow carrying active from wrong day
  const todaySession = readRawSession(email, today)
  if (todaySession && todaySession.dayKey && todaySession.dayKey !== today) {
    writeRawSession(email, null, today)
    emitCheckIn(email, null)
    return true
  }
  return false
}

export function readCheckInActiveEmail() {
  try {
    const email = localStorage.getItem(PULSE_CHECKIN_ACTIVE_EMAIL_KEY)
    return email && readCheckInAt(email) ? email : null
  } catch {
    return null
  }
}

export function formatElapsed(total) {
  const safe = Math.max(0, Math.floor(Number(total) || 0))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export function readFloatPosition() {
  try {
    const raw = localStorage.getItem(PULSE_CHECKIN_POS_KEY)
    if (!raw) return null
    const pos = JSON.parse(raw)
    if (typeof pos?.x === 'number' && typeof pos?.y === 'number') return pos
  } catch {
    /* ignore */
  }
  return null
}

export function writeFloatPosition(pos) {
  try {
    localStorage.setItem(PULSE_CHECKIN_POS_KEY, JSON.stringify(pos))
  } catch {
    /* ignore */
  }
}

export function supportsDocumentPip() {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window
}

/** Keep session heartbeats while the browser is open.
 * Switching to another app/tab does NOT pause time.
 * Only sleep / shutdown / killed tab (JS frozen) skips the gap on wake.
 */
export function startCheckInHeartbeat(getEmail) {
  if (typeof window === 'undefined') return () => {}

  let lastSyncAt = 0
  let lastDesktopAt = 0
  let lastEmittedActiveMs = -1
  let lastEmittedStatus = null
  let lastDesktopActive = null

  const emailOf = () => (typeof getEmail === 'function' ? getEmail() : getEmail)

  const flushSync = (session, { force = false } = {}) => {
    const email = emailOf()
    if (!email || !session || session.status !== 'active') return
    const now = Date.now()
    if (!force && now - lastSyncAt < 45_000) return
    lastSyncAt = now
    void syncPulseCheckInEvent('sync', {
      email,
      activeMs: session.activeMs,
      date: session.dayKey || pulseDayKey(),
    }).then((day) => {
      if (day && day.totalActiveMs != null) {
        alignLocalToServerTotal(email, day.totalActiveMs)
      }
    })
  }

  const pulse = ({ broadcast = false, syncDesktop = false, forceSync = false } = {}) => {
    const email = emailOf()
    if (!email) return
    if (broadcast) void rolloverCheckInDayIfNeeded(email)

    const checkedInAt = readCheckInAt(email)
    if (!checkedInAt) {
      if (syncDesktop || lastDesktopActive !== false) {
        lastDesktopActive = false
        lastDesktopAt = Date.now()
        void syncPulseDesktopCheckIn(email, null)
      }
      return
    }

    const session = reconcileCheckInSession(email)
    if (!session || session.status !== 'active') {
      if (syncDesktop || lastDesktopActive !== false) {
        lastDesktopActive = false
        void syncPulseDesktopCheckIn(email, null)
      }
      return
    }

    const activeMs = Math.max(0, Number(session.activeMs) || 0)
    const status = session.status || null
    const changed =
      session.interrupted ||
      status !== lastEmittedStatus ||
      Math.abs(activeMs - lastEmittedActiveMs) >= 15_000

    if (broadcast || changed) {
      lastEmittedActiveMs = activeMs
      lastEmittedStatus = status
      emitCheckIn(email, session)
    }

    const now = Date.now()
    if (syncDesktop || now - lastDesktopAt > 60_000) {
      lastDesktopAt = now
      lastDesktopActive = true
      void syncPulseDesktopCheckIn(email, session)
    }
    flushSync(session, { force: forceSync })
  }

  /** Tab/app switch — save progress only; keep accruing in the background. */
  const onHide = () => {
    const email = emailOf()
    if (!email || !readCheckInAt(email)) return
    const session = reconcileCheckInSession(email)
    if (session?.status === 'active') flushSync(session, { force: true })
  }

  const onShow = () => {
    pulse({ broadcast: true, syncDesktop: true, forceSync: true })
  }

  /** Real close / shutdown / discard — stamp so frozen time is not credited on reopen. */
  const onPageHide = (event) => {
    const email = emailOf()
    if (!email) return
    // bfcache (persisted) is like a soft hide — treat as tab switch, not shutdown.
    if (event?.persisted) {
      onHide()
      return
    }
    const paused = pauseCheckInClock(email, { reason: 'shutdown' })
    if (paused?.status === 'active') flushSync(paused, { force: true })
  }

  const onFreeze = () => {
    const email = emailOf()
    if (!email) return
    const paused = pauseCheckInClock(email, { reason: 'sleep' })
    if (paused?.status === 'active') flushSync(paused, { force: true })
  }

  pulse({ syncDesktop: true, forceSync: true })
  // Keep ticking even in background tabs (browsers may throttle to ~1/min — still fine).
  const id = window.setInterval(() => pulse(), 30_000)

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') onHide()
    else onShow()
  }

  window.addEventListener('online', onShow)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pageshow', onShow)
  window.addEventListener('pagehide', onPageHide)
  document.addEventListener('freeze', onFreeze)
  window.addEventListener('beforeunload', onPageHide)

  return () => {
    window.clearInterval(id)
    window.removeEventListener('online', onShow)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pageshow', onShow)
    window.removeEventListener('pagehide', onPageHide)
    document.removeEventListener('freeze', onFreeze)
    window.removeEventListener('beforeunload', onPageHide)
  }
}
