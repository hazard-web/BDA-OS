export const PULSE_SHELL_VIEWS = {
  home: {
    path: '/pulse/home',
    space: 'myspace',
    module: 'home',
    sub: 'overview',
  },
  company: {
    path: '/pulse/company',
    space: 'organization',
    module: 'home',
    sub: 'overview',
  },
  onboarding: {
    path: '/pulse/onboarding',
    space: 'organization',
    module: 'home',
    sub: 'onboarding',
    admin: true,
    label: 'Opening Onboarding',
  },
  leave: {
    path: '/pulse/leave',
    space: 'myspace',
    module: 'leave',
    sub: 'overview',
    leaveTab: 'mydata',
    leaveSubTab: 'summary',
    label: 'Opening Leave Tracker',
  },
  attendance: {
    path: '/pulse/attendance',
    space: 'organization',
    module: 'home',
    sub: 'attendance',
    admin: true,
    label: 'Opening Attendance',
  },
  time: {
    path: '/pulse/time',
    space: 'myspace',
    module: 'time',
    sub: 'overview',
    label: 'Opening Time Tracker',
  },
  apps: {
    path: '/pulse/apps',
    space: 'organization',
    module: 'home',
    sub: 'apps',
    admin: true,
    label: 'Opening App access',
  },
}

export const PULSE_OPEN_VIEWS = Object.fromEntries(
  ['onboarding', 'leave', 'attendance', 'time', 'apps'].map((key) => [key, PULSE_SHELL_VIEWS[key]]),
)

export const PULSE_SHELL_PATHS = Object.values(PULSE_SHELL_VIEWS).map((view) => view.path)

export const ORG_OPEN_SUBS = new Set(['overview', 'onboarding', 'apps', 'attendance'])

export function readPulseLocation(pathname = window.location.pathname, search = window.location.search) {
  const path = String(pathname || '').replace(/\/+$/, '') || '/'
  let params
  try {
    params = new URLSearchParams(search || '')
  } catch {
    params = new URLSearchParams()
  }
  const openKey = params.get('open')
  const boot = params.get('boot') === '1' || Boolean(PULSE_OPEN_VIEWS[openKey])

  if (openKey && PULSE_SHELL_VIEWS[openKey]) {
    return { key: openKey, ...PULSE_SHELL_VIEWS[openKey], boot: true }
  }

  const found = Object.entries(PULSE_SHELL_VIEWS).find(([, view]) => view.path === path)
  if (found) {
    const [key, view] = found
    return { key, ...view, boot: key !== 'home' && key !== 'company' ? boot : false }
  }

  return { key: 'home', ...PULSE_SHELL_VIEWS.home, boot: false }
}

export function readPulseOpenView(search = window.location.search) {
  const loc = readPulseLocation(window.location.pathname, search)
  return loc.boot ? loc : null
}

export function isPulseOpenPath(pathname, search) {
  return Boolean(readPulseLocation(pathname, search).boot)
}

/** Service pages opened from Company — never the login welcome. */
export function isPulseServicePath(pathname) {
  const key = readPulseLocation(pathname, '').key
  return key !== 'home' && key !== 'company'
}

const PULSE_AUXILIARY_PATHS = new Set([
  ...Object.values(PULSE_OPEN_VIEWS).map((view) => view.path),
  '/pulse/notes',
  '/pulse/checkin-timer',
])

/** Extra Pulse tabs (Employee, Leave, Notes, …). Logout should close these, not show Login. */
export function isPulseAuxiliaryTab(pathname = typeof window !== 'undefined' ? window.location.pathname : '') {
  const path = String(pathname || '').replace(/\/+$/, '') || '/'
  return PULSE_AUXILIARY_PATHS.has(path)
}

const LOCKUP = '/bda-logo-lockup.png'

function warmOpenAssets() {
  try {
    const img = new Image()
    img.src = `${window.location.origin}${LOCKUP}`
  } catch {
    /* ignore */
  }
}

/** Open a service in a new tab. Never navigate the page you clicked from. */
export function openPulsePage(key) {
  const view = PULSE_OPEN_VIEWS[key]
  if (!view) return false
  warmOpenAssets()
  const url = `${window.location.origin}${view.path}?boot=1`
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
  return true
}
