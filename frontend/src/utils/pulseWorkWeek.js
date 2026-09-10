import { addDays, format, isToday, startOfDay, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { pulseDayKey } from './pulseCheckIn'

export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]
export const GENERAL_SHIFT = {
  name: 'General',
  hours: 'Complete 9 hours daily',
}

export function weekStart(date = new Date()) {
  return startOfWeek(date, { weekStartsOn: 0 })
}

function labeledRange(start, end) {
  return {
    start,
    end,
    from: pulseDayKey(start),
    to: pulseDayKey(end),
    label: `${format(start, 'dd-MMM-yyyy')} - ${format(end, 'dd-MMM-yyyy')}`,
  }
}

export function weekRange(date = new Date()) {
  const start = weekStart(date)
  return labeledRange(start, addDays(start, 6))
}

export const ATTENDANCE_PERIODS = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: '2m', label: 'Last 2 months' },
  { value: '3m', label: 'Last 3 months' },
  { value: 'custom', label: 'Custom' },
]

export function periodRange(period = 'month', date = new Date(), custom) {
  const today = startOfDay(date)
  if (period === 'custom' && custom?.start && custom?.end) {
    const start = startOfDay(custom.start)
    const end = startOfDay(custom.end)
    return start <= end ? labeledRange(start, end) : labeledRange(end, start)
  }
  if (period === 'week') return weekRange(date)
  const monthsBack = period === '2m' ? 1 : period === '3m' ? 2 : 0
  return labeledRange(startOfMonth(subMonths(today, monthsBack)), today)
}

function hoursFromMs(ms) {
  return Math.max(0, Number(ms) || 0) / 3_600_000
}

function secondsFromHours(hours) {
  return Math.max(0, Math.floor((Number(hours) || 0) * 3600))
}

/** Present only when real time is logged (or actively checked in today). */
function isPresent(record, todayCheckedIn, today, seconds = 0) {
  if (Number(seconds) > 0) return true
  if (today && todayCheckedIn) return true
  if (!record) return false
  if (Number(record.totalActiveMs) > 0) return true
  if (Number(record.totalActiveHours) > 0) return true
  return record.status === 'active'
}

function buildOneDay(date, {
  byDate,
  leaveSet,
  holidaySet,
  leaveByDate,
  workDays,
  checkedInToday,
  todayStart,
  liveSeconds,
  useSample,
}) {
  const key = pulseDayKey(date)
  const record = byDate.get(key)
  const weekend = !workDays.includes(date.getDay())
  const today = isToday(date)
  const past = startOfDay(date) < todayStart
  const leaveInfo = leaveByDate?.[key] || null
  const onLeave = Boolean(leaveInfo) || leaveSet.has(key)
  const holiday = !weekend && holidaySet.has(key)

  const loggedMs = Number(record?.totalActiveMs) || 0
  const loggedSeconds = loggedMs > 0
    ? Math.floor(loggedMs / 1000)
    : secondsFromHours(Number(record?.totalActiveHours) || hoursFromMs(loggedMs))
  const seconds = today ? Math.max(loggedSeconds, liveSeconds) : loggedSeconds
  const hours = seconds / 3600
  const present = isPresent(record, checkedInToday, today, seconds)

  let status = null
  if (weekend) status = 'Weekend'
  else if (holiday) status = 'Holiday'
  else if (onLeave) status = leaveInfo?.label || 'On Leave'
  else if (past && seconds <= 0) status = 'Absent'

  if (useSample && date.getDay() === 1 && past && !today && !weekend && !onLeave) {
    status = 'Absent'
  }

  return {
    key,
    date,
    label: format(date, 'EEE'),
    num: format(date, 'd'),
    weekend,
    today,
    past,
    present: present && seconds > 0,
    onLeave,
    leaveLabel: leaveInfo?.label || (onLeave ? 'On Leave' : null),
    leaveStatus: leaveInfo?.status || null,
    holiday,
    status,
    hours,
    seconds,
    record,
  }
}

/**
 * Build calendar days between start and end, inclusive.
 * Past workday with 0s and no leave → Absent.
 * Leave applied/approved → leave label (never Absent).
 */
export function buildRangeDays({
  start,
  end,
  records = [],
  workDays = DEFAULT_WORK_DAYS,
  checkedInToday = false,
  leaveDates = [],
  leaveByDate = {},
  holidays = [],
  todaySeconds = 0,
  todayHours = 0,
  useSample = false,
  now = new Date(),
} = {}) {
  const byDate = new Map((records || []).map((row) => [row.date, row]))
  const leaveSet = new Set(leaveDates)
  const holidaySet = new Set(holidays)
  const todayStart = startOfDay(now)
  const liveSeconds = Math.max(
    0,
    Math.floor(Number(todaySeconds) || 0),
    secondsFromHours(todayHours),
  )
  const first = startOfDay(start || weekStart(now))
  const last = startOfDay(end || addDays(first, 6))
  const ctx = {
    byDate,
    leaveSet,
    holidaySet,
    leaveByDate,
    workDays,
    checkedInToday,
    todayStart,
    liveSeconds,
    useSample,
  }

  const days = []
  for (let date = first; date <= last; date = addDays(date, 1)) {
    days.push(buildOneDay(date, ctx))
  }
  return days
}

export function buildWeekDays(opts = {}) {
  const now = opts.now || new Date()
  const start = weekStart(now)
  return buildRangeDays({
    ...opts,
    start,
    end: addDays(start, 6),
    now,
  })
}
