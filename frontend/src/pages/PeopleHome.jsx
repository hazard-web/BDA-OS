import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  AppstoreOutlined,
  AuditOutlined,
  BellOutlined,
  BookOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  PlusOutlined,
  RocketOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  App,
  Avatar,
  Badge,
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
import PulseMySpaceDashboard from '../components/PulseMySpaceDashboard'
import PulseOverviewHome from '../components/PulseOverviewHome'
import PulseMySpaceCalendar from '../components/PulseMySpaceCalendar'
import PulseLeaveTracker from '../components/PulseLeaveTracker'
import { MORE_SERVICES } from '../components/PulseMoreLauncher'
import PulseSmartChat from '../components/PulseSmartChat'
import PulseOrganization, { ORG_TABS } from '../components/PulseOrganization'
import PulseAppearanceToggle from '../components/PulseAppearanceToggle'
import PulseLiveModule from '../components/PulseLiveWorkspace'
import PulseWelcomeCurtain from '../components/PulseWelcomeCurtain'
import AppsFlyout from '../components/AppsFlyout'
import AccountPortal from './AccountPortal'
import BdaGateLoader from '../components/BdaGateLoader'
import { AuthLogoLoader, useAccountSignOut } from '../components/auth/AuthLogoLoader'
import { isPulseAdmin as userIsPulseAdmin } from '../utils/pulseRoles'
import { useAuth } from '../context/AuthContext'
import { getPulseGettingStartedPath, getPulseOpenPath, getPulseSampleChoice, hasPulseAccount, hasPulseSampleChoice } from '../utils/pulseEntry'
import { hasSeenWelcomeCurtain } from '../utils/pulseWelcomeCurtain'
import { ORG_OPEN_SUBS, isPulseServicePath, openPulsePage, readPulseLocation } from '../utils/pulseOpenPage'
import {
  formatElapsed,
  getElapsedSeconds,
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
  { key: 'leave', label: 'Leave', Icon: CalendarOutlined },
  { key: 'attendance', label: 'Attendance', Icon: ClockCircleOutlined },
  { key: 'time', label: 'Hours', Icon: AuditOutlined },
  { key: 'performance', label: 'Performance', Icon: ThunderboltOutlined },
  { key: 'account', label: 'Account', Icon: UserOutlined },
  { key: 'more', label: 'More', Icon: AppstoreOutlined },
]

const SUB_TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'calendar', label: 'Calendar' },
]

const LEAVE_TABS = [
  { key: 'mydata', label: 'My Data' },
  { key: 'team', label: 'Team' },
  { key: 'holidays', label: 'Holidays' },
]

const LEAVE_MY_DATA_TABS = [
  { key: 'summary', label: 'Leave Summary' },
  { key: 'requests', label: 'Leave Requests' },
  { key: 'shift', label: 'Shift' },
]

const SAMPLE_APPROVALS = [
  { key: '1', type: 'Leave', subject: 'Casual leave · 21 Aug', from: 'Asha Mehta', status: 'Pending', due: 'Today' },
  { key: '2', type: 'Timesheet', subject: 'Week 33 hours', from: 'You', status: 'Draft', due: 'Today' },
  { key: '3', type: 'Expense', subject: 'Client travel ₹4,200', from: 'Rahul Iyer', status: 'Pending', due: '20 Aug' },
  { key: '4', type: 'Task', subject: 'Offer letter acknowledged', from: 'You', status: 'Approved', due: '18 Aug' },
]

