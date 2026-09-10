import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { App, Button, DatePicker, Input, Modal, Select } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import PulseGlassBoard from './PulseGlassBoard'
import PulseTimesheetForm from './PulseTimesheetForm'
import PulseTimesheetAdmin from './PulseTimesheetAdmin'
import PulseAttendanceAdmin from './PulseAttendanceAdmin'
import PulseInviteAdmin from './PulseInviteAdmin'
import PulseAppGrantsAdmin from './PulseAppGrantsAdmin'
import PulseOnboarding from './PulseOnboarding'
import PulseLeaveTracker from './PulseLeaveTracker'
import api from '../api'
import { getPulseSampleChoice } from '../utils/pulseEntry'
import { PULSE_CHECKIN_EVENT } from '../utils/pulseCheckIn'
import {
  ATTENDANCE_PERIODS,
  DEFAULT_WORK_DAYS,
  buildRangeDays,
  periodRange,
} from '../utils/pulseWorkWeek'
import { hoursLabel } from '../utils/pulseCalendar'

const STORE_KEY = 'pulseLiveBoards.v1'

const STATUS_CYCLE = ['Waiting', 'On track', 'Done']

function readStore() {
  try {
    return JSON.parse(window.localStorage.getItem(STORE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeStore(next) {
  window.localStorage.setItem(STORE_KEY, JSON.stringify(next))
}

function useBoard(key, seed) {
  const [rows, setRows] = useState(() => {
    const saved = readStore()[key]
    return Array.isArray(saved) && saved.length ? saved : seed
  })
  const save = (next) => {
    setRows(next)
    writeStore({ ...readStore(), [key]: next })
  }
  const add = (row) => save([{ key: `${key}-${Date.now()}`, done: false, status: 'Waiting', ...row }, ...rows])
  const cycle = (rowKey) => save(rows.map((row) => {
    if (row.key !== rowKey) return row
    const i = STATUS_CYCLE.indexOf(row.status)
    const status = STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length]
    return { ...row, status, done: status === 'Done' }
  }))
  return { rows, add, cycle }
}

function promptAdd(message, onOk) {
  let value = ''
  Modal.confirm({
    title: message,
    icon: null,
    content: (
      <Input
        autoFocus
        placeholder="Name"
        onChange={(event) => { value = event.target.value }}
      />
    ),
    okText: 'Add',
    onOk: () => {
      const name = value.trim()
      if (!name) return Promise.reject()
      onOk(name)
      return Promise.resolve()
    },
  })
}

function attendanceRows(days, name, checkedInAt) {
  return (days || []).map((day) => {
    const status = day.status || (day.today ? (checkedInAt ? 'Checked in' : 'Open') : day.present ? 'Present' : 'Open')
    return {
      key: day.key,
      task: `${format(day.date, 'EEE')} ${format(day.date, 'd MMM')}`,
      owner: name,
      due: format(day.date, 'd MMM yyyy'),
      status,
      done: Boolean(day.present || day.onLeave || ['Weekend', 'Holiday'].includes(status)),
    }
  })
}

const ATT_PAGE_SIZE = 20

function decorateSampleDay(day, checkedInAt) {
  if (day.weekend) return { ...day, status: 'Weekend', present: false }
  if (day.holiday) return { ...day, status: 'Holiday', present: false }
  if (day.today) {
    const live = Boolean(checkedInAt)
    return { ...day, status: live ? 'Checked in' : 'Open', present: live }
  }
  if (!day.past) return { ...day, status: 'Open', present: false }
  const absent = day.date.getDay() === 1 && day.date.getDate() <= 7
  return {
    ...day,
    status: absent ? 'Absent' : 'Present',
    present: !absent,
    hours: absent ? 0 : 8,
    seconds: absent ? 0 : 8 * 3600,
  }
}

function useAttendanceHistory({ period, custom, sample, checkedInAt, todaySeconds }) {
  const range = useMemo(() => periodRange(period, new Date(), custom), [period, custom])
  const [payload, setPayload] = useState({
    records: [],
    workDays: DEFAULT_WORK_DAYS,
    holidays: [],
    leaveDates: [],
    leaveByDate: {},
  })

  useEffect(() => {
    if (sample) return undefined
    let cancelled = false
    api
      .get('/pulse-checkin/overview', { params: { from: range.from, to: range.to } })
      .then((res) => {
        if (cancelled) return
        const data = res.data?.data || {}
        setPayload({
          records: Array.isArray(data.days) ? data.days : [],
          workDays: Array.isArray(data.workDays) && data.workDays.length ? data.workDays : DEFAULT_WORK_DAYS,
          holidays: Array.isArray(data.holidays) ? data.holidays : [],
          leaveDates: Array.isArray(data.leaveDates) ? data.leaveDates : [],
          leaveByDate: data.leaveByDate && typeof data.leaveByDate === 'object' ? data.leaveByDate : {},
        })
      })
      .catch(() => {
        if (!cancelled) {
          setPayload({
            records: [],
            workDays: DEFAULT_WORK_DAYS,
            holidays: [],
            leaveDates: [],
            leaveByDate: {},
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [sample, range.from, range.to])

  useEffect(() => {
    if (sample) return undefined
    const onChange = () => {
      api
        .get('/pulse-checkin/overview', { params: { from: range.from, to: range.to } })
        .then((res) => {
          const data = res.data?.data || {}
          setPayload({
            records: Array.isArray(data.days) ? data.days : [],
            workDays: Array.isArray(data.workDays) && data.workDays.length ? data.workDays : DEFAULT_WORK_DAYS,
            holidays: Array.isArray(data.holidays) ? data.holidays : [],
            leaveDates: Array.isArray(data.leaveDates) ? data.leaveDates : [],
            leaveByDate: data.leaveByDate && typeof data.leaveByDate === 'object' ? data.leaveByDate : {},
          })
        })
        .catch(() => {})
    }
    window.addEventListener(PULSE_CHECKIN_EVENT, onChange)
    return () => window.removeEventListener(PULSE_CHECKIN_EVENT, onChange)
  }, [sample, range.from, range.to, checkedInAt])

  const days = useMemo(() => {
    const built = buildRangeDays({
      start: range.start,
      end: range.end,
      records: payload.records,
      workDays: payload.workDays,
      checkedInToday: Boolean(checkedInAt),
      leaveDates: payload.leaveDates,
      leaveByDate: payload.leaveByDate,
      holidays: payload.holidays,
      todaySeconds,
      useSample: sample,
    })
    return sample ? built.map((day) => decorateSampleDay(day, checkedInAt)) : built
  }, [range.start, range.end, payload, checkedInAt, todaySeconds, sample])

  return { days, range }
}

function PulseAttendanceBoard({
  name,
  checkedInAt,
  elapsed,
  checkBusy,
  onCheckIn,
  leaveLeft,
  mtdPct,
  sample,
}) {
  const [period, setPeriod] = useState('week')
  const [customRange, setCustomRange] = useState(() => [dayjs().startOf('month'), dayjs()])
  const [page, setPage] = useState(1)
  const custom = useMemo(() => {
    if (period !== 'custom' || !customRange?.[0] || !customRange?.[1]) return null
    return { start: customRange[0].toDate(), end: customRange[1].toDate() }
  }, [period, customRange])
  const { days, range } = useAttendanceHistory({
    period,
    custom,
    sample,
    checkedInAt,
    todaySeconds: Math.max(0, Math.floor(Number(elapsed) || 0)),
  })

  useEffect(() => {
    setPage(1)
  }, [range.from, range.to])

  const rows = useMemo(() => attendanceRows(days, name, checkedInAt), [days, name, checkedInAt])
  const scored = days.filter((day) => !day.weekend && !day.holiday && !day.onLeave && (day.past || (day.today && day.present)))
  const presentCount = scored.filter((day) => day.present).length
  const absentCount = scored.filter((day) => !day.present).length
  const pct = scored.length ? Math.round((presentCount / scored.length) * 100) : mtdPct
  const lastPage = Math.max(1, Math.ceil(rows.length / ATT_PAGE_SIZE))
  const safePage = Math.min(page, lastPage)
  const paged = rows.slice((safePage - 1) * ATT_PAGE_SIZE, safePage * ATT_PAGE_SIZE)
  const start = rows.length === 0 ? 0 : (safePage - 1) * ATT_PAGE_SIZE + 1
  const end = Math.min(safePage * ATT_PAGE_SIZE, rows.length)
  const periodLabel = ATTENDANCE_PERIODS.find((item) => item.value === period)?.label || 'This week'

  return (
    <div className="pulse-att-page">
      <PulseGlassBoard
        lead={(
          <div className="pulse-att-period">
            <Select
              value={period}
              onChange={setPeriod}
              options={ATTENDANCE_PERIODS}
              className="pulse-att-select"
              classNames={{ popup: { root: 'pulse-att-select-dropdown' } }}
              aria-label="Attendance period"
            />
            {period === 'custom' ? (
              <DatePicker.RangePicker
                value={customRange}
                allowClear={false}
                format="DD-MMM-YYYY"
                className="pulse-att-range"
                classNames={{ popup: { root: 'pulse-att-range-dropdown' } }}
                disabledDate={(value) => value && value.isAfter(dayjs(), 'day')}
                onChange={(next) => {
                  if (next?.[0] && next?.[1]) setCustomRange(next)
                }}
              />
            ) : null}
          </div>
        )}
        ctaLabel={checkBusy ? 'Working…' : checkedInAt ? 'Check out' : 'Check in'}
        checkIn
        onCta={onCheckIn}
        metrics={[
          { label: 'Present', value: String(presentCount), hint: `${absentCount} absent` },
          { label: 'Today', value: checkedInAt ? 'In' : 'Out', hint: checkedInAt ? 'Timer running' : 'Day still open' },
          { label: 'Attendance', value: pct == null ? '—' : `${pct}%`, hint: periodLabel },
          { label: 'Leave left', value: String(leaveLeft), hint: 'Days' },
        ]}
        groups={[{
          title: range.label,
          hint: `${rows.length} day${rows.length === 1 ? '' : 's'}`,
          rows: paged,
          empty: 'No attendance in this period.',
        }]}
        extra={rows.length > ATT_PAGE_SIZE ? (
          <div className="pulse-att-pager">
            <span>{start}–{end} of {rows.length}</span>
            <div>
              <Button
                type="text"
                icon={<LeftOutlined />}
                aria-label="Previous page"
                disabled={safePage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              />
              <Button
                type="text"
                icon={<RightOutlined />}
                aria-label="Next page"
                disabled={safePage >= lastPage}
                onClick={() => setPage((value) => Math.min(lastPage, value + 1))}
              />
            </div>
          </div>
        ) : null}
      />
    </div>
  )
}

export default function PulseLiveModule({
  kind,
  scope = 'me',
  name = 'You',
  initial = 'Y',
  weekDays = [],
  checkedInAt,
  elapsed = 0,
  checkBusy,
  onCheckIn,
  weekHours = 0,
  leaveLeft = 0,
  mtdPct,
  timesheetRows = [],
  onOpenCalendar,
  onOpenTimesheet,
  onOpenLeave,
  sample,
}) {
  const { message } = App.useApp()
  const org = scope === 'org'
  const demo = sample ?? getPulseSampleChoice() === '1'

  const files = useBoard(org ? 'org-files' : 'files', [
    { key: 'f1', task: 'Offer letter — signed', owner: name, due: '16 Jul', status: 'Done', done: true },
    { key: 'f2', task: 'ID proof pack', owner: name, due: '18 Jul', status: 'On track', done: true },
    { key: 'f3', task: 'Employee handbook', owner: 'HR', due: '22 Jul', status: 'Waiting', done: false },
  ])
  const engagement = useBoard(org ? 'org-engage' : 'engage', [
    { key: 'e1', task: 'Kudos to Priya — design review', owner: name, due: 'Today', status: 'Done', done: true },
    { key: 'e2', task: 'Weekly pulse survey', owner: 'People', due: 'Friday', status: 'On track', done: false },
    { key: 'e3', task: 'Team lunch poll', owner: 'Ops', due: '22 Sep', status: 'Waiting', done: false },
  ])
  const letters = useBoard(org ? 'org-letters' : 'letters', [
    { key: 'l1', task: 'Experience letter request', owner: name, due: '12 Sep', status: 'Waiting', done: false },
    { key: 'l2', task: 'Address proof letter', owner: 'HR', due: '5 Sep', status: 'Done', done: true },
  ])
  const travel = useBoard(org ? 'org-travel' : 'travel', [
    { key: 't1', task: 'Bengaluru client visit', owner: name, due: '18 Sep', status: 'On track', done: false },
    { key: 't2', task: 'Cab + hotel draft', owner: 'Admin', due: '16 Sep', status: 'Waiting', done: false },
  ])
  const tasks = useBoard(org ? 'org-tasks' : 'tasks', [
    { key: 'k1', task: 'Close week timesheet', owner: name, due: 'Friday', status: 'Waiting', done: false },
    { key: 'k2', task: 'Update emergency contacts', owner: name, due: '10 Sep', status: 'On track', done: false },
    { key: 'k3', task: 'Laptop return checklist', owner: 'IT', due: '—', status: 'Automated', done: false },
  ])
  const compensation = useBoard(org ? 'org-comp' : 'comp', [
    { key: 'c1', task: 'August payslip', owner: 'Finance', due: '1 Sep', status: 'Paid', done: true },
    { key: 'c2', task: 'September cycle', owner: 'Finance', due: '30 Sep', status: 'On track', done: false },
  ])
  const performance = useBoard(org ? 'org-perf' : 'perf', [
    { key: 'p1', task: 'Q3 goal: ship BDA OS live', owner: name, due: '30 Sep', status: 'On track', done: false },
    { key: 'p2', task: 'Manager 1:1 notes', owner: name, due: 'Every 2 weeks', status: 'Done', done: true },
    { key: 'p3', task: 'Peer feedback round', owner: org ? 'People' : name, due: '15 Sep', status: 'Waiting', done: false },
  ])
  const onboard = useBoard('me-onboard', [
    { key: 'o1', task: 'Complete profile', owner: name, due: 'Day 1', status: 'On track', done: false },
    { key: 'o2', task: 'Upload ID documents', owner: name, due: 'Day 2', status: 'Waiting', done: false },
    { key: 'o3', task: 'Read handbook', owner: 'HR', due: 'Day 3', status: 'Done', done: true },
    { key: 'o4', task: 'Meet your manager', owner: name, due: 'First week', status: 'Waiting', done: false },
  ])
  const policies = useBoard('org-policies', [
    { key: 'pol1', task: 'Leave policy 2026', owner: 'HR', due: 'Published', status: 'Done', done: true },
    { key: 'pol2', task: 'WFO / hybrid note', owner: 'People', due: 'Review', status: 'On track', done: false },
  ])
  const depts = useBoard('org-depts', [
    { key: 'd1', task: 'People', owner: 'HR Manager', due: 'Active', status: 'Done', done: true },
    { key: 'd2', task: 'Product', owner: 'Design lead', due: 'Active', status: 'On track', done: false },
    { key: 'd3', task: 'Engineering', owner: 'Tech lead', due: 'Active', status: 'On track', done: false },
  ])

  const week = attendanceRows(weekDays, name, checkedInAt)
  const present = week.filter((row) => row.done).length
  const absent = week.filter((row) => String(row.status).toLowerCase() === 'absent').length
  const addNamed = (board, prefix) => {
    promptAdd(`Add ${prefix}`, (title) => {
      board.add({ task: title, owner: name, due: 'Today', status: 'Waiting' })
      message.success('Added')
    })
  }

  if (kind === 'attendance') {
    if (org) {
      return <PulseAttendanceAdmin />
    }
    return (
      <PulseAttendanceBoard
        name={name}
        checkedInAt={checkedInAt}
        elapsed={elapsed}
        checkBusy={checkBusy}
        onCheckIn={onCheckIn}
        leaveLeft={leaveLeft}
        mtdPct={mtdPct}
        sample={demo}
      />
    )
  }

  if (kind === 'time' || kind === 'timesheet') {
    if (org) {
      return <PulseTimesheetAdmin />
    }
    return (
      <div className="pulse-ts-page">
        <PulseTimesheetForm
          name={name}
          checkedInAt={checkedInAt}
          elapsed={elapsed}
          weekHours={weekHours}
          timesheetRows={timesheetRows}
          sample={demo}
        />
      </div>
    )
  }

  if (kind === 'performance') {
    return (
      <PulseGlassBoard
        title="Performance"
        kicker={org ? 'Team goals' : 'Your goals'}
        ctaLabel="Add goal"
        onCta={() => addNamed(performance, 'goal')}
        metrics={[
          { label: 'Goals', value: String(performance.rows.length), hint: 'This cycle' },
          { label: 'Done', value: String(performance.rows.filter((row) => row.done).length), hint: 'Closed' },
          { label: 'Waiting', value: String(performance.rows.filter((row) => row.status === 'Waiting').length), hint: 'Needs you' },
          { label: 'Review', value: 'Q3', hint: 'Sep close' },
        ]}
        groups={[{ title: org ? 'Team' : 'My goals', hint: 'Tap a row to move status', rows: performance.rows }]}
        onRow={(row) => performance.cycle(row.key)}
      />
    )
  }

  if (kind === 'onboarding') {
    if (org) {
      return (
        <PulseGlassBoard title="Onboarding" kicker="Employees" extra={<div className="plive-nested"><PulseOnboarding /></div>} />
      )
    }
    return (
      <PulseGlassBoard
        title="Onboarding"
        kicker={`Welcome, ${name}`}
        ctaLabel={checkedInAt ? 'Checked in' : 'Start Day 1'}
        checkIn={!checkedInAt}
        onCta={checkedInAt ? undefined : onCheckIn}
        metrics={[
          { label: 'Tasks', value: `${onboard.rows.filter((row) => row.done).length}/${onboard.rows.length}`, hint: 'Completed' },
          { label: 'Today', value: initial, hint: 'You' },
          { label: 'Buddy', value: 'HR', hint: 'People team' },
          { label: 'Week', value: '1', hint: 'First week' },
        ]}
        groups={[{ title: 'Your checklist', hint: 'Tap to update', rows: onboard.rows }]}
        onRow={(row) => onboard.cycle(row.key)}
      />
    )
  }

  if (kind === 'files') {
    return (
      <PulseGlassBoard
        title="Files"
        kicker={org ? 'Company files' : 'My documents'}
        ctaLabel="Add file"
        onCta={() => addNamed(files, 'file')}
        groups={[{ title: 'Documents', hint: 'Tap to mark done', rows: files.rows }]}
        onRow={(row) => files.cycle(row.key)}
      />
    )
  }

  if (kind === 'engagement') {
    return (
      <PulseGlassBoard
        title="Employee engagement"
        kicker={org ? 'Org pulse' : 'Your voice'}
        ctaLabel="Give kudos"
        onCta={() => addNamed(engagement, 'kudos')}
        groups={[{ title: 'This month', hint: 'Tap to update', rows: engagement.rows }]}
        onRow={(row) => engagement.cycle(row.key)}
      />
    )
  }

  if (kind === 'letters') {
    return (
      <PulseGlassBoard
        title="HR letters"
        kicker={org ? 'Issue letters' : 'Requests'}
        ctaLabel="New request"
        onCta={() => addNamed(letters, 'letter')}
        groups={[{ title: 'Letters', hint: 'Tap to update', rows: letters.rows }]}
        onRow={(row) => letters.cycle(row.key)}
      />
    )
  }

  if (kind === 'travel') {
    return (
      <PulseGlassBoard
        title="Travel"
        kicker={org ? 'Team trips' : 'My trips'}
        ctaLabel="New trip"
        onCta={() => addNamed(travel, 'trip')}
        groups={[{ title: 'Trips', hint: 'Tap to update', rows: travel.rows }]}
        onRow={(row) => travel.cycle(row.key)}
      />
    )
  }

  if (kind === 'tasks') {
    return (
      <PulseGlassBoard
        title="Tasks"
        kicker={org ? 'Assigned work' : 'On you'}
        ctaLabel="Add task"
        onCta={() => addNamed(tasks, 'task')}
        groups={[{ title: 'Open', hint: 'Tap to move status', rows: tasks.rows }]}
        onRow={(row) => tasks.cycle(row.key)}
      />
    )
  }

  if (kind === 'compensation') {
    return (
      <PulseGlassBoard
        title="Compensation"
        kicker={org ? 'Payroll cycle' : 'My pay'}
        groups={[{ title: 'Payslips', hint: demo ? 'Sample cycle' : 'Latest runs', rows: compensation.rows }]}
        onRow={(row) => compensation.cycle(row.key)}
      />
    )
  }

  if (kind === 'apps' || kind === 'app-access') {
    return <PulseGlassBoard title="App access" kicker="Grants" extra={<div className="plive-nested"><PulseAppGrantsAdmin /></div>} />
  }

  if (kind === 'general' || kind === 'additional') {
    return (
      <PulseGlassBoard
        title="Additional"
        kicker="People, invites, extras"
        extra={<div className="plive-nested"><PulseInviteAdmin /></div>}
      />
    )
  }

  if (kind === 'leave') {
    if (org) {
      return (
        <PulseGlassBoard
          title="Leave tracker"
          kicker="Company"
          ctaLabel="Open leave"
          onCta={onOpenLeave}
          extra={(
            <div className="plive-nested">
              <PulseLeaveTracker
                sample={demo}
                mainTab="mydata"
                myTab="requests"
                onMyTabChange={() => {}}
              />
            </div>
          )}
        />
      )
    }
    return null
  }

  if (kind === 'reports' || kind === 'operations' || kind === 'okr') {
    const title = kind === 'okr' ? 'OKR' : kind === 'operations' ? 'Operations' : 'Reports'
    return (
      <PulseGlassBoard
        title={title}
        kicker="Live snapshot"
        metrics={[
          { label: 'Attendance', value: mtdPct == null ? '—' : `${mtdPct}%`, hint: 'MTD' },
          { label: 'Hours', value: hoursLabel(weekHours), hint: 'This week' },
          { label: 'Leave', value: String(leaveLeft), hint: 'Days left' },
          { label: 'Open items', value: String(tasks.rows.filter((row) => !row.done).length), hint: 'Tasks' },
        ]}
        groups={[
          { title: 'This week', hint: 'Attendance', rows: week },
          { title: 'Follow-ups', hint: 'Tap to update', rows: tasks.rows },
        ]}
        onRow={(row) => tasks.cycle(row.key)}
      />
    )
  }

  if (kind === 'policies') {
    return (
      <PulseGlassBoard
        title="Policies"
        kicker="Published"
        ctaLabel="Add policy"
        onCta={() => addNamed(policies, 'policy')}
        groups={[{ title: 'Library', hint: 'Tap to update', rows: policies.rows }]}
        onRow={(row) => policies.cycle(row.key)}
      />
    )
  }

  if (kind === 'departments') {
    return (
      <PulseGlassBoard
        title="Department tree"
        kicker="Teams"
        ctaLabel="Add team"
        onCta={() => addNamed(depts, 'department')}
        groups={[{ title: 'Departments', hint: 'Tap to update', rows: depts.rows }]}
        onRow={(row) => depts.cycle(row.key)}
      />
    )
  }

  if (kind === 'birthdays') {
    return (
      <PulseGlassBoard
        title="Birthdays"
        kicker="This month"
        groups={[{
          title: 'Folks',
          rows: demo ? [
            { key: 'b1', task: 'Priya Sharma', owner: 'Design', due: 'Today', status: 'Done', done: true },
            { key: 'b2', task: 'Amit Verma', owner: 'Engineering', due: '22 Sep', status: 'On track', done: false },
          ] : [],
          empty: 'No birthdays this month.',
        }]}
      />
    )
  }

  if (kind === 'new-hires') {
    return (
      <PulseGlassBoard
        title="New hires"
        kicker="Recent joins"
        groups={[{
          title: 'Joining',
          rows: demo ? [
            { key: 'n1', task: 'Ananya Gupta', owner: 'Product', due: '11 Aug', status: 'On track', done: false },
          ] : [],
          empty: 'No new hires to show.',
        }]}
      />
    )
  }

  return (
    <PulseGlassBoard
      title="Workspace"
      kicker="BDA OS"
      groups={[{ title: 'Ready', rows: tasks.rows }]}
    />
  )
}

export function PulseAnnouncementsBoard({ name = 'HR' }) {
  const { message } = App.useApp()
  const board = useBoard('org-announce', [
    { key: 'a1', task: 'Independence Day — office closed', owner: name, due: '15 Aug', status: 'Done', done: true },
    { key: 'a2', task: 'Update emergency contacts', owner: 'People', due: 'Open', status: 'On track', done: false },
  ])
  return (
    <PulseGlassBoard
      title="Announcements"
      kicker="Company"
      ctaLabel="New"
      onCta={() => {
        promptAdd('Announcement title', (title) => {
          board.add({ task: title, owner: name, due: 'Today', status: 'On track' })
          message.success('Posted')
        })
      }}
      groups={[{ title: 'Feed', hint: 'Tap to close', rows: board.rows }]}
      onRow={(row) => board.cycle(row.key)}
    />
  )
}
