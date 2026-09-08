import { addDays, format, isToday, startOfDay, startOfWeek } from 'date-fns'
import { pulseDayKey } from './pulseCheckIn'

export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]
export const GENERAL_SHIFT = {
  name: 'General',
  hours: 'Complete 9 hours daily',
}

export function weekStart(date = new Date()) {
  return startOfWeek(date, { weekStartsOn: 0 })
}

export function weekRange(date = new Date()) {
  const start = weekStart(date)
  return {
    start,
    end: addDays(start, 6),
    from: pulseDayKey(start),
    to: pulseDayKey(addDays(start, 6)),
    label: `${format(start, 'dd-MMM-yyyy')} - ${format(addDays(start, 6), 'dd-MMM-yyyy')}`,
  }
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

/**
 * Build 7 calendar days.
 * Past workday with 0s and no leave → Absent.
 * Leave applied/approved → leave label (never Absent).
 */
export function buildWeekDays({
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
  const start = weekStart(now)
  const liveSeconds = Math.max(
    0,
    Math.floor(Number(todaySeconds) || 0),
    secondsFromHours(todayHours),
  )

  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i)
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
  })
}
