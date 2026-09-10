import { isPulseAuxiliaryTab } from './pulseOpenPage'

/** Same Sign out beat as Overview: button loads, then the BDA OS gate. */
export const SIGN_OUT_BUTTON_MS = 650
export const SIGN_OUT_GATE_MS = 950
export const SIGN_OUT_TOTAL_MS = SIGN_OUT_BUTTON_MS + SIGN_OUT_GATE_MS

const CHANNEL = 'pulse-auth'
const STORAGE_KEY = 'pulseAuthLogout'
const ORIGIN_KEY = 'pulseLogoutLocal'

function readOriginStamp() {
  try {
    return sessionStorage.getItem(ORIGIN_KEY) || ''
  } catch {
    return ''
  }
}

function markLogoutOrigin(at) {
  try {
    sessionStorage.setItem(ORIGIN_KEY, at)
  } catch {
    /* ignore */
  }
}

export function clearPulseLogoutOrigin() {
  try {
    sessionStorage.removeItem(ORIGIN_KEY)
  } catch {
    /* ignore */
  }
}

function isLogoutOriginator() {
  return Boolean(readOriginStamp())
}

/** Tell every other BDA OS tab that this session signed out. */
export function broadcastPulseLogout() {
  const already = isLogoutOriginator()
  const at = String(Date.now())
  if (!already) markLogoutOrigin(at)
  if (already) return
  try {
    localStorage.setItem(STORAGE_KEY, at)
  } catch {
    /* ignore */
  }
  try {
    const channel = new BroadcastChannel(CHANNEL)
    channel.postMessage({ type: 'logout', at })
    channel.close()
  } catch {
    /* ignore */
  }
}

let closingAuxiliary = false

/** Close a service tab. If the browser blocks it, leave a blank page — never Login. */
export function closePulseAuxiliaryTab() {
  if (closingAuxiliary) return
  closingAuxiliary = true
  try {
    window.close()
  } catch {
    /* ignore */
  }
  window.setTimeout(() => {
    try {
      if (!window.closed) window.location.replace('about:blank')
    } catch {
      /* ignore */
    }
  }, 80)
}

export function goToLoginOrCloseTab(navigate) {
  if (isPulseAuxiliaryTab(window.location.pathname)) {
    closePulseAuxiliaryTab()
    return
  }
  if (typeof navigate === 'function') {
    navigate('/login', { replace: true })
    return
  }
  window.location.replace('/login')
}

/** Other tabs: close services, send the main dashboard to Login. */
export function subscribePulseLogout(onLogout) {
  const fire = () => {
    if (isLogoutOriginator()) return
    onLogout()
  }

  const onStorage = (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      fire()
      return
    }
    if (event.key === 'token' && !event.newValue && event.oldValue) {
      fire()
    }
  }

  window.addEventListener('storage', onStorage)

  let channel
  try {
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = (event) => {
      if (event?.data?.type === 'logout') fire()
    }
  } catch {
    channel = null
  }

  return () => {
    window.removeEventListener('storage', onStorage)
    try {
      channel?.close()
    } catch {
      /* ignore */
    }
  }
}
