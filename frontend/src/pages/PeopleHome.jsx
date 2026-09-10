import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  AppstoreOutlined,
  AuditOutlined,
  BookOutlined,
  CarryOutOutlined,
  PlusOutlined,
  RocketOutlined,
  SearchOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  App,
  Avatar,
  Button,
  Drawer,
  Dropdown,
  Empty,
  Input,
  Layout as AntLayout,
  List,
  Tag,
  Typography,
} from 'antd'
import api from '../api'
import PeopleOsMark from '../components/PeopleOsMark'
import PulseFloatingDock from '../components/PulseFloatingDock'
import { usePulseWorkWeek } from '../components/PulseWorkSchedule'
// Dashboard — parked on branch `pulse/company-later-services`
// import PulseMySpaceDashboard from '../components/PulseMySpaceDashboard'
import PulseOverviewHome, { PulseStripBackdrop } from '../components/PulseOverviewHome'
import { periodForHour } from '../components/PulseGreetingBanner'
import PulseMySpaceCalendar from '../components/PulseMySpaceCalendar'
import PulseLeaveTracker from '../components/PulseLeaveTracker'
import { MORE_SERVICES } from '../components/PulseMoreLauncher'
import PulseSmartChat from '../components/PulseSmartChat'
import PulseOrganization, { ORG_TABS } from '../components/PulseOrganization'
import PulseAppearanceToggle from '../components/PulseAppearanceToggle'
import { PulseHeaderNotifications, PulseHeaderSearch } from '../components/PulseHeaderTools'
import PulseLiveModule from '../components/PulseLiveWorkspace'
import PulseWelcomeCurtain from '../components/PulseWelcomeCurtain'
import AppsFlyout from '../components/AppsFlyout'
import AccountPortal from './AccountPortal'
import { AuthLogoLoader, useAccountSignOut } from '../components/auth/AuthLogoLoader'
import { isPulseAdmin as userIsPulseAdmin } from '../utils/pulseRoles'
import { useAuth } from '../context/AuthContext'
import { APP_BASE, APP_COMPANY, APP_NOTES, PULSE_HOME, getPulseOpenPath, getPulseSampleChoice, hasPulseAccount, isBdaOsAppLink, toAppPath } from '../utils/pulseEntry'
import { hasSeenWelcomeCurtain } from '../utils/pulseWelcomeCurtain'
import { ORG_OPEN_SUBS, isPulseServicePath, openPulsePage, openPulsePath, pathForShell, readPulseLocation } from '../utils/pulseOpenPage'
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
import './pulse-myspace.css'
import './pulse-antd.css'
import './pulse-overview-portal.css'
import './pulse-live.css'
import './pulse-identity.css'

const { Header, Sider, Content } = AntLayout

const RAIL_TOP = [
  { key: 'home', label: 'Home', Icon: PeopleOsMark },
  { key: 'onboarding', label: 'Onboarding', Icon: RocketOutlined },
  { key: 'leave', label: 'Leave & Attendance', Icon: CarryOutOutlined },
  { key: 'time', label: 'Timesheet', Icon: AuditOutlined },
  { key: 'account', label: 'Account', Icon: UserOutlined },
]

const SUB_TABS = [
  { value: 'overview', label: 'Overview' },
  // Dashboard — parked on branch `pulse/company-later-services`
  // { value: 'dashboard', label: 'Dashboard' },
  { value: 'calendar', label: 'Calendar' },
]

const LEAVE_TABS = [
  { key: 'mydata', label: 'My Data' },
  { key: 'team', label: 'Team' },
  { key: 'attendance', label: 'Attendance' },
  // Holidays — parked on branch `pulse/company-later-services`
  // { key: 'holidays', label: 'Holidays' },
]

