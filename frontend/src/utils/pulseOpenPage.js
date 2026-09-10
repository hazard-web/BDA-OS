import { APP_BASE, APP_NOTES, APP_TIMER, toAppPath } from './pulseEntry'

const LIVE_MODULES = [
  'files',
  'engagement',
  'letters',
  'travel',
  'tasks',
  'compensation',
  'operations',
  'reports',
  'general',
  'okr',
]

export const PULSE_SHELL_VIEWS = {
  home: {
    path: `${APP_BASE}/home`,
    space: 'myspace',
    module: 'home',
    sub: 'overview',
    label: 'Opening BDA OS',
  },
  calendar: {
    path: `${APP_BASE}/calendar`,
    space: 'myspace',
    module: 'home',
    sub: 'calendar',
    label: 'Opening Calendar',
  },
  company: {
    path: `${APP_BASE}/company`,
    space: 'organization',
    module: 'home',
    sub: 'overview',
    label: 'Opening Company',
  },
  onboarding: {
    path: `${APP_BASE}/onboarding`,
    space: 'organization',
    module: 'home',
    sub: 'onboarding',
    admin: true,
    label: 'Opening Onboarding',
  },
  leave: {
    path: `${APP_BASE}/leave`,
    space: 'myspace',
    module: 'leave',
    sub: 'overview',
    leaveTab: 'mydata',
    leaveSubTab: 'requests',
    label: 'Opening Leave & Attendance',
  },
  hours: {
    path: `${APP_BASE}/hours`,
    space: 'myspace',
    module: 'time',
    sub: 'overview',
    label: 'Opening Timesheet',
  },
  time: {
    path: `${APP_BASE}/hours`,
    space: 'myspace',
    module: 'time',
    sub: 'overview',
    label: 'Opening Timesheet',
  },
  myAttendance: {
    path: `${APP_BASE}/attendance`,
    space: 'myspace',
    module: 'attendance',
    sub: 'overview',
    leaveTab: 'attendance',
    label: 'Opening Leave & Attendance',
  },
  attendance: {
    path: `${APP_BASE}/company/attendance`,
    space: 'organization',
    module: 'home',
    sub: 'attendance',
    admin: true,
    label: 'Opening Attendance',
  },
  companyTime: {
    path: `${APP_BASE}/company/time`,
    space: 'organization',
    module: 'home',
    sub: 'time',
    admin: true,
    label: 'Opening Timesheet',
  },
  performance: {
    path: `${APP_BASE}/performance`,
    space: 'myspace',
    module: 'performance',
    sub: 'overview',
  },
  account: {
    path: `${APP_BASE}/account`,
    space: 'myspace',
    module: 'account',
    sub: 'overview',
    label: 'Opening Account',
  },
  apps: {
    path: `${APP_BASE}/apps`,
    space: 'organization',
    module: 'home',
    sub: 'apps',
    admin: true,
    label: 'Opening App access',
  },
  people: {
    path: `${APP_BASE}/company/people`,
    space: 'organization',
    module: 'home',
    sub: 'people',
    admin: true,
    label: 'Opening People',
  },
  ...Object.fromEntries(
    LIVE_MODULES.map((id) => [
      id,
      { path: `${APP_BASE}/${id}`, space: 'myspace', module: id, sub: 'overview' },
    ]),
  ),
}

export const PULSE_OPEN_VIEWS = Object.fromEntries(
  ['onboarding', 'leave', 'attendance', 'time', 'hours', 'apps', 'companyTime', 'people'].map((key) => [key, PULSE_SHELL_VIEWS[key]]),
)

export const PULSE_SHELL_PATHS = [...new Set(Object.values(PULSE_SHELL_VIEWS).map((view) => view.path))]

export const ORG_OPEN_SUBS = new Set(['overview', 'onboarding', 'apps', 'attendance', 'time', 'people'])

export function pathForShell({ space, module, sub } = {}) {
  if (space === 'organization') {
    if (sub === 'onboarding') return PULSE_SHELL_VIEWS.onboarding.path
    if (sub === 'apps') return PULSE_SHELL_VIEWS.apps.path
    if (sub === 'attendance') return PULSE_SHELL_VIEWS.attendance.path
    if (sub === 'time') return PULSE_SHELL_VIEWS.companyTime.path
    if (sub === 'people') return PULSE_SHELL_VIEWS.people.path
    return PULSE_SHELL_VIEWS.company.path
  }
  if (module === 'home') {
    return sub === 'calendar' ? PULSE_SHELL_VIEWS.calendar.path : PULSE_SHELL_VIEWS.home.path
  }
  if (module === 'leave') return PULSE_SHELL_VIEWS.leave.path
  if (module === 'time') return PULSE_SHELL_VIEWS.hours.path
  if (module === 'attendance') return PULSE_SHELL_VIEWS.myAttendance.path
  if (module === 'performance') return PULSE_SHELL_VIEWS.performance.path
  if (module === 'account') return PULSE_SHELL_VIEWS.account.path
  if (PULSE_SHELL_VIEWS[module]) return PULSE_SHELL_VIEWS[module].path
  return PULSE_SHELL_VIEWS.home.path
}

export function readPulseLocation(pathname = window.location.pathname, search = window.location.search) {
  const path = toAppPath(String(pathname || '').replace(/\/+$/, '') || '/')
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

  const found = Object.entries(PULSE_SHELL_VIEWS)
    .sort((a, b) => b[1].path.length - a[1].path.length)
    .find(([, view]) => view.path === path)
  if (found) {
    const [key, view] = found
    // Any `?boot=1` open (dock / Company services) shows the BDA gate first.
    return { key, ...view, boot: params.get('boot') === '1' || Boolean(PULSE_OPEN_VIEWS[key]) }
  }

  return { key: 'home', ...PULSE_SHELL_VIEWS.home, boot: params.get('boot') === '1' }
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
  return key !== 'home' && key !== 'company' && key !== 'calendar'
}

const PULSE_AUXILIARY_PATHS = new Set([
  ...Object.values(PULSE_OPEN_VIEWS).map((view) => view.path),
  APP_NOTES,
  APP_TIMER,
])

/** Extra BDA OS tabs (Employee, Leave, Notes, …). Logout should close these, not show Login. */
export function isPulseAuxiliaryTab(pathname = typeof window !== 'undefined' ? window.location.pathname : '') {
  const path = toAppPath(String(pathname || '').replace(/\/+$/, '') || '/')
  return PULSE_AUXILIARY_PATHS.has(path)
}

const LOCKUP = '/bda-logo.png'

function warmOpenAssets() {
  try {
    const img = new Image()
    img.src = `${window.location.origin}${LOCKUP}`
  } catch {
    /* ignore */
  }
}

/** Open a path in a new tab. Never navigate the page you clicked from. */
export function openPulsePath(path) {
  if (!path) return false
  warmOpenAssets()
  const url = `${window.location.origin}${path}?boot=1`
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
  return true
}

/** Open a service in a new tab. Never navigate the page you clicked from. */
export function openPulsePage(key) {
  const view = PULSE_OPEN_VIEWS[key] || PULSE_SHELL_VIEWS[key]
  if (!view) return false
  return openPulsePath(view.path)
}
