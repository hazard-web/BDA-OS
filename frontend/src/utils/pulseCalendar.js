export const NAMED_HOLIDAYS = {
  '2026-01-01': { name: "New Year's Day", kind: 'restricted' },
  '2026-01-14': { name: 'Pongal', kind: 'restricted' },
  '2026-01-26': { name: 'Republic Day', kind: 'company' },
  '2026-03-04': { name: 'Holi', kind: 'restricted' },
  '2026-03-21': { name: 'Eid al-Fitr', kind: 'restricted' },
  '2026-04-03': { name: 'Good Friday', kind: 'restricted' },
  '2026-08-15': { name: 'Independence Day', kind: 'company' },
  '2026-08-26': { name: 'Onam', kind: 'restricted' },
  '2026-09-04': { name: 'Janmashtami', kind: 'restricted' },
  '2026-09-14': { name: 'Ganesh Chaturthi', kind: 'restricted' },
  '2026-10-02': { name: 'Gandhi Jayanti', kind: 'company' },
  '2026-10-20': { name: 'Dussehra', kind: 'restricted' },
  '2026-10-29': { name: 'Diwali', kind: 'restricted' },
  '2026-12-25': { name: 'Christmas', kind: 'restricted' },
  '2027-01-26': { name: 'Republic Day', kind: 'company' },
  '2027-03-03': { name: 'Holi', kind: 'restricted' },
}

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
      map.set(day, list)
    })
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