const SAMPLE_TIMESHEET_ROWS = [
  { key: '1', project: 'People OS', task: 'Internal product', hours: '32' },
  { key: '2', project: 'HR operations', task: 'Admin / reviews', hours: '8' },
  { key: '3', project: 'People OS', task: 'Onboarding checklist', hours: '4' },
  { key: '4', project: 'People OS', task: 'Laptop setup notes', hours: '0' },
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
  if (app.isPulse || app.to === '/pulse' || app.id === 'pulse') {
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

/** Pulse My Space — employee home after Getting Started. */
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
  const [leaveTab, setLeaveTab] = useState(start.leaveTab || 'mydata')
  const [leaveSubTab, setLeaveSubTab] = useState(start.leaveSubTab || 'summary')
  const [activity, setActivity] = useState('Activities')
  const [moreOpen, setMoreOpen] = useState(false)
  const [moreQuery, setMoreQuery] = useState('')
  const [checkedInAt, setCheckedInAt] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [checkBusy, setCheckBusy] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [intro, setIntro] = useState(bootView ? 'ready' : 'pending')
  const [gate, setGate] = useState(Boolean(bootView))
  const [gateOut, setGateOut] = useState(false)
  const [appsOpen, setAppsOpen] = useState(false)
  const [assignedApps, setAssignedApps] = useState([])
  const appsBtnRef = useRef(null)
  const gateStartedAt = useRef(Date.now())
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
      project: 'People OS',
      task: format(day.date, 'EEE d MMM'),
      hours: String(day.hours || 0),
    }))
  const approvals = sample ? SAMPLE_APPROVALS : workWeek.approvals
  const timesheetRows = sample ? SAMPLE_TIMESHEET_ROWS : liveTimesheetRows
  const leaveBalances = sample ? SAMPLE_LEAVE_BALANCES : workWeek.leaveBalances
  const weekHours = Math.round(weekDays.reduce((sum, day) => sum + (Number(day.hours) || 0), 0) * 100) / 100
  const leaveLeft = leaveBalances.reduce((sum, row) => sum + Math.max(0, row.total - row.used), 0)
  const pendingCount = approvals.filter((row) => ['Pending', 'Accepted', 'In Progress'].includes(row.status)).length
  const monthPresent = sample ? 18 : (workWeek.month ? Number(workWeek.month.present) || 0 : weekDays.filter((day) => day.present && !day.weekend).length)
  const monthAbsent = sample ? 1 : (workWeek.month ? Number(workWeek.month.absent) || 0 : weekDays.filter((day) => day.status === 'Absent').length)
  const mtdDays = monthPresent + monthAbsent
  const mtdPct = mtdDays > 0 ? Math.round((monthPresent / mtdDays) * 100) : null

  useEffect(() => {
    if (loading || !user) return
    if (!hasPulseAccount(user) || !hasPulseSampleChoice()) {
      navigate(getPulseGettingStartedPath(user), { replace: true })
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
    if (!hasPulseAccount(user) || !hasPulseSampleChoice()) return
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
    if (!gate || !bootView || loading || !user) return undefined
    if (!hasPulseAccount(user) || !hasPulseSampleChoice()) return undefined
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const minHold = reduce ? 420 : 1680
    const fade = reduce ? 0 : 380
    const paint = reduce ? 0 : 90
    const remain = Math.max(0, minHold - (Date.now() - gateStartedAt.current))
    const outTimer = window.setTimeout(() => setGateOut(true), remain + paint)
    const doneTimer = window.setTimeout(() => setGate(false), remain + paint + fade)
    return () => {
      window.clearTimeout(outTimer)
      window.clearTimeout(doneTimer)
    }
  }, [gate, bootView, loading, user])

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
    if (next.leaveTab) setLeaveTab(next.leaveTab)
    if (next.leaveSubTab) setLeaveSubTab(next.leaveSubTab)
  }, [location.pathname])

  useEffect(() => {
    if (loading || !user) return
    if (!isPulseAdmin && space === 'organization') {
      navigate('/pulse/home', { replace: true })
    }
  }, [loading, user, isPulseAdmin, space, navigate])

  useEffect(() => {
    if (space !== 'organization') return
    if (!ORG_OPEN_SUBS.has(sub)) setSub('overview')
  }, [space, sub])

  useEffect(() => {
    if (!user?.email) return undefined
    let live = true
    prefetchPulseLocation()
    void rolloverCheckInDayIfNeeded(user.email).finally(() => {
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

  const onCheckIn = () => {
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
        const resuming = getElapsedSeconds(user.email) > 0
        const session = startCheckIn(user.email, Date.now())
        setCheckedInAt(session?.checkedInAt || Date.now())
        const secs = getElapsedSeconds(user.email)
        setElapsed(secs)
        message.success({
          content: resuming
            ? `Resumed · ${formatElapsed(secs)}`
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
    window.open(`${window.location.origin}/pulse/notes`, '_blank', 'noopener,noreferrer')
  }

  const moreItems = useMemo(() => {
    const q = moreQuery.trim().toLowerCase()
    if (!q) return MORE_SERVICES
    return MORE_SERVICES.filter((item) => item.name.toLowerCase().includes(q))
  }, [moreQuery])

  if (
    bootView &&
    gate &&
    (loading || !user || !hasPulseAccount(user) || !hasPulseSampleChoice())
  ) {
    return (
      <>
        <BdaGateLoader key="pulse-open-gate" show leaving={gateOut} label={bootView.label} />
      </>
    )
  }

  if (loading || !user || !hasPulseAccount(user) || !hasPulseSampleChoice()) {
    return <AuthLogoLoader show label={signOutLogo ? 'Signing out' : 'Opening Pulse'} />
  }

  if (!skipWelcome && !hasSeenWelcomeCurtain(user.email) && (intro === 'pending' || intro === 'logo')) {
    return <AuthLogoLoader show label="Opening Pulse" />
  }

  const showOverview = space === 'myspace' && module === 'home' && sub === 'overview'
  const showDashboard = space === 'myspace' && module === 'home' && sub === 'dashboard'
  const showCalendar = space === 'myspace' && module === 'home' && sub === 'calendar'
  const showLeave = space === 'myspace' && module === 'leave'
  const showAccount = space === 'myspace' && module === 'account'
  const showOnboarding = space === 'organization' && sub === 'onboarding'
  const showOrgOverview = space === 'organization' && sub === 'overview'
  const liveKind = space === 'myspace' && ({
    onboarding: 'onboarding',
    attendance: 'attendance',
    time: 'time',
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
    onOpenCalendar: () => { setSpace('myspace'); setModule('home'); setSub('calendar') },
    onOpenTimesheet: () => { setSpace('myspace'); setModule('time'); setSub('overview') },
    onOpenLeave: () => { setSpace('myspace'); setModule('leave'); setLeaveTab('mydata'); setLeaveSubTab('summary') },
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
    if (key === 'onboarding' && isPulseAdmin) {
      openPulsePage('onboarding')
      return
    }
    setSpace('myspace')
    if (key === 'time') {
      setModule('time')
      setSub('overview')
      return
    }
    if (key === 'leave') {
      setLeaveTab('mydata')
      setLeaveSubTab('summary')
    }
    setModule(key)
    setSub('overview')
  }

  const openDashTarget = (target) => {
    setMoreOpen(false)
    setSpace('myspace')
    if (target === 'overview') {
      setModule('home')
      setSub('overview')
      return
    }
    if (target === 'calendar') {
      setModule('home')
      setSub('calendar')
      return
    }
    if (target === 'leave') {
      setModule('leave')
      setLeaveTab('mydata')
      setLeaveSubTab('summary')
      return
    }
    if (target === 'holidays') {
      setModule('leave')
      setLeaveTab('holidays')
      return
    }
    if (target === 'attendance') {
      setModule('attendance')
      setSub('overview')
      return
    }
    if (target === 'hours') {
      setModule('time')
      setSub('overview')
      return
    }
    if (target === 'tasks') {
      setModule('tasks')
      setSub('overview')
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
    ...RAIL_TOP.map((item) => {
      const Icon = item.Icon
      const onboardingOn = item.key === 'onboarding' && space === 'organization' && sub === 'onboarding'
      const active = item.key === 'more'
        ? moreOpen
        : onboardingOn
          ? !moreOpen
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
    <>
      {bootView && gate && !signOutLogo ? (
        <BdaGateLoader key="pulse-open-gate" show leaving={gateOut} label={bootView.label} />
      ) : null}
      <div className={bootView && gate ? 'pulse-open-under is-gated' : undefined}>
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
        ) : showLeave ? (
          LEAVE_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`pulse-space${leaveTab === item.key ? ' is-on' : ''}`}
              onClick={() => setLeaveTab(item.key)}
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
                setSpace('myspace')
                setModule('home')
                setSub('overview')
                navigate('/pulse/home')
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
                  setSpace('organization')
                  setModule('home')
                  setSub('overview')
                  navigate('/pulse/company')
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
              setSpace('myspace')
              setModule('home')
              setSub('overview')
              navigate('/pulse/home')
            }}
          />
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            rootClassName="pulse-plus-menu"
            menu={{
              items: [
                { key: 'notebook', icon: <BookOutlined />, label: 'Notebook', onClick: openNotesBoard },
              ],
            }}
          >
            <Button className="pulse-plus" type="primary" icon={<PlusOutlined />} aria-label="Quick add" />
          </Dropdown>
          <Button type="text" icon={<SearchOutlined />} aria-label="Search" onClick={() => soon('Search')} />
          <Badge count={sample ? 3 : pendingCount} size="small">
            <Button type="text" icon={<BellOutlined />} aria-label="Notifications" onClick={() => setActivity('Approvals')} />
          </Badge>
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
          {!showAccount && !showOnboarding && !(showLeave && leaveTab === 'holidays') ? (
          <div className={`pulse-sub${showOverview || showOrgOverview ? ' pulse-sub-overview' : ''}`} role="tablist" aria-label={showLeave ? 'Leave Tracker sections' : space === 'organization' ? 'Organization sections' : 'My Space sections'}>
            <div className="pulse-sub-tabs">
              {space === 'organization'
                ? ORG_TABS.filter((item) => item.key !== 'onboarding').map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      className={`pulse-sub-tab${sub === item.key ? ' is-on' : ''}`}
                      onClick={() => setSub(item.key)}
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
                      onClick={() => setSub(item.value)}
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
            {showDashboard ? <div id="pulse-dash-sub-tools" className="pulse-sub-tools" /> : null}
          </div>
          ) : null}

          <Content className={`pulse-body${showOverview || showOrgOverview || showOnboarding ? ' pulse-body-surface' : ''}${liveKind || showCalendar || (space === 'organization' && !showOrgOverview && !showOnboarding) ? ' pulse-body-overview' : ''}${showDashboard ? ' pulse-body-dash' : ''}${showAccount ? ' pulse-body-account' : ''}${space === 'organization' ? ' pulse-body-org' : ''}`}>
            {showAccount ? (
              <div className="pulse-scroll pulse-scroll-fill">
                <AccountPortal embedded />
              </div>
            ) : space === 'organization' && isPulseAdmin ? (
              showOrgOverview || showOnboarding ? orgBoard : (
                <div className="pulse-scroll pulse-scroll-live">
                  {orgBoard}
                </div>
              )
            ) : showDashboard ? (
              <div className="pulse-scroll pulse-scroll-dash">
                <PulseMySpaceDashboard onSoon={soon} useSample={sample} onOpen={openDashTarget} />
              </div>
            ) : showCalendar ? (
              <div className="pulse-cal-page">
                <PulseMySpaceCalendar sample={sample} weekDays={weekDays} checkedInAt={checkedInAt} />
              </div>
            ) : showLeave ? (
              <PulseLeaveTracker
                sample={sample}
                mainTab={leaveTab}
                myTab={leaveSubTab}
                onMyTabChange={setLeaveSubTab}
                casualBalance={leaveBalances.find((row) => row.name === 'Casual')}
              />
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
              />
            )}
          </Content>
        </AntLayout>

        {showOverview || showOrgOverview || showOnboarding || liveKind || showAccount ? null : (
        <Sider className="pulse-sider-right" width={44} theme="light" collapsedWidth={44} trigger={null}>
          <aside className="pulse-aside" aria-label="Shortcuts">
            <button type="button" aria-label="Directory" onClick={() => (isPulseAdmin ? navigate('/pulse/company') : soon('Directory'))}><UserAddOutlined /></button>
            <button
              type="button"
              aria-label="Onboarding"
              onClick={() => {
                if (isPulseAdmin) {
                  setMoreOpen(false)
                  openPulsePage('onboarding')
                  return
                }
                setModule('onboarding')
                setSpace('myspace')
              }}
            >
              <RocketOutlined />
            </button>
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
                  setSpace('myspace')
                  setModule(item.id)
                  setSub('overview')
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
      </div>
    </>
  )
}
