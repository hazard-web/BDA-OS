import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  BookOutlined,
  CarryOutOutlined,
  ClockCircleOutlined,
  HomeOutlined,
  PlusOutlined,
  RiseOutlined,
  RocketOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  Button,
  Dropdown,
  Empty,
  Layout as AntLayout,
  Popover,
  Tag,
} from 'antd'
import api from '../api'
import PulseFloatingDock from '../components/PulseFloatingDock'
import { usePulseWorkWeek } from '../components/PulseWorkSchedule'
// Dashboard — parked on branch `pulse/company-later-services`
// import PulseMySpaceDashboard from '../components/PulseMySpaceDashboard'
import PulseOverviewHome from '../components/PulseOverviewHome'
import PulseMySpaceCalendar from '../components/PulseMySpaceCalendar'
import PulseLeaveTracker from '../components/PulseLeaveTracker'
import PulseMoreLauncher, { MORE_SERVICES } from '../components/PulseMoreLauncher'
import PulseSmartChat from '../components/PulseSmartChat'
import PulseOrganization, { ORG_TABS } from '../components/PulseOrganization'
import PulseAppearanceToggle from '../components/PulseAppearanceToggle'
import { PulseHeaderNotifications, PulseHeaderSearch } from '../components/PulseHeaderTools'
import PulseLiveModule from '../components/PulseLiveWorkspace'
import PulseWelcomeCurtain from '../components/PulseWelcomeCurtain'
import { pulseToast } from '../utils/pulseToast'
import AppsFlyout from '../components/AppsFlyout'
import AccountPortal from './AccountPortal'
import { AuthLogoLoader, useAccountSignOut } from '../components/auth/AuthLogoLoader'
import { isPulseAdmin as userIsPulseAdmin } from '../utils/pulseRoles'
import { useAuth } from '../context/AuthContext'
import { APP_BASE, APP_COMPANY, APP_NOTES, PULSE_HOME, getPulseOpenPath, getPulseSampleChoice, hasPulseAccount, isBdaOsAppLink, toAppPath } from '../utils/pulseEntry'
import { hasSeenWelcomeCurtain } from '../utils/pulseWelcomeCurtain'
import { ORG_OPEN_SUBS, isPulseServicePath, PULSE_SHELL_VIEWS, pathForShell, readPulseLocation } from '../utils/pulseOpenPage'
import {
  formatElapsed,
  getElapsedSeconds,
  hydrateCheckInFromServer,
  PULSE_CHECKIN_EVENT,
  readCheckInAt,
  rolloverCheckInDayIfNeeded,
  startCheckIn,
  stopCheckIn,
} from '../utils/pulseCheckIn'
import { closeCheckInPip } from '../utils/pulseCheckInPip'
import { prefetchPulseLocation } from '../utils/pulseLocation'
import PulseUserAvatar from '../components/PulseUserAvatar'
import './pulse-myspace.css'
import './pulse-antd.css'
import './pulse-overview-portal.css'
import './pulse-live.css'
import './pulse-identity.css'

const { Header, Sider, Content } = AntLayout

const RAIL_TOP = [
  { key: 'home', label: 'Home', Icon: HomeOutlined },
  { key: 'leave', label: 'Leave & Attendance', Icon: CarryOutOutlined },
  { key: 'time', label: 'Timesheet', Icon: AuditOutlined },
  { key: 'performance', label: 'Performance', Icon: RiseOutlined },
  { key: 'payroll', label: 'Payroll', Icon: BankOutlined },
  { key: 'account', label: 'Account', Icon: UserOutlined },
]

const SUB_TABS = [
  { value: 'overview', label: 'Dashboard' },
  // Dashboard — parked on branch `pulse/company-later-services`
  // { value: 'dashboard', label: 'Dashboard' },
  { value: 'calendar', label: 'Calendar' },
]

const LEAVE_SHELL_SUB_TABS = [
  { key: 'leave', label: 'Leave Request' },
  { key: 'attendance', label: 'Attendance' },
]

/** Company More modules — single active label in pulse-sub (like Attendance chrome). */
const COMPANY_SHELL_SUB_TABS = [
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'people', label: 'People' },
  { id: 'companyFiles', label: 'Files' },
  { id: 'leaveTeam', label: 'Team leave' },
  { id: 'leaveHolidays', label: 'Holidays' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'companyTime', label: 'Timesheet' },
  { id: 'companyPerformance', label: 'Performance' },
  { id: 'companyPayroll', label: 'Payroll' },
  { id: 'apps', label: 'App access' },
]

function activeCompanyShellTab({ space, sub, leaveTab, showLeave }) {
  return (
    COMPANY_SHELL_SUB_TABS.find((item) => {
      if (item.id === 'leaveTeam') return Boolean(showLeave && leaveTab === 'team')
      if (item.id === 'leaveHolidays') return Boolean(showLeave && leaveTab === 'holidays')
      if (space !== 'organization') return false
      if (item.id === 'onboarding') return sub === 'onboarding'
      if (item.id === 'people') return sub === 'people'
      if (item.id === 'companyFiles') return sub === 'files'
      if (item.id === 'attendance') return sub === 'attendance'
      if (item.id === 'companyTime') return sub === 'time'
      if (item.id === 'companyPerformance') return sub === 'performance'
      if (item.id === 'companyPayroll') return sub === 'payroll'
      if (item.id === 'apps') return sub === 'apps'
      return false
    }) || null
  )
}

const SAMPLE_APPROVALS = [
  { key: '1', type: 'Leave', subject: 'Casual leave · 21 Aug', from: 'Asha Mehta', status: 'Pending', due: 'Today' },
  { key: '2', type: 'Timesheet', subject: 'Week 33 hours', from: 'You', status: 'Draft', due: 'Today' },
  { key: '3', type: 'Expense', subject: 'Client travel ₹4,200', from: 'Rahul Iyer', status: 'Pending', due: '20 Aug' },
  { key: '4', type: 'Task', subject: 'Offer letter acknowledged', from: 'You', status: 'Approved', due: '18 Aug' },
]

