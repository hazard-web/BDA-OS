import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { rememberPulsePath } from '../utils/pulseEntry'
import { formatElapsed, getElapsedSeconds, PULSE_CHECKIN_EVENT, readCheckInAt } from '../utils/pulseCheckIn'
import { useAuth } from '../context/AuthContext'

/** Longest / most-specific paths first. */
const TITLES = [
  ['/smart-signin', 'Smart Sign-in'],
  ['/oauth/create-account', 'Create Account'],
  ['/oauth/callback', 'Signing in'],
  ['/coming-soon', 'Coming Soon'],
  ['/pulse/settings/service/getting-started', 'Getting Started'],
  ['/pulse/getting-started', 'Getting Started'],
  ['/pulse/notes', 'Notebook'],
  ['/pulse/onboarding', 'Employee'],
  ['/pulse/company', 'Company'],
  ['/pulse/leave', 'Leave Tracker'],
  ['/pulse/attendance', 'Attendance'],
  ['/pulse/time', 'Time Tracker'],
  ['/pulse/apps', 'App access'],
  ['/pulse/home', 'My Space'],
  ['/pulse', 'Pulse'],
  ['/people-os', 'People OS'],
  ['/verify-email', 'Verify email'],
  ['/reset-password', 'Reset password'],
  ['/invite', 'Accept invite'],
  ['/onboard', 'Complete your details'],
  ['/register', 'Create admin'],
  ['/forgot', 'Forgot password'],
  ['/verify', 'Verify'],
  ['/setup', 'Setup'],
  ['/login', 'Sign in'],
]

const FAVICON_DEFAULT = '/favicon.svg'
const FAVICON_PULSE = '/favicon-pulse.svg'
const FAVICON_BUST = 'v12'

function titleFromSegment(segment) {
  if (!segment) return 'People OS'
  return segment
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function pageTitle(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return 'Pulse'

  if (/^\/[^/]+\/settings\/service\/getting-started$/.test(path)) return 'Getting Started'

  const match = TITLES.find(([route]) => path === route || path.startsWith(`${route}/`))
  if (match) return match[1]

  const parts = path.split('/').filter(Boolean)
  return titleFromSegment(parts[parts.length - 1])
}

function faviconForPath(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (
    path === '/' ||
    path === '/pulse' ||
    path.startsWith('/pulse/') ||
    path.startsWith('/onboard') ||
    path.startsWith('/invite') ||
    path.startsWith('/people') ||
    /^\/[^/]+\/settings\/service\/getting-started$/.test(path)
  ) {
    return FAVICON_PULSE
  }
  return FAVICON_DEFAULT
}

function setFavicon(href) {
  const url = `${href}?${FAVICON_BUST}`
  document.querySelectorAll("link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']").forEach((el) => {
    el.parentNode?.removeChild(el)
  })
  const icon = document.createElement('link')
  icon.rel = 'icon'
  icon.type = 'image/svg+xml'
  icon.href = url
  document.head.appendChild(icon)

  const apple = document.createElement('link')
  apple.rel = 'apple-touch-icon'
  apple.href = url
  document.head.appendChild(apple)
}

function baseTitleForPage(name) {
  if (name === 'Coming Soon') return 'Coming Soon | People OS'
  if (name === 'Pulse') return 'Pulse'
  if (name === 'Getting Started') return 'Getting Started | Pulse'
  if (name === 'Accounts') return 'Accounts'
  return name
}

export default function DocumentTitle() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const baseTitleRef = useRef('People OS')

  useLayoutEffect(() => {
    const name = pageTitle(pathname)
    baseTitleRef.current = baseTitleForPage(name)
    const checkedInAt = readCheckInAt(user?.email)
    if (checkedInAt && user?.email) {
      document.title = `${formatElapsed(getElapsedSeconds(user.email))} · ${baseTitleRef.current}`
    } else {
      document.title = baseTitleRef.current
    }

    setFavicon(faviconForPath(pathname))
    rememberPulsePath(pathname)
  }, [pathname, user?.email])

  useEffect(() => {
    if (!user?.email) return undefined

    const apply = () => {
      const checkedInAt = readCheckInAt(user.email)
      if (!checkedInAt) {
        document.title = baseTitleRef.current
        return
      }
      document.title = `${formatElapsed(getElapsedSeconds(user.email))} · ${baseTitleRef.current}`
    }

    const onChange = () => apply()
    apply()
    const id = window.setInterval(apply, 2000)
    window.addEventListener(PULSE_CHECKIN_EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.clearInterval(id)
      window.removeEventListener(PULSE_CHECKIN_EVENT, onChange)
      window.removeEventListener('storage', onChange)
      document.title = baseTitleRef.current
    }
  }, [user?.email])

  return null
}
