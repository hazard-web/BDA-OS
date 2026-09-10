import api from '../api'
import { peekPulseLocation, capturePulseLocation } from './pulseLocation'

function dayKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Sync Pulse check-in events to backend.
 * Briefly waits for city/town when possible so admin activity stores a place name.
 */
export async function syncPulseCheckInEvent(kind, { email, activeMs, date } = {}) {
  try {
    let location = peekPulseLocation()
    const needsPlace =
      location.lat == null ||
      (!location.city && !location.locality && !location.displayName)

    if (needsPlace && (kind === 'check-in' || kind === 'check-out' || kind === 'finalize')) {
      location = await capturePulseLocation(3000, { waitForPlace: true })
    } else if (location.lat == null) {
      void capturePulseLocation(3000)
    }

    const body = {
      email,
      activeMs: Math.max(0, Number(activeMs) || 0),
      date: date || dayKey(),
      location,
    }
    if (kind === 'check-in') {
      const res = await api.post('/pulse-checkin/check-in', body)
      return res.data?.data || null
    } else if (kind === 'check-out') {
      const res = await api.post('/pulse-checkin/check-out', body)
      return res.data?.data || null
    } else if (kind === 'finalize') {
      const res = await api.post('/pulse-checkin/finalize-day', body)
      return res.data?.data || null
    } else if (kind === 'sync') {
      const res = await api.post('/pulse-checkin/sync', body)
      return res.data?.data || null
    }
    return null
  } catch {
    /* offline / unauthorized — keep local session */
    return null
  }
}

export async function fetchTimesheetToday(date) {
  const res = await api.get('/pulse-checkin/timesheet/today', { params: { date: date || dayKey() } })
  return res.data?.data || null
}

export async function fetchPulseWorkDayToday(date) {
  const res = await api.get('/pulse-checkin/today', { params: { date: date || dayKey() } })
  return res.data?.data || null
}

export async function saveTimesheetDraft({ date, entries, email } = {}) {
  const res = await api.put('/pulse-checkin/timesheet/today', {
    date: date || dayKey(),
    email,
    entries,
  })
  return res.data?.data || null
}

export async function submitTimesheet({ date, entries, email } = {}) {
  const res = await api.post('/pulse-checkin/timesheet/submit', {
    date: date || dayKey(),
    email,
    entries,
  })
  return res.data?.data || null
}