const SAMPLE_TIMESHEET_ROWS = [
  { key: '1', project: 'BDA OS', task: 'Internal product', hours: '32' },
  { key: '2', project: 'HR operations', task: 'Admin / reviews', hours: '8' },
  { key: '3', project: 'BDA OS', task: 'Onboarding checklist', hours: '4' },
  { key: '4', project: 'BDA OS', task: 'Laptop setup notes', hours: '0' },
]

const SAMPLE_LEAVE_BALANCES = [
  { name: 'Casual', used: 0, total: 18, remaining: 18, color: '#556B2F' },
]

const COMPANY_LEAVE_TOTAL = 18

function prettyName(raw) {
  const value = String(raw || '').trim()
  if (!value) return 'there'
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function displayName(user) {
  if (!user) return ''
  return prettyName(
    user?.name?.trim() ||
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      user?.firstName ||
      String(user?.email || 'there').split('@')[0],
  )
}

const HEADER_APP_CAP = 8

function openAssignedApp(app, user) {
  if (!app) return
  if (app.isPulse || app.id === 'pulse' || isBdaOsAppLink(app.to)) {
    window.open(getPulseOpenPath(user), '_blank', 'noopener,noreferrer')
    return
  }
  const url = String(app.url || '').trim()
  if (!url) return
  if (url.startsWith('/') && !url.startsWith('//')) {
    window.location.assign(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

function HeaderAssignedApps({ apps, user }) {
  if (!apps.length) return null
  return (
    <>
      <div className="pulse-head-apps" role="navigation" aria-label="Assigned apps">
        {apps.map((app, index) => (
          <span key={app.id || app.appId || app.url || app.name} className="pulse-head-app-slot">
            {index > 0 ? <span className="pulse-head-app-rule" aria-hidden="true" /> : null}
            <button
              type="button"
              className="pulse-head-app"
              title={app.name}
              aria-label={`Open ${app.name}`}
              onClick={() => openAssignedApp(app, user)}
            >
              {app.iconUrl ? (
                <img src={app.iconUrl} alt="" />
              ) : (
                <span>{String(app.name || '?').charAt(0)}</span>
              )}
            </button>
          </span>
        ))}
      </div>
      <span className="pulse-top-rule" aria-hidden="true" />
    </>
  )
}

function headerCheckInMode(checkedInAt, elapsed) {
  if (checkedInAt) return 'live'
  if (elapsed > 0) return 'paused'
  return 'idle'
}

function HeaderCheckInTimer({ elapsed: elapsedProp, checkedInAt, email, onOpen, onCheckIn, checkBusy }) {
  const [elapsed, setElapsed] = useState(() => Number(elapsedProp) || 0)

  useEffect(() => {
    setElapsed(Number(elapsedProp) || 0)
  }, [elapsedProp, checkedInAt])

  useEffect(() => {
    if (!checkedInAt || !email) return undefined
    const tick = () => {
      const next = getElapsedSeconds(email)
      setElapsed((prev) => (prev === next ? prev : next))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [checkedInAt, email])

  const mode = headerCheckInMode(checkedInAt, elapsed)
  const stamp = formatElapsed(elapsed)
  const idle = mode === 'idle'
  const label =
    mode === 'live'
      ? `On the clock, ${stamp}`
      : mode === 'paused'
        ? `Paused, ${stamp}`
        : 'Check-in'
  return (
    <button
      type="button"
      className={`pulse-head-timer is-${mode}`}
      onClick={() => {
        if (idle && typeof onCheckIn === 'function') {
          onCheckIn()
          return
        }
        onOpen?.()
      }}
      disabled={Boolean(checkBusy)}
      aria-label={label}
      title={label}
    >
      <span className="pulse-head-timer-mark" aria-hidden="true">
        <ClockCircleOutlined className="pulse-head-timer-ico" />
      </span>
      {idle ? (
        <span className="pulse-head-timer-cta">Check-in</span>
      ) : (
        <span className="pulse-head-timer-label">{mode === 'paused' ? 'Paused' : 'Today'}</span>
      )}
      <span className="pulse-head-timer-time" aria-live={mode === 'live' ? 'polite' : 'off'}>
        {stamp}
      </span>
    </button>
  )
}

function presenceName(row) {
  return row?.name || String(row?.email || '').split('@')[0] || 'Employee'
}

function presenceRowKey(row) {
  return String(row?.email || row?.id || '').toLowerCase()
}

/** Instant header counts while the check-in API sync (~1.4s) is still in flight. */
function applySelfPresence(board, selfEmail, status) {
  const email = String(selfEmail || '').toLowerCase()
  if (!email || (status !== 'active' && status !== 'stopped')) return board

  const active = Array.isArray(board.active) ? board.active : []
  const inactive = Array.isArray(board.inactive) ? board.inactive : []
  const fromActive = active.find((row) => presenceRowKey(row) === email)
  const fromInactive = inactive.find((row) => presenceRowKey(row) === email)
  const self = fromActive || fromInactive
  if (!self) return board

  if (status === 'active') {
    if (fromActive) return board
    const nextActive = [...active, self].sort((a, b) => presenceName(a).localeCompare(presenceName(b)))
    const nextInactive = inactive.filter((row) => presenceRowKey(row) !== email)
    return {
      active: nextActive,
      inactive: nextInactive,
      activeCount: nextActive.length,
      inactiveCount: nextInactive.length,
    }
  }

  if (fromInactive) return board
  const nextInactive = [...inactive, self].sort((a, b) => presenceName(a).localeCompare(presenceName(b)))
  const nextActive = active.filter((row) => presenceRowKey(row) !== email)
  return {
    active: nextActive,
    inactive: nextInactive,
    activeCount: nextActive.length,
    inactiveCount: nextInactive.length,
  }
}

function HeaderTeamPresence({ enabled, selfEmail }) {
  const [board, setBoard] = useState({ active: [], inactive: [], activeCount: 0, inactiveCount: 0 })

  useEffect(() => {
    if (!enabled) return undefined
    let live = true
    let syncRefreshTimer = 0

    const load = () => {
      api
        .get('/pulse-checkin/admin/presence')
        .then((res) => {
          if (!live) return
          const data = res.data?.data || {}
          setBoard({
            active: Array.isArray(data.active) ? data.active : [],
            inactive: Array.isArray(data.inactive) ? data.inactive : [],
            activeCount: Number(data.activeCount) || 0,
            inactiveCount: Number(data.inactiveCount) || 0,
          })
        })
        .catch(() => {
          if (!live) return
          setBoard({ active: [], inactive: [], activeCount: 0, inactiveCount: 0 })
        })
    }

    load()
    const timer = window.setInterval(load, 30_000)

    const onCheckInChange = (event) => {
      const email = String(event?.detail?.email || '').toLowerCase()
      const status = event?.detail?.status
      const self = String(selfEmail || '').toLowerCase()
      if (self && email === self) {
        setBoard((prev) => applySelfPresence(prev, self, status))
      }
      // Remote sync is debounced ~1.4s — confirm from server after it lands.
      if (syncRefreshTimer) window.clearTimeout(syncRefreshTimer)
      syncRefreshTimer = window.setTimeout(() => {
        syncRefreshTimer = 0
        load()
      }, 1800)
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }

    window.addEventListener(PULSE_CHECKIN_EVENT, onCheckInChange)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      live = false
      window.clearInterval(timer)
      if (syncRefreshTimer) window.clearTimeout(syncRefreshTimer)
      window.removeEventListener(PULSE_CHECKIN_EVENT, onCheckInChange)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, selfEmail])

  if (!enabled) return null

  const label = `${board.activeCount} active, ${board.inactiveCount} not active`

  const panel = (
    <div className="pulse-head-presence-panel">
      <section className="pulse-head-presence-col is-active" aria-label={`Active ${board.activeCount}`}>
        <header className="pulse-head-presence-h">
          <span>Active</span>
          <em>{board.activeCount}</em>
        </header>
        {board.active.length ? (
          <ul>
            {board.active.map((row) => (
              <li key={row.id}>{presenceName(row)}</li>
            ))}
          </ul>
        ) : (
          <p className="pulse-head-presence-empty">No one checked in</p>
        )}
      </section>
      <section className="pulse-head-presence-col is-idle" aria-label={`Not active ${board.inactiveCount}`}>
        <header className="pulse-head-presence-h">
          <span>Not active</span>
          <em>{board.inactiveCount}</em>
        </header>
        {board.inactive.length ? (
          <ul>
            {board.inactive.map((row) => (
              <li key={row.id}>{presenceName(row)}</li>
            ))}
          </ul>
        ) : (
          <p className="pulse-head-presence-empty">Everyone is active</p>
        )}
      </section>
    </div>
  )

  return (
    <Popover
      trigger="hover"
      placement="bottomRight"
      mouseEnterDelay={0.12}
      mouseLeaveDelay={0.16}
      content={panel}
      rootClassName="pulse-head-presence-pop"
      arrow={false}
      destroyOnHidden
    >
      <button
        type="button"
        className="pulse-head-presence"
        aria-label={label}
      >
        <span className="pulse-head-presence-live">
          <i aria-hidden="true" />
          <strong>{board.activeCount}</strong>
          <span className="pulse-head-presence-cap">active</span>
        </span>
        <span className="pulse-head-presence-sep" aria-hidden="true" />
        <span className="pulse-head-presence-idle">
          <strong>{board.inactiveCount}</strong>
          <span className="pulse-head-presence-cap">not</span>
        </span>
      </button>
    </Popover>
  )
}

/** Pulse My Space — employee home (welcome curtain on first visit). */
export default function PeopleHome() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading } = useAuth()
  const [start] = useState(() => readPulseLocation(window.location.pathname, window.location.search))
  const [bootView] = useState(() => (start.boot ? start : null))
  const [serviceGate, setServiceGate] = useState(() => Boolean(start.boot))
  const [serviceGateLabel, setServiceGateLabel] = useState(() => bootView?.label || 'Opening BDA OS')
  const [serviceGateTick, setServiceGateTick] = useState(0)
  const [space, setSpace] = useState(start.space)
  const [sub, setSub] = useState(start.sub)
  const [module, setModule] = useState(start.module)
  const [leaveTab, setLeaveTab] = useState(
    start.module === 'attendance' || start.leaveTab === 'attendance'
      ? 'attendance'
      : (start.leaveTab || 'mydata'),
  )
  const [leaveSubTab, setLeaveSubTab] = useState('requests')
  const [moreOpen, setMoreOpen] = useState(false)
  const [checkedInAt, setCheckedInAt] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [checkBusy, setCheckBusy] = useState(false)
  // Single gate so chrome can stay up on refresh while welcome still hides chrome on first login.
  // 'boot' → waiting session (shell + pane loader) | 'logo' → full-page | 'welcome' → curtain | 'app' → shell
  const [entryPhase, setEntryPhase] = useState(() => {
    if (bootView) return 'app'
    if (isPulseServicePath(window.location.pathname)) return 'app'
    // After login the user is already in context — decide before first paint.
    if (!loading && user?.email && hasPulseAccount(user)) {
      return hasSeenWelcomeCurtain(user.email) ? 'app' : 'logo'
    }
    // Browser refresh with a token: start in boot so shell chrome mounts with a content-pane loader.
    if (typeof window !== 'undefined' && window.localStorage.getItem('token')) {
      return 'boot'
    }
    return 'boot'
  })
  const [appsOpen, setAppsOpen] = useState(false)
  const [assignedApps, setAssignedApps] = useState([])
  const appsBtnRef = useRef(null)
  const { signingOut, signOutLogo, beginSignOut } = useAccountSignOut({
    onClosePanel: () => setAppsOpen(false),
  })
  const isPulseAdmin = userIsPulseAdmin(user)

  const name = displayName(user)
  const initial = (name.charAt(0) || (user ? 'S' : '')).toUpperCase()
  const sample = getPulseSampleChoice() === '1'
  const hour = new Date().getHours()
  const todaySeconds = Math.max(0, Math.floor(Number(elapsed) || 0))
  const workWeek = usePulseWorkWeek({
    useSample: sample,
    checkedInToday: Boolean(checkedInAt),
    todaySeconds,
  })
  const weekDays = workWeek.days
  const attendanceRows = weekDays.map((day) => ({
    key: day.key,
    day: day.label,
    date: format(day.date, 'd MMM'),
    status: day.status || (day.today ? (checkedInAt ? 'Checked in' : 'Open') : day.present ? 'Present' : '—'),
    hours: day.hours ? `${day.hours}` : '—',
  }))
  const liveTimesheetRows = weekDays
    .filter((day) => (day.present || (day.today && checkedInAt)) && !day.weekend)
    .map((day) => ({
      key: day.key,
      project: 'BDA OS',
      task: format(day.date, 'EEE d MMM'),
      hours: String(day.hours || 0),
    }))
  const approvals = sample ? SAMPLE_APPROVALS : workWeek.approvals
  const timesheetRows = sample ? SAMPLE_TIMESHEET_ROWS : liveTimesheetRows
  const leaveBalances = sample ? SAMPLE_LEAVE_BALANCES : workWeek.leaveBalances
  const weekHours = Math.round(weekDays.reduce((sum, day) => sum + (Number(day.hours) || 0), 0) * 100) / 100
  const casualBalance = Array.isArray(leaveBalances)
    ? leaveBalances.find((row) => row.name === 'Casual')
    : null
  const leaveTaken = Math.max(
    0,
    Math.min(
      COMPANY_LEAVE_TOTAL,
      casualBalance
        ? Number(casualBalance.used) || 0
        : (Array.isArray(leaveBalances) ? leaveBalances : []).reduce(
            (sum, row) => sum + Math.max(0, Number(row.used) || 0),
            0,
          ),
    ),
  )
  const leaveLeft = Math.max(0, COMPANY_LEAVE_TOTAL - leaveTaken)
  const monthPresent = sample ? 18 : (workWeek.month ? Number(workWeek.month.present) || 0 : weekDays.filter((day) => day.present && !day.weekend).length)
  const monthAbsent = sample ? 1 : (workWeek.month ? Number(workWeek.month.absent) || 0 : weekDays.filter((day) => day.status === 'Absent').length)
  const mtdDays = monthPresent + monthAbsent
  const mtdPct = mtdDays > 0 ? Math.round((monthPresent / mtdDays) * 100) : null

  useEffect(() => {
    if (loading || !user) return
    if (!hasPulseAccount(user)) {
      navigate(APP_BASE, { replace: true })
    }
  }, [user, loading, navigate])

  useEffect(() => {
    if (!user?.email) return undefined
    if (Array.isArray(user.assignedApps) && user.assignedApps.length) {
      setAssignedApps(user.assignedApps)
    }
    let cancelled = false
    api
      .get('/launcher/apps', {
        headers: { 'Cache-Control': 'no-cache' },
        params: { t: Date.now() },
      })
      .then((res) => {
        if (cancelled) return
        const list = Array.isArray(res.data?.data?.apps) ? res.data.data.apps : []
        setAssignedApps(list)
      })
      .catch(() => {
        if (cancelled) return
        if (Array.isArray(user.assignedApps)) setAssignedApps(user.assignedApps)
      })
    return () => {
      cancelled = true
    }
  }, [user?.email, user?.assignedAppCount])

  const skipWelcome = Boolean(bootView) || isPulseServicePath(location.pathname)

  useEffect(() => {
    if (!serviceGate) return undefined
    if (loading || !user || !hasPulseAccount(user)) return undefined
    const labelMs = 900
    const timer = window.setTimeout(() => setServiceGate(false), labelMs)
    return () => window.clearTimeout(timer)
  }, [serviceGate, serviceGateTick, loading, user])

  useLayoutEffect(() => {
    if (loading || !user?.email) return
    if (!hasPulseAccount(user)) return

    // Already past welcome (or boot/service open) — never reopen the gate.
    if (entryPhase === 'app' || entryPhase === 'welcome') {
      if (skipWelcome && entryPhase === 'welcome') setEntryPhase('app')
      return
    }

    if (skipWelcome || hasSeenWelcomeCurtain(user.email)) {
      setEntryPhase('app')
      return
    }

    setEntryPhase('logo')
  }, [user, loading, skipWelcome, entryPhase])

  useEffect(() => {
    if (entryPhase !== 'logo') return undefined
    const timer = window.setTimeout(() => setEntryPhase('welcome'), 700)
    return () => window.clearTimeout(timer)
  }, [entryPhase])

  useEffect(() => {
    if (loading) return
    const params = new URLSearchParams(location.search)
    if (params.get('boot') !== '1' && !params.get('open')) return
    const next = readPulseLocation(location.pathname, location.search)
    navigate(next.path, { replace: true })
  }, [loading, location.pathname, location.search, navigate])

  useEffect(() => {
    const next = readPulseLocation(location.pathname, location.search)
    setSpace(next.space)
    setModule(next.module)
    setSub(next.sub)
    if (next.module === 'attendance') setLeaveTab('attendance')
    else if (next.leaveTab && next.leaveTab !== 'attendance') setLeaveTab(next.leaveTab)
    if (next.leaveSubTab) setLeaveSubTab(next.leaveSubTab)
  }, [location.pathname])

  useEffect(() => {
    if (loading || !user) return
    if (!isPulseAdmin && space === 'organization') {
      navigate(PULSE_HOME, { replace: true })
    }
  }, [loading, user, isPulseAdmin, space, navigate])

  useEffect(() => {
    if (space !== 'organization') return
    if (!ORG_OPEN_SUBS.has(sub)) setSub('overview')
  }, [space, sub])

  useEffect(() => {
    if (space === 'myspace' && module === 'home' && sub === 'dashboard') {
      setSub('overview')
    }
  }, [space, module, sub])

  const goShell = (patch) => {
    const next = {
      space,
      module,
      sub,
      leaveTab,
      leaveSubTab,
      ...patch,
    }
    if (patch.space != null) setSpace(patch.space)
    if (patch.module != null) setModule(patch.module)
    if (patch.sub != null) setSub(patch.sub)
    if (patch.leaveTab != null && patch.leaveTab !== 'attendance') setLeaveTab(patch.leaveTab)
    if (patch.leaveSubTab != null) setLeaveSubTab(patch.leaveSubTab)
    const path = pathForShell(next)
    const here = toAppPath(location.pathname.replace(/\/+$/, '') || '/')
    if (path !== here) navigate(path)
  }

  /** Same-tab open with the BDA logo beat (no new tab). */
  const openWithLogo = (patch, label) => {
    // Paint the gate before swapping module content — avoids a one-frame flash.
    flushSync(() => {
      setServiceGateLabel(label || 'Opening BDA OS')
      setServiceGate(true)
      setServiceGateTick((n) => n + 1)
    })
    goShell(patch)
  }

  useEffect(() => {
    if (!user?.email) return undefined
    let live = true
    // Reload/hydrate often stamps an idle gap — don't flash a toast for that.
    let allowInterruptedToast = false
    const readyTimer = window.setTimeout(() => {
      allowInterruptedToast = true
    }, 2500)
    prefetchPulseLocation()
    void rolloverCheckInDayIfNeeded(user.email)
      .then(() => hydrateCheckInFromServer(user.email))
      .finally(() => {
        if (!live) return
        setCheckedInAt(readCheckInAt(user.email))
        setElapsed(getElapsedSeconds(user.email))
      })
    const onChange = (event) => {
      if (event?.detail?.email && event.detail.email !== user.email) return
      const nextAt = event?.detail?.checkedInAt ?? readCheckInAt(user.email)
      const nextElapsed = getElapsedSeconds(user.email)
      setCheckedInAt((prev) => (prev === nextAt ? prev : nextAt))
      setElapsed((prev) => (prev === nextElapsed ? prev : nextElapsed))
      if (event?.detail?.interrupted && allowInterruptedToast) {
        pulseToast.info('Timer paused', 'Your system was asleep or off', { duration: 2500 })
      }
    }
    window.addEventListener(PULSE_CHECKIN_EVENT, onChange)
    return () => {
      live = false
      window.clearTimeout(readyTimer)
      window.removeEventListener(PULSE_CHECKIN_EVENT, onChange)
    }
  }, [user?.email])

  useEffect(() => {
    if (!user?.email) return undefined
    const tick = () => {
      const next = getElapsedSeconds(user.email)
      setElapsed((prev) => (prev === next ? prev : next))
    }
    tick()
    // Live clocks tick locally; parent only syncs work-week metrics occasionally
    if (!checkedInAt) return undefined
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [checkedInAt, user?.email])

  const onCheckIn = async () => {
    if (!user?.email || checkBusy) return
    setCheckBusy(true)
    const isActive = Boolean(readCheckInAt(user.email))
    try {
      if (isActive || checkedInAt) {
        const session = stopCheckIn(user.email)
        closeCheckInPip()
        setCheckedInAt(null)
        const secs = Math.floor((session?.activeMs || getElapsedSeconds(user.email) || 0) / 1000)
        setElapsed(secs)
        pulseToast.success('Checked out', formatElapsed(secs), { duration: 2000 })
      } else {
        closeCheckInPip()
        // Resume from server day total so timer matches calendar (e.g. 3h 45m), not 00:00.
        const hydrated = await hydrateCheckInFromServer(user.email)
        const baseActiveMs = Math.max(
          0,
          Number(hydrated?.activeMs) || 0,
          getElapsedSeconds(user.email) * 1000,
        )
        const resuming = baseActiveMs > 0
        const session = startCheckIn(user.email, Date.now(), { baseActiveMs })
        setCheckedInAt(session?.checkedInAt || Date.now())
        const secs = getElapsedSeconds(user.email)
        setElapsed(secs)
        pulseToast.success(
          resuming ? 'Checked in again' : 'Checked in',
          resuming ? formatElapsed(secs) : format(new Date(), 'h:mm a'),
          { duration: 2000 },
        )
      }
    } finally {
      // Release quickly so the next CTA is not blocked
      window.setTimeout(() => setCheckBusy(false), 700)
    }
  }

  const soon = (label) =>
    pulseToast.info(label, 'Coming soon', { duration: 2500 })

  const openNotesBoard = () => {
    window.open(`${window.location.origin}${APP_NOTES}`, '_blank', 'noopener,noreferrer')
  }

  if (signOutLogo) {
    return <AuthLogoLoader show label="Signing out" />
  }

  const sessionReady = Boolean(user && hasPulseAccount(user) && !loading)
  const hasSessionToken =
    typeof window !== 'undefined' && Boolean(window.localStorage.getItem('token'))

  // First-login logo hold stays full-page so chrome never flashes before welcome.
  if (entryPhase === 'logo') {
    return <AuthLogoLoader show label="Welcome" />
  }

  // No token / no session — full-page (ProtectedRoute usually redirects to login).
  if (!sessionReady && !hasSessionToken) {
    return (
      <AuthLogoLoader
        show
        label={serviceGateLabel || bootView?.label || 'Opening BDA OS'}
      />
    )
  }

  // Refresh / cold load with a token: keep header + sidebar mounted; gate only the content pane.
  const paneGate = Boolean(serviceGate) || !sessionReady || entryPhase === 'boot'
  const showShellContent = sessionReady && entryPhase !== 'boot'

  const showWelcomeCurtain = entryPhase === 'welcome' && Boolean(user?.email)

  const showOverview = space === 'myspace' && module === 'home' && sub === 'overview'
  // Dashboard — parked on `pulse/company-later-services`
  // const showDashboard = space === 'myspace' && module === 'home' && sub === 'dashboard'
  const showCalendar = space === 'myspace' && module === 'home' && sub === 'calendar'
  const showLeave = space === 'myspace' && module === 'leave'
  const showAttendance = space === 'myspace' && module === 'attendance'
  const showAccount = space === 'myspace' && module === 'account'
  const showTimesheet = space === 'myspace' && module === 'time'
  const showPerformance = space === 'myspace' && module === 'performance'
  const showPayroll = space === 'myspace' && module === 'payroll'
  const showOnboarding = space === 'organization' && sub === 'onboarding'
  const showOrgOverview = space === 'organization' && sub === 'overview'
  const showOrgTime = space === 'organization' && sub === 'time'
  const showOrgAttendance = space === 'organization' && sub === 'attendance'
  const showOrgPerformance = space === 'organization' && sub === 'performance'
  const showOrgPayroll = space === 'organization' && sub === 'payroll'
  const showOrgApps = space === 'organization' && sub === 'apps'
  const showOrgPeople = space === 'organization' && sub === 'people'
  const showOrgFiles = space === 'organization' && sub === 'files'
  const showOrgSurface = showOrgOverview || showOnboarding || showOrgTime || showOrgAttendance || showOrgPerformance || showOrgPayroll || showOrgApps || showOrgPeople || showOrgFiles
  const showCompanyLeaveShell = showLeave && (leaveTab === 'team' || leaveTab === 'holidays')
  const showCompanyShell =
    isPulseAdmin &&
    (showOnboarding ||
      showOrgPeople ||
      showOrgFiles ||
      showOrgTime ||
      showOrgAttendance ||
      showOrgPerformance ||
      showOrgPayroll ||
      showOrgApps ||
      showCompanyLeaveShell)
  const liveKind = space === 'myspace' && ({
    onboarding: 'onboarding',
    files: 'files',
    engagement: 'engagement',
    letters: 'letters',
    travel: 'travel',
    tasks: 'tasks',
    compensation: 'compensation',
    operations: 'operations',
    reports: 'reports',
    general: 'additional',
    okr: 'okr',
  }[module])
  const liveProps = {
    name,
    initial,
    email: user?.email,
    weekDays,
    checkedInAt,
    elapsed,
    checkBusy,
    onCheckIn,
    weekHours,
    leaveLeft: sample ? COMPANY_LEAVE_TOTAL : leaveLeft,
    leaveTaken: sample ? 0 : leaveTaken,
    leaveTotal: COMPANY_LEAVE_TOTAL,
    mtdPct: sample ? 96 : mtdPct,
    timesheetRows,
    sample,
    onOpenCalendar: () => goShell({ space: 'myspace', module: 'home', sub: 'calendar' }),
    onOpenTimesheet: () => goShell({ space: 'myspace', module: 'time', sub: 'overview' }),
    onOpenLeave: () => goShell({ space: 'myspace', module: 'leave', sub: 'overview', leaveTab: 'mydata', leaveSubTab: 'requests' }),
  }
  const moduleTitle =
    MORE_SERVICES.find((item) => item.id === module)?.name ||
    RAIL_TOP.find((item) => item.key === module)?.label ||
    'Home'

  const selectRail = (key) => {
    setMoreOpen(false)
    if (key === 'leave') {
      openWithLogo(
        { space: 'myspace', module: 'leave', sub: 'overview', leaveTab: 'mydata', leaveSubTab: 'requests' },
        PULSE_SHELL_VIEWS.leave.label,
      )
      return
    }
    const view = PULSE_SHELL_VIEWS[key]
    openWithLogo(
      { space: 'myspace', module: key, sub: 'overview' },
      view?.label || `Opening ${RAIL_TOP.find((item) => item.key === key)?.label || 'BDA OS'}`,
    )
  }

  const openCompanyService = (key) => {
    const view = PULSE_SHELL_VIEWS[key]
    if (!view) {
      soon('That module')
      return
    }
    openWithLogo(
      {
        space: view.space,
        module: view.module,
        sub: view.sub,
        leaveTab: view.leaveTab,
        leaveSubTab: view.leaveSubTab,
      },
      view.label || `Opening ${key}`,
    )
  }

  const openMoreItem = (item) => {
    setMoreOpen(false)
    if (item.kind === 'company') {
      openCompanyService(item.id)
      return
    }
    goShell({ space: 'myspace', module: item.id, sub: 'overview' })
  }

  const openDashTarget = (target) => {
    setMoreOpen(false)
    if (target === 'overview') {
      goShell({ space: 'myspace', module: 'home', sub: 'overview' })
      return
    }
    if (target === 'calendar') {
      goShell({ space: 'myspace', module: 'home', sub: 'calendar' })
      return
    }
    if (target === 'leave') {
      goShell({ space: 'myspace', module: 'leave', sub: 'overview', leaveTab: 'mydata', leaveSubTab: 'requests' })
      return
    }
    if (target === 'holidays') {
      goShell({ space: 'myspace', module: 'leave', sub: 'overview', leaveTab: 'holidays' })
      return
    }
    if (target === 'attendance') {
      goShell({ space: 'myspace', module: 'attendance', sub: 'overview' })
      return
    }
    if (target === 'hours') {
      goShell({ space: 'myspace', module: 'time', sub: 'overview' })
      return
    }
    if (target === 'tasks') {
      goShell({ space: 'myspace', module: 'tasks', sub: 'overview' })
      return
    }
    soon('That module')
  }

  const orgBoard = (
    <PulseOrganization
      user={user}
      tab={sub}
      onSoon={soon}
      onTab={setSub}
      onOpenService={openCompanyService}
      liveProps={liveProps}
    />
  )

  const railItems = [
    ...RAIL_TOP.map((item) => {
      const Icon = item.Icon
      const leaveHubOn = (module === 'leave' || module === 'attendance') && space === 'myspace' && !moreOpen
      const active = item.key === 'leave'
        ? leaveHubOn
        : module === item.key && space === 'myspace' && !moreOpen
      return {
        key: item.key,
        title: item.label,
        icon: <Icon />,
        active,
        onClick: () => selectRail(item.key),
      }
    }),
    ...(isPulseAdmin
      ? [{
          key: 'more',
          title: 'More',
          icon: <AppstoreOutlined />,
          active: moreOpen || space === 'organization',
          onClick: () => setMoreOpen((open) => !open),
        }]
      : []),
  ]

  const approvalCols = [
    { title: 'Type', dataIndex: 'type', width: 110, render: (v) => <Tag>{v}</Tag> },
    { title: 'Subject', dataIndex: 'subject' },
    { title: 'From', dataIndex: 'from', width: 120 },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 100,
      render: (v) => <Tag color={v === 'Pending' ? 'gold' : v === 'Draft' ? 'blue' : 'green'}>{v}</Tag>,
    },
    { title: 'Due', dataIndex: 'due', width: 90 },
  ]

  return (
    <>
    <AntLayout className={`pulse-shell pulse-id${showOnboarding ? ' is-onboarding' : ''}`}>
      <AuthLogoLoader show={signOutLogo} label="Signing out" />
      <AntLayout className="pulse-chrome">
      <Header className="pulse-top">
        <button
          type="button"
          className="pulse-head-brand"
          aria-label="BDA Technologies home"
          onClick={() => {
            setMoreOpen(false)
            goShell({ space: 'myspace', module: 'home', sub: 'overview' })
          }}
        >
          <img
            src="/bda-logo-header.png"
            alt="BDA Technologies"
            className="pulse-head-brand-mark"
            draggable={false}
          />
        </button>
        <div className="pulse-top-live">
          <HeaderTeamPresence enabled={isPulseAdmin} selfEmail={user?.email} />
          <HeaderCheckInTimer
            elapsed={elapsed}
            checkedInAt={checkedInAt}
            email={user?.email}
            checkBusy={checkBusy}
            onCheckIn={onCheckIn}
            onOpen={() => {
              setMoreOpen(false)
              goShell({ space: 'myspace', module: 'home', sub: 'overview' })
            }}
          />
        </div>
        <div className="pulse-top-tools">
          <HeaderAssignedApps apps={assignedApps.slice(0, HEADER_APP_CAP)} user={user} />
          <div className="pulse-top-actions">
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              arrow={false}
              destroyOnHidden
              rootClassName="pulse-plus-menu"
              getPopupContainer={() => document.body}
              align={{ offset: [0, 10] }}
              styles={{ root: { zIndex: 10000 } }}
              menu={{
                items: [
                  {
                    key: 'notebook',
                    icon: <BookOutlined />,
                    label: 'Notebook',
                    onClick: openNotesBoard,
                  },
                ],
              }}
            >
              <Button className="pulse-plus" type="primary" icon={<PlusOutlined />} aria-label="Quick add" />
            </Dropdown>
            <PulseHeaderSearch
              user={user}
              onOpenView={(view) => {
                setMoreOpen(false)
                goShell({
                  space: view.space,
                  module: view.module,
                  sub: view.sub,
                  leaveTab: view.leaveTab,
                  leaveSubTab: view.leaveSubTab,
                })
              }}
              onOpenModule={(moduleId) => {
                setMoreOpen(false)
                goShell({ space: 'myspace', module: moduleId, sub: 'overview' })
              }}
            />
            <PulseHeaderNotifications
              approvals={approvals}
              onOpenLeave={() => {
                setMoreOpen(false)
                goShell({
                  space: 'myspace',
                  module: 'leave',
                  sub: 'overview',
                  leaveTab: 'mydata',
                  leaveSubTab: 'requests',
                })
              }}
            />
            <PulseAppearanceToggle />
            <button
              type="button"
              ref={appsBtnRef}
              className="pulse-avatar-btn"
              aria-label="Account and apps"
              aria-expanded={appsOpen}
              onClick={() => setAppsOpen(true)}
            >
              <PulseUserAvatar
                className="pulse-avatar"
                size={32}
                src={user?.avatarUrl}
                alt={name}
              >
                {initial}
              </PulseUserAvatar>
            </button>
          </div>
        </div>
      </Header>
      <AppsFlyout
        variant="pulse"
        open={appsOpen}
        onClose={() => { if (!signingOut) setAppsOpen(false) }}
        anchorRef={appsBtnRef}
        signingOut={signingOut}
        onSignOut={beginSignOut}
      />

      <AntLayout className="pulse-mid">
        <AntLayout className={`pulse-maincol${paneGate ? ' is-gate-host' : ''}`}>
          <AuthLogoLoader
            show={paneGate}
            variant="pane"
            label={serviceGateLabel || bootView?.label || 'Opening BDA OS'}
          />
          {!(showAccount || showTimesheet || showPerformance || showPayroll) ? (
          <div
            className={`pulse-sub${
              showOverview ||
              showOrgOverview ||
              showCompanyShell ||
              showCalendar ||
              showLeave ||
              showAttendance
                ? ' pulse-sub-overview'
                : ''
            }`}
            role="tablist"
            aria-label={
              showCompanyShell
                ? 'Company sections'
                : showLeave || showAttendance
                  ? 'Leave & Attendance sections'
                  : space === 'organization'
                    ? 'Company sections'
                    : 'You sections'
            }
          >
            <div className="pulse-sub-tabs">
              {showCompanyShell
                ? (() => {
                    const active = activeCompanyShellTab({
                      space,
                      sub,
                      leaveTab,
                      showLeave,
                    })
                    if (!active) return null
                    return (
                      <button
                        type="button"
                        role="tab"
                        aria-selected
                        className="pulse-sub-tab is-on"
                      >
                        {active.label}
                      </button>
                    )
                  })()
                : space === 'organization'
                ? ORG_TABS.filter((item) => item.key !== 'onboarding').map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      className={`pulse-sub-tab${sub === item.key ? ' is-on' : ''}`}
                      onClick={() => goShell({ space: 'organization', module: 'home', sub: item.key })}
                    >
                      {item.label}
                    </button>
                  ))
                : showLeave || showAttendance
                ? LEAVE_SHELL_SUB_TABS.map((item) => {
                    const isLeave = item.key === 'leave'
                    const isOn = isLeave ? showLeave : showAttendance
                    return (
                      <button
                        key={item.key}
                        type="button"
                        role="tab"
                        className={`pulse-sub-tab${isOn ? ' is-on' : ''}`}
                        onClick={() => {
                          if (isLeave) {
                            goShell({
                              space: 'myspace',
                              module: 'leave',
                              sub: 'overview',
                              leaveTab: 'mydata',
                              leaveSubTab: 'requests',
                            })
                            return
                          }
                          goShell({
                            space: 'myspace',
                            module: 'attendance',
                            sub: 'overview',
                            leaveTab: 'attendance',
                          })
                        }}
                      >
                        {item.label}
                      </button>
                    )
                  })
                : space === 'myspace' && module === 'home'
                ? SUB_TABS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      role="tab"
                      className={`pulse-sub-tab${sub === item.value ? ' is-on' : ''}`}
                      onClick={() => goShell({ space: 'myspace', module: 'home', sub: item.value })}
                    >
                      {item.label}
                    </button>
                  ))
                : (
                    <button type="button" className="pulse-sub-tab is-on">
                      {moduleTitle}
                    </button>
                  )}
            </div>
            {(showOverview) ? <div id="pulse-dash-sub-tools" className="pulse-sub-tools" /> : null}
          </div>
          ) : null}

          <Content className={`pulse-body${showOverview ? ' pulse-body-surface' : ''}${liveKind || (space === 'organization' && !showOrgSurface) ? ' pulse-body-overview' : ''}${showAccount ? ' pulse-body-account' : ''}${space === 'organization' ? ' pulse-body-org' : ''}`}>
            {showShellContent ? (
            <>
            {showAccount ? (
              <div className="pulse-scroll pulse-scroll-plain">
                <AccountPortal embedded />
              </div>
            ) : space === 'organization' && isPulseAdmin ? (
              showOrgOverview ? (
                orgBoard
              ) : showOrgSurface ? (
                <div className="pulse-scroll pulse-scroll-plain">
                  {orgBoard}
                </div>
              ) : (
                <div className="pulse-scroll pulse-scroll-live">
                  {orgBoard}
                </div>
              )
            ) : showCalendar ? (
              <div className="pulse-scroll pulse-scroll-plain">
                <div className="pulse-cal-page">
                  <PulseMySpaceCalendar sample={sample} weekDays={weekDays} checkedInAt={checkedInAt} />
                </div>
              </div>
            ) : showLeave ? (
              <div className="pulse-scroll pulse-scroll-plain">
                <PulseLeaveTracker
                  sample={sample}
                  isAdmin={isPulseAdmin}
                  mainTab={leaveTab}
                  myTab={leaveSubTab}
                  onMyTabChange={setLeaveSubTab}
                  casualBalance={casualBalance || leaveBalances.find((row) => row.name === 'Casual')}
                />
              </div>
            ) : showAttendance ? (
              <div className="pulse-scroll pulse-scroll-plain">
                <PulseLiveModule kind="attendance" scope="me" {...liveProps} />
              </div>
            ) : showTimesheet ? (
              <div className="pulse-scroll pulse-scroll-plain">
                <PulseLiveModule kind="time" scope="me" {...liveProps} />
              </div>
            ) : showPerformance ? (
              <div className="pulse-scroll pulse-scroll-plain">
                <PulseLiveModule kind="performance" scope="me" {...liveProps} />
              </div>
            ) : showPayroll ? (
              <div className="pulse-scroll pulse-scroll-plain">
                <PulseLiveModule kind="payroll" scope="me" {...liveProps} />
              </div>
            ) : liveKind ? (
              <div className="pulse-scroll pulse-scroll-live">
                <PulseLiveModule kind={liveKind} scope="me" {...liveProps} />
              </div>
            ) : !showOverview ? (
              <div className="pulse-soon">
                <Empty description="Coming Soon" />
              </div>
            ) : (
              <PulseOverviewHome
                name={name}
                initial={initial}
                hour={hour}
                user={user}
                sample={sample}
                workWeek={workWeek}
                weekDays={weekDays}
                checkedInAt={checkedInAt}
                elapsed={elapsed}
                checkBusy={checkBusy}
                onCheckIn={onCheckIn}
                isPulseAdmin={isPulseAdmin}
                onOpen={openDashTarget}
                onSoon={soon}
              />
            )}
            </>
            ) : null}
          </Content>
        </AntLayout>

        {showOverview || showOrgSurface || liveKind || showAccount || showCalendar || showLeave || showAttendance || showTimesheet || showPerformance || showPayroll ? null : (
        <Sider className="pulse-sider-right" width={44} theme="light" collapsedWidth={44} trigger={null}>
          <aside className="pulse-aside" aria-label="Shortcuts">
            <button type="button" aria-label="Directory" onClick={() => (isPulseAdmin ? navigate(APP_COMPANY) : soon('Directory'))}><UserAddOutlined /></button>
            {isPulseAdmin ? (
              <button
                type="button"
                aria-label="Onboarding"
                onClick={() => {
                  setMoreOpen(false)
                  openWithLogo(
                    { space: 'organization', module: 'home', sub: 'onboarding' },
                    PULSE_SHELL_VIEWS.onboarding.label,
                  )
                }}
              >
                <RocketOutlined />
              </button>
            ) : null}
            <div className="pulse-aside-gap" />
            <button type="button" aria-label="Accessibility" onClick={() => soon('Accessibility')}><UserOutlined /></button>
            <PulseAppearanceToggle variant="rail" />
          </aside>
        </Sider>
        )}
      </AntLayout>

      <PulseMoreLauncher
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        showCompany={isPulseAdmin}
        onSelect={openMoreItem}
      />
      <PulseSmartChat />
      </AntLayout>
      <PulseFloatingDock
        items={railItems}
      />
    </AntLayout>
    {showWelcomeCurtain ? (
      <PulseWelcomeCurtain
        name={name}
        email={user?.email}
        hour={hour}
        onDone={() => setEntryPhase('app')}
      />
    ) : null}
    </>
  )
}
