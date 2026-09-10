import {
  formatElapsed,
  getElapsedSeconds,
  readCheckInAt,
  readCheckInActiveEmail,
  supportsDocumentPip,
} from './pulseCheckIn'
import { APP_TIMER } from './pulseEntry'

export const PULSE_PIP_EVENT = 'pulse-checkin-pip-change'

const OVERLAY_WINDOW_NAME = 'pulse-checkin-timer'

const TIMER_PATH = APP_TIMER

let popupWindow = null
let pipWindow = null
let overlayTimer = null
let closePoll = null
let ownerEmail = null

function notify(open) {
  window.dispatchEvent(new CustomEvent(PULSE_PIP_EVENT, { detail: { open } }))
}

function clearOverlayTimer() {
  if (overlayTimer) {
    window.clearInterval(overlayTimer)
    overlayTimer = null
  }
}

function stopClosePoll() {
  if (closePoll) {
    window.clearInterval(closePoll)
    closePoll = null
  }
}

function timerUrl() {
  return new URL(TIMER_PATH, window.location.origin).href
}

function focusOverlay() {
  try {
    if (pipWindow && !pipWindow.closed) pipWindow.focus()
    else if (popupWindow && !popupWindow.closed) popupWindow.focus()
  } catch {
    /* ignore */
  }
}

function startClosePoll() {
  stopClosePoll()
  closePoll = window.setInterval(() => {
    const popupAlive = popupWindow && !popupWindow.closed
    const pipAlive = pipWindow && !pipWindow.closed
    if (!popupAlive && !pipAlive) {
      popupWindow = null
      pipWindow = null
      ownerEmail = null
      clearOverlayTimer()
      stopClosePoll()
      notify(false)
    }
  }, 400)
}

function popupFeatures() {
  const width = 288
  const height = 128
  const left = Math.max(0, Math.round(window.screenX + window.outerWidth - width - 24))
  const top = Math.max(0, Math.round(window.screenY + 72))
  return [
    'popup=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'scrollbars=no',
    'resizable=yes',
  ].join(',')
}

function renderPipShell(win, email) {
  const checkedInAt = readCheckInAt(email)
  const elapsed = checkedInAt ? getElapsedSeconds(email) : 0

  win.document.documentElement.lang = 'en'
  win.document.title = 'BDA OS · Working'

  const style = win.document.createElement('style')
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0;
      height: 100%;
      background: #fff;
      color: #0f172a;
      font-family: "IBM Plex Sans", system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .wrap {
      height: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border: 1.5px solid #1a5f4a;
      border-radius: 12px;
      background: #fff;
    }
    .dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #34d399;
      box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.28);
      flex-shrink: 0;
    }
    .meta { min-width: 0; flex: 1; }
    .label {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #1a5f4a;
    }
    .time {
      font-family: "IBM Plex Mono", ui-monospace, monospace;
      font-size: 22px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.04em;
      color: #0f172a;
      line-height: 1.15;
    }
  `
  win.document.head.appendChild(style)

  const wrap = win.document.createElement('div')
  wrap.className = 'wrap'
  wrap.innerHTML = `
    <span class="dot" aria-hidden="true"></span>
    <div class="meta">
      <div class="label">BDA OS · Working</div>
      <div class="time" id="pulse-pip-time">${formatElapsed(elapsed)}</div>
    </div>
  `
  win.document.body.appendChild(wrap)
}

function startPipTick(win, email) {
  clearOverlayTimer()
  overlayTimer = window.setInterval(() => {
    const at = readCheckInAt(email)
    const el = win.document.getElementById('pulse-pip-time')
    if (!at) {
      closeCheckInPip()
      return
    }
    const label = formatElapsed(getElapsedSeconds(email))
    if (el) el.textContent = label
    win.document.title = `BDA OS · ${label}`
  }, 1000)
}

async function tryOpenDocumentPip(email) {
  if (!supportsDocumentPip() || (pipWindow && !pipWindow.closed)) return false
  try {
    const win = await window.documentPictureInPicture.requestWindow({
      width: 260,
      height: 104,
    })
    pipWindow = win
    ownerEmail = email
    renderPipShell(win, email)
    startPipTick(win, email)
    notify(true)
    startClosePoll()
    win.addEventListener('pagehide', () => {
      pipWindow = null
      if (!popupWindow || popupWindow.closed) ownerEmail = null
      notify(isCheckInPipOpen())
    })
    return true
  } catch {
    pipWindow = null
    return false
  }
}

function openPopupSync(email) {
  const win = window.open(timerUrl(), OVERLAY_WINDOW_NAME, popupFeatures())
  if (!win) return false
  popupWindow = win
  ownerEmail = email
  notify(true)
  startClosePoll()
  try {
    win.focus()
  } catch {
    /* ignore */
  }
  return true
}

export function isCheckInPipOpen() {
  return (popupWindow && !popupWindow.closed) || (pipWindow && !pipWindow.closed)
}

/**
 * Opens a floating timer window (Document PiP when available, else popup).
 */
export async function openCheckInPip(email) {
  const activeEmail = email || readCheckInActiveEmail()
  if (!activeEmail || !readCheckInAt(activeEmail)) {
    return { ok: false, mode: null }
  }
  ownerEmail = activeEmail

  if (isCheckInPipOpen()) {
    focusOverlay()
    notify(true)
    return { ok: true, mode: 'existing' }
  }

  if (supportsDocumentPip()) {
    const pipOk = await tryOpenDocumentPip(activeEmail)
    if (pipOk) return { ok: true, mode: 'pip' }
  }

  const popupOk = openPopupSync(activeEmail)
  if (popupOk) return { ok: true, mode: 'popup' }

  return { ok: false, mode: null }
}

export function closeCheckInPip() {
  clearOverlayTimer()
  stopClosePoll()
  try {
    popupWindow?.close()
  } catch {
    /* ignore */
  }
  try {
    pipWindow?.close()
  } catch {
    /* ignore */
  }
  popupWindow = null
  pipWindow = null
  ownerEmail = null
  notify(false)
}

export function getCheckInPipEmail() {
  return ownerEmail
}

export function supportsFloatingTimer() {
  return supportsDocumentPip() || typeof window.open === 'function'
}