const LEAVE_MY_DATA_TABS = [
  { key: 'requests', label: 'Leave Request' },
]

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
  { name: 'Casual', used: 0, total: 12, color: '#1A5F4A' },
  { name: 'Sick', used: 0, total: 12, color: '#2563eb' },
]

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
        {apps.map((app) => (
          <button
            key={app.id || app.appId || app.url || app.name}
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

function HeaderCheckInTimer({ elapsed, checkedInAt, onOpen }) {
  const mode = headerCheckInMode(checkedInAt, elapsed)
  const stamp = formatElapsed(elapsed)
  const label =
    mode === 'live'
      ? `On the clock, ${stamp}`
      : mode === 'paused'
        ? `Paused, ${stamp}`
        : `Check-in, ${stamp}`
  return (
    <button
      type="button"
      className={`pulse-head-timer is-${mode}`}
      onClick={onOpen}
      aria-label={label}
      title={label}
    >
      {mode === 'live' ? <span className="pulse-head-timer-dot" aria-hidden="true" /> : null}
      <span className="pulse-head-timer-time" aria-live={mode === 'live' ? 'polite' : 'off'}>
        {stamp}
      </span>
    </button>
  )
}

/** Pulse My Space — employee home (welcome curtain on first visit). */
export default function PeopleHome() {
  const navigate = useNavigate()
  const location = useLocation()
  const { notification, message } = App.useApp()
  const { user, loading } = useAuth()
  const [start] = useState(() => readPulseLocation(window.location.pathname, window.location.search))
  const [bootView] = useState(() => (start.boot ? start : null))
  const [space, setSpace] = useState(start.space)
  const [sub, setSub] = useState(start.sub)
  const [module, setModule] = useState(start.module)
  const [leaveTab, setLeaveTab] = useState(
    start.module === 'attendance' || start.leaveTab === 'attendance'
      ? 'attendance'
      : start.leaveTab === 'holidays'
        ? 'mydata'
        : (start.leaveTab || 'mydata'),
  )
  const [leaveSubTab, setLeaveSubTab] = useState('requests')
  const [moreOpen, setMoreOpen] = useState(false)
  const [moreQuery, setMoreQuery] = useState('')
  const [checkedInAt, setCheckedInAt] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [checkBusy, setCheckBusy] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [intro, setIntro] = useState(bootView ? 'ready' : 'pending')
  const [appsOpen, setAppsOpen] = useState(false)
  const [assignedApps, setAssignedApps] = useState([])
  const appsBtnRef = useRef(null)
  const { signingOut, signOutLogo, beginSignOut } = useAccountSignOut({
    onClosePanel: () => setAppsOpen(false),
  })
  const isPulseAdmin = userIsPulseAdmin(user)

  const name = displayName(user)
  const initial = (name || 'S').charAt(0).toUpperCase()
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
  const leaveLeft = leaveBalances.reduce((sum, row) => sum + Math.max(0, row.total - row.used), 0)
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
    if (loading || !user?.email) return
    if (!hasPulseAccount(user)) return
    if (skipWelcome || hasSeenWelcomeCurtain(user.email)) {
      setIntro('ready')
      return
    }
    setIntro((prev) => (prev === 'ready' ? prev : 'logo'))
  }, [user, loading, skipWelcome])

  useEffect(() => {
    if (intro !== 'logo') return undefined
    const timer = window.setTimeout(() => {
      setShowWelcome(true)
      setIntro('ready')
    }, 1100)
    return () => window.clearTimeout(timer)
  }, [intro])

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
    else if (next.leaveTab && next.leaveTab !== 'holidays' && next.leaveTab !== 'attendance') setLeaveTab(next.leaveTab)
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
    if (patch.leaveTab != null && patch.leaveTab !== 'holidays') setLeaveTab(patch.leaveTab)
    if (patch.leaveSubTab != null) setLeaveSubTab(patch.leaveSubTab)
    const path = pathForShell(next)
    const here = toAppPath(location.pathname.replace(/\/+$/, '') || '/')
    if (path !== here) navigate(path)
  }

  useEffect(() => {
    if (!user?.email) return undefined
    let live = true
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
      if (event?.detail?.interrupted) {
        message.info({
          content: 'Timer paused while your system was asleep or off',
          className: 'pulse-message',
          duration: 2.5,
        })
      }
    }
    window.addEventListener(PULSE_CHECKIN_EVENT, onChange)
    return () => {
      live = false
      window.removeEventListener(PULSE_CHECKIN_EVENT, onChange)
    }
  }, [user?.email, message])

  useEffect(() => {
    if (!user?.email) return undefined
    const tick = () => {
      const next = getElapsedSeconds(user.email)
      setElapsed((prev) => (prev === next ? prev : next))
    }
    tick()
    if (!checkedInAt) return undefined
    const id = window.setInterval(tick, 1000)
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
        message.success({
          content: `Checked out · ${formatElapsed(secs)}`,
          className: 'pulse-message',
          duration: 2,
        })
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
        message.success({
          content: resuming
            ? `Checked in again · ${formatElapsed(secs)}`
            : `Checked in · ${format(new Date(), 'h:mm a')}`,
          className: 'pulse-message',
          duration: 2,
        })
      }
    } finally {
      // Release quickly so the next CTA is not blocked
      window.setTimeout(() => setCheckBusy(false), 120)
    }
  }

  const soon = (label) =>
    message.info({
      content: `${label} is coming soon`,
      className: 'pulse-message',
      duration: 2.5,
    })

  const openNotesBoard = () => {
    window.open(`${window.location.origin}${APP_NOTES}`, '_blank', 'noopener,noreferrer')
  }

  const moreItems = useMemo(() => {
    const q = moreQuery.trim().toLowerCase()
    if (!q) return MORE_SERVICES
    return MORE_SERVICES.filter((item) => item.name.toLowerCase().includes(q))
  }, [moreQuery])

  if (loading || !user || !hasPulseAccount(user)) {
    if (signOutLogo) return <AuthLogoLoader show label="Signing out" />
    if (bootView) return <div style={{ minHeight: '100vh', background: '#fff' }} aria-hidden="true" />
    return <AuthLogoLoader show label="Opening BDA OS" />
  }

  if (!skipWelcome && !hasSeenWelcomeCurtain(user.email) && (intro === 'pending' || intro === 'logo')) {
    return <AuthLogoLoader show label="Opening BDA OS" />
  }

  const showOverview = space === 'myspace' && module === 'home' && sub === 'overview'
  // Dashboard — parked on `pulse/company-later-services`
  // const showDashboard = space === 'myspace' && module === 'home' && sub === 'dashboard'
  const showCalendar = space === 'myspace' && module === 'home' && sub === 'calendar'
  const showLeave = space === 'myspace' && module === 'leave'
  const showAttendance = space === 'myspace' && module === 'attendance'
  const showAccount = space === 'myspace' && module === 'account'
  const showTimesheet = space === 'myspace' && module === 'time'
  const showOnboarding = space === 'organization' && sub === 'onboarding'
  const showOrgOverview = space === 'organization' && sub === 'overview'
  const showOrgTime = space === 'organization' && sub === 'time'
  const showOrgAttendance = space === 'organization' && sub === 'attendance'
  const showOrgApps = space === 'organization' && sub === 'apps'
  const showOrgPeople = space === 'organization' && sub === 'people'
  const showOrgSurface = showOrgOverview || showOnboarding || showOrgTime || showOrgAttendance || showOrgApps || showOrgPeople
  const liveKind = space === 'myspace' && ({
    onboarding: 'onboarding',
    performance: 'performance',
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
    weekDays,
    checkedInAt,
    elapsed,
    checkBusy,
    onCheckIn,
    weekHours,
    leaveLeft: sample ? 14 : leaveLeft,
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
    if (key === 'more') {
      setSpace('myspace')
      setMoreOpen((open) => !open)
      return
    }
    setMoreOpen(false)
    const path = pathForShell(
      key === 'leave'
        ? { space: 'myspace', module: 'leave', sub: 'overview' }
        : { space: 'myspace', module: key, sub: 'overview' },
    )
    openPulsePath(path)
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
    // Holidays — parked on branch `pulse/company-later-services`
    // if (target === 'holidays') {
    //   goShell({ space: 'myspace', module: 'leave', sub: 'overview', leaveTab: 'holidays' })
    //   return
    // }
    if (target === 'holidays') {
      goShell({ space: 'myspace', module: 'leave', sub: 'overview', leaveTab: 'mydata', leaveSubTab: 'requests' })
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
      liveProps={liveProps}
    />
  )

  const railItems = [
    ...RAIL_TOP.filter((item) => isPulseAdmin || item.key !== 'onboarding').map((item) => {
      const Icon = item.Icon
      const onboardingOn = item.key === 'onboarding' && space === 'organization' && sub === 'onboarding'
      const leaveHubOn = (module === 'leave' || module === 'attendance') && space === 'myspace' && !moreOpen
      const active = item.key === 'more'
        ? moreOpen
        : onboardingOn
          ? !moreOpen
          : item.key === 'leave'
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
    <AntLayout className={`pulse-shell pulse-id${showOnboarding ? ' is-onboarding' : ''}`}>
      <AuthLogoLoader show={signOutLogo} label="Signing out" />
      <AntLayout className="pulse-chrome">
      <Header className="pulse-top">
        {showOnboarding ? (
          <button type="button" className="pulse-space is-on">
            Employee
          </button>
        ) : showAccount ? (
          <button type="button" className="pulse-space is-on">
            Account
          </button>
        ) : showOrgAttendance ? (
          <button type="button" className="pulse-space is-on">
            Attendance
          </button>
        ) : showOrgApps ? (
          <button type="button" className="pulse-space is-on">
            App access
          </button>
        ) : showTimesheet || showOrgTime ? (
          <button type="button" className="pulse-space is-on">
            Timesheet
          </button>
        ) : showLeave || showAttendance ? (
          LEAVE_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`pulse-space${item.key === 'attendance' ? (showAttendance ? ' is-on' : '') : (showLeave && leaveTab === item.key ? ' is-on' : '')}`}
              onClick={() => {
                if (item.key === 'attendance') {
                  goShell({ space: 'myspace', module: 'attendance', sub: 'overview', leaveTab: 'attendance' })
                  return
                }
                goShell({
                  space: 'myspace',
                  module: 'leave',
                  sub: 'overview',
                  leaveTab: item.key,
                  leaveSubTab: item.key === 'mydata' ? 'requests' : leaveSubTab,
                })
              }}
            >
              {item.label}
            </button>
          ))
        ) : (
          <>
            <button
              type="button"
              className={`pulse-space${space === 'myspace' ? ' is-on' : ''}`}
              onClick={() => {
                setMoreOpen(false)
                goShell({ space: 'myspace', module: 'home', sub: 'overview' })
              }}
            >
              You
            </button>
            {isPulseAdmin && (
              <button
                type="button"
                className={`pulse-space${space === 'organization' ? ' is-on' : ''}`}
                onClick={() => {
                  setMoreOpen(false)
                  goShell({ space: 'organization', module: 'home', sub: 'overview' })
                }}
              >
                Company
              </button>
            )}
          </>
        )}
        <div className="pulse-top-tools">
          <HeaderAssignedApps apps={assignedApps.slice(0, HEADER_APP_CAP)} user={user} />
          <HeaderCheckInTimer
            elapsed={elapsed}
            checkedInAt={checkedInAt}
            onOpen={() => {
              setMoreOpen(false)
              goShell({ space: 'myspace', module: 'home', sub: 'overview' })
            }}
          />
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
            className="pulse-avatar-btn"
            aria-label="Assigned apps"
            onClick={() => setAppsOpen(true)}
          >
            {user?.avatarUrl ? (
              <Avatar className="pulse-avatar" size={30} src={user.avatarUrl} referrerPolicy="no-referrer" />
            ) : (
              <Avatar className="pulse-avatar" size={30}>{initial}</Avatar>
            )}
          </button>
          <Button
            type="text"
            ref={appsBtnRef}
            icon={<AppstoreOutlined />}
            aria-label="Open assigned apps"
            aria-expanded={appsOpen}
            onClick={() => setAppsOpen(true)}
          />
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
        <AntLayout className="pulse-maincol">
          {!showAccount && !showOnboarding && !showAttendance && !showTimesheet && !showOrgTime && !showOrgAttendance && !showOrgApps ? (
          <div className={`pulse-sub${showOverview || showOrgOverview || showOrgPeople || showCalendar || showLeave || showAttendance ? ' pulse-sub-overview' : ''}`} role="tablist" aria-label={showLeave ? 'Leave Tracker sections' : space === 'organization' ? 'Company sections' : 'You sections'}>
            <div className="pulse-sub-tabs">
              {space === 'organization'
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
                : showLeave && leaveTab === 'mydata'
                ? LEAVE_MY_DATA_TABS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      className={`pulse-sub-tab${leaveSubTab === item.key ? ' is-on' : ''}`}
                      onClick={() => setLeaveSubTab(item.key)}
                    >
                      {item.label}
                    </button>
                  ))
                : showLeave && leaveTab === 'team'
                ? (
                    <button type="button" className="pulse-sub-tab is-on">On Leave</button>
                  )
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

          <Content className={`pulse-body${showOverview || showCalendar || showLeave || showAttendance || showAccount || showTimesheet || showOrgSurface ? ' pulse-body-surface' : ''}${liveKind || (space === 'organization' && !showOrgSurface) ? ' pulse-body-overview' : ''}${showAccount ? ' pulse-body-account' : ''}${space === 'organization' ? ' pulse-body-org' : ''}`}>
            {showAccount ? (
              <div className="pulse-strip-root">
                <PulseStripBackdrop />
                <div className={`pulse-scroll pulse-scroll-surface pulse-ov-open is-${periodForHour(hour)}`} data-period={periodForHour(hour)}>
                  <AccountPortal embedded />
                </div>
              </div>
            ) : space === 'organization' && isPulseAdmin ? (
              showOrgSurface ? orgBoard : (
                <div className="pulse-scroll pulse-scroll-live">
                  {orgBoard}
                </div>
              )
            ) : showCalendar ? (
              <div className="pulse-strip-root">
                <PulseStripBackdrop />
                <div className={`pulse-scroll pulse-scroll-surface pulse-ov-open is-${periodForHour(hour)}`} data-period={periodForHour(hour)}>
                  <div className="pulse-cal-page">
                    <PulseMySpaceCalendar sample={sample} weekDays={weekDays} checkedInAt={checkedInAt} />
                  </div>
                </div>
              </div>
            ) : showLeave ? (
              <div className="pulse-strip-root">
                <PulseStripBackdrop />
                <div className={`pulse-scroll pulse-scroll-surface pulse-ov-open is-${periodForHour(hour)}`} data-period={periodForHour(hour)}>
                  <PulseLeaveTracker
                    sample={sample}
                    mainTab={leaveTab}
                    myTab={leaveSubTab}
                    onMyTabChange={setLeaveSubTab}
                    casualBalance={leaveBalances.find((row) => row.name === 'Casual')}
                  />
                </div>
              </div>
            ) : showAttendance ? (
              <div className="pulse-strip-root">
                <PulseStripBackdrop />
                <div className={`pulse-scroll pulse-scroll-surface pulse-ov-open is-${periodForHour(hour)}`} data-period={periodForHour(hour)}>
                  <PulseLiveModule kind="attendance" scope="me" {...liveProps} />
                </div>
              </div>
            ) : showTimesheet ? (
              <div className="pulse-strip-root">
                <PulseStripBackdrop />
                <div className={`pulse-scroll pulse-scroll-surface pulse-ov-open is-${periodForHour(hour)}`} data-period={periodForHour(hour)}>
                  <PulseLiveModule kind="time" scope="me" {...liveProps} />
                </div>
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
          </Content>
        </AntLayout>

        {showOverview || showOrgSurface || liveKind || showAccount || showCalendar || showLeave || showAttendance || showTimesheet ? null : (
        <Sider className="pulse-sider-right" width={44} theme="light" collapsedWidth={44} trigger={null}>
          <aside className="pulse-aside" aria-label="Shortcuts">
            <button type="button" aria-label="Directory" onClick={() => (isPulseAdmin ? navigate(APP_COMPANY) : soon('Directory'))}><UserAddOutlined /></button>
            {isPulseAdmin ? (
              <button
                type="button"
                aria-label="Onboarding"
                onClick={() => {
                  setMoreOpen(false)
                  openPulsePage('onboarding')
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

      <Drawer
        title="More services"
        placement="left"
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        extra={<Button type="link" onClick={() => soon('Preferences')}>Preferences</Button>}
      >
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search services"
          value={moreQuery}
          onChange={(e) => setMoreQuery(e.target.value)}
          style={{ marginBottom: 16 }}
        />
        <List
          dataSource={moreItems}
          locale={{ emptyText: 'No matching services' }}
          renderItem={(item) => {
            const Icon = item.Icon
            return (
              <List.Item
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setMoreOpen(false)
                  goShell({ space: 'myspace', module: item.id, sub: 'overview' })
                }}
              >
                <List.Item.Meta avatar={<Avatar style={{ background: '#1A5F4A' }} icon={<Icon />} />} title={item.name} />
              </List.Item>
            )
          }}
        />
      </Drawer>
      <PulseSmartChat />
      {showWelcome && !skipWelcome ? (
        <PulseWelcomeCurtain
          name={name}
          email={user.email}
          hour={hour}
          onDone={() => setShowWelcome(false)}
        />
      ) : null}
      </AntLayout>
      <PulseFloatingDock items={railItems} />
    </AntLayout>
  )
}
