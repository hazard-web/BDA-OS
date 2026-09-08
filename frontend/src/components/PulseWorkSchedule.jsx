import { useEffect, useMemo, useState } from 'react'
import api from '../api'
import { PULSE_CHECKIN_EVENT } from '../utils/pulseCheckIn'
import {
  DEFAULT_WORK_DAYS,
  GENERAL_SHIFT,
  buildWeekDays,
  weekRange,
} from '../utils/pulseWorkWeek'

function statusClass(status) {
  if (status === 'Weekend') return 'is-weekend'
  if (status === 'Absent') return 'is-absent'
  if (status === 'Present') return 'is-present'
  if (status === 'On Leave' || status === 'Leave applied') return 'is-leave'
  if (status === 'Holiday') return 'is-holiday'
  return ''
}

function formatLoggedDuration(day) {
  const secs = Math.max(
    0,
    Math.floor(
      Number(day.seconds) >= 0
        ? Number(day.seconds) || 0
        : (Number(day.hours) || 0) * 3600,
    ),
  )
  if (secs <= 0) return null
  if (secs < 60) return `${secs}s`
  const hours = Math.floor(secs / 3600)
  const mins = Math.floor((secs % 3600) / 60)
  if (hours <= 0) return `${mins}m`
  if (mins <= 0) return `${hours}h`
  return `${hours}h ${String(mins).padStart(2, '0')}m`
}

/**
 * Past workday with 0h and no leave → Absent.
 * Leave applied/approved → leave label.
 * Hours logged → show time (seconds when under 1m).
 */
function dayStatusLine(day) {
  if (day.status === 'Weekend') return { text: 'Weekend', kind: 'Weekend' }
  if (day.status === 'Holiday') return { text: 'Holiday', kind: 'Holiday' }
  if (day.onLeave || day.status === 'On Leave' || day.status === 'Leave applied') {
    return { text: day.leaveLabel || day.status || 'On Leave', kind: 'On Leave' }
  }
  if (day.status === 'Absent') return { text: 'Absent', kind: 'Absent' }

  const label = formatLoggedDuration(day)
  if (label) return { text: label, kind: 'Present' }

  // 0 time on a past workday without leave = Absent
  if (day.past && !day.weekend && !day.holiday) {
    return { text: 'Absent', kind: 'Absent' }
  }

  if (day.today) return { text: '—', kind: '' }
  return null
}

function ScheduleMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="9.2" r="2.15" fill="currentColor" />
      <path
        d="M8.4 16.2c.7-2.1 2-3.1 3.6-3.1s2.9 1 3.6 3.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function usePulseWorkWeek({
  useSample = false,
  checkedInToday = false,
  todaySeconds = 0,
  todayHours = 0,
} = {}) {
  const range = useMemo(() => weekRange(new Date()), [])
  const [records, setRecords] = useState([])
  const [workDays, setWorkDays] = useState(DEFAULT_WORK_DAYS)
  const [holidays, setHolidays] = useState([])
  const [leaveDates, setLeaveDates] = useState([])
  const [leaveByDate, setLeaveByDate] = useState({})
  const [leaveBalances, setLeaveBalances] = useState([])
  const [approvals, setApprovals] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [month, setMonth] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(!useSample)

  const load = () => {
    if (useSample) {
      setRecords([])
      setWorkDays(DEFAULT_WORK_DAYS)
      setHolidays([])
      setLeaveDates([])
      setLeaveByDate({})
      setLeaveBalances([])
      setApprovals([])
      setAnnouncements([])
      setMonth(null)
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    api
      .get('/pulse-checkin/overview', { params: { from: range.from, to: range.to } })
      .then((res) => {
        const payload = res.data?.data || {}
        setRecords(Array.isArray(payload.days) ? payload.days : [])
        setWorkDays(
          Array.isArray(payload.workDays) && payload.workDays.length
            ? payload.workDays
            : DEFAULT_WORK_DAYS,
        )
        setHolidays(Array.isArray(payload.holidays) ? payload.holidays : [])
        setLeaveDates(Array.isArray(payload.leaveDates) ? payload.leaveDates : [])
        setLeaveByDate(payload.leaveByDate && typeof payload.leaveByDate === 'object' ? payload.leaveByDate : {})
        setLeaveBalances(Array.isArray(payload.leaveBalances) ? payload.leaveBalances : [])
        setApprovals(Array.isArray(payload.approvals) ? payload.approvals : [])
        setAnnouncements(Array.isArray(payload.announcements) ? payload.announcements : [])
        setMonth(payload.month || null)
        setProfile(payload.profile || null)
      })
      .catch(() => {
        setRecords([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSample, range.from, range.to])

  useEffect(() => {
    if (useSample) return undefined
    const onChange = () => load()
    window.addEventListener(PULSE_CHECKIN_EVENT, onChange)
    return () => window.removeEventListener(PULSE_CHECKIN_EVENT, onChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSample, range.from, range.to, checkedInToday])

  const days = useMemo(
    () =>
      buildWeekDays({
        records,
        workDays,
        checkedInToday,
        leaveDates,
        leaveByDate,
        holidays,
        todaySeconds,
        todayHours,
        useSample,
      }),
    [records, workDays, checkedInToday, leaveDates, leaveByDate, holidays, todaySeconds, todayHours, useSample],
  )

  return {
    days,
    range,
    loading,
    shift: GENERAL_SHIFT,
    leaveBalances,
    approvals,
    announcements,
    month,
    profile,
  }
}

/** Weekly work schedule with shift bar, Weekend / Absent / leave, current day. */
export default function PulseWorkSchedule({ week }) {
  if (!week) return null
  const { days, range, shift } = week

  return (
    <article className="ms-card ms-sched">
      <header className="ms-sched-head">
        <span className="ms-sched-ico" aria-hidden="true">
          <ScheduleMark />
        </span>
        <div className="ms-sched-title">
          <h3>Work Schedule</h3>
          <span>{range.label}</span>
        </div>
      </header>

      <div className="ms-sched-track">
        <div className="ms-shift-bar">
          <i className="ms-shift-accent" aria-hidden="true" />
          <div className="ms-shift-copy">
            <strong>{shift.name}</strong>
            {shift.hours ? <span>{shift.hours}</span> : null}
          </div>
        </div>

        <div className="ms-week" role="list" aria-label="This week">
          <div className="ms-week-rail" aria-hidden="true">
            <span className="ms-week-line" />
          </div>
          {days.map((day) => {
            const line = dayStatusLine(day)
            return (
              <div
                key={day.key}
                className={['ms-day', statusClass(line?.kind || day.status), day.today ? 'is-today' : '']
                  .filter(Boolean)
                  .join(' ')}
                role="listitem"
              >
                <span className="ms-day-dash" aria-hidden="true" />
                <span className="ms-day-dot" aria-hidden="true" />
                <div className="ms-day-label">
                  <span className="ms-day-name">{day.label}</span>
                  <span className="ms-day-num">{day.num}</span>
                  {line ? <small>{line.text}</small> : <small className="is-empty">&nbsp;</small>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </article>
  )
}
