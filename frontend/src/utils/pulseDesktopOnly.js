/**
 * BDA OS is desktop-only for sign-in and the main workspace.
 * Phones / small tablets are blocked at login and behind ProtectedRoute.
 */

const MOBILE_UA =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS|FxiOS/i

export function isMobileUserAgent(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  return MOBILE_UA.test(String(ua || ''))
}

/** Coarse pointer + narrow viewport catches many tablets that omit "Mobile" in UA. */
export function isMobileViewport() {
  if (typeof window === 'undefined') return false
  try {
    const narrow = window.matchMedia('(max-width: 900px)').matches
    const coarse = window.matchMedia('(pointer: coarse)').matches
    return narrow && coarse
  } catch {
    return false
  }
}

export function isMobileClient() {
  if (typeof window === 'undefined') return false
  return isMobileUserAgent() || isMobileViewport()
}

export const DESKTOP_ONLY_MESSAGE =
  'BDA OS is built for desktop. Please open this on a computer to sign in.'
