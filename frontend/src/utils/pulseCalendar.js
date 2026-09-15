/** Company holidays come from LeavePolicy via API — no built-in country calendar. */
export const NAMED_HOLIDAYS = {}

export const SAMPLE_TEAM_LEAVE = [
  { id: 's1', name: 'Priya Sharma', initial: 'P', type: 'Casual leave', startDate: '2026-09-11', endDate: '2026-09-11', days: ['2026-09-11'] },
  { id: 's2', name: 'Kabir Rao', initial: 'K', type: 'Sick leave', startDate: '2026-09-08', endDate: '2026-09-08', days: ['2026-09-08'] },
  { id: 's3', name: 'Meera Iyer', initial: 'M', type: 'Casual leave', startDate: '2026-09-21', endDate: '2026-09-22', days: ['2026-09-21', '2026-09-22'] },
]

export function holidayMap(list = []) {
  const map = new Map()
  list.forEach((row) => {
    if (row?.date) map.set(row.date, row)
  })
  return map
}

export function leaveByDay(teamLeave = []) {
  const map = new Map()
  teamLeave.forEach((row) => {
    (row.days || []).forEach((day) => {
      const list = map.get(day) || []
      list.push(row)
    })
    map.set(day, list)
  })
  return map
}

export function clockLabel(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const suffix = hours >= 12 ? 'pm' : 'am'
  const hour12 = hours % 12 || 12
  return `${hour12}:${minutes} ${suffix}`
}

export function hoursLabel(value) {
  const hours = Number(value) || 0
  if (hours <= 0) return '0h'
  const secs = Math.round(hours * 3600)
  if (secs < 60) return `${secs}s`
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h <= 0) return `${m}m`
  if (m <= 0) return `${h}h`
  return `${h}h ${String(m).padStart(2, '0')}m`
}
