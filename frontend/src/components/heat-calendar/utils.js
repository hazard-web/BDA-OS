/** Heat Calendar utils — from beui @beui/heat-calendar (MIT). */

export const STEPS = [0, 40, 58, 76, 96]
export const EMPTY = 'color-mix(in srgb, var(--pulse-heading, #183b35) 8%, transparent)'
/** Heat hue — teal, distinct from empty gray and primary CTA green. */
export const HEAT_COLOR = 'var(--pulse-heat, #0f766e)'
export const CELL = 16
export const GAP = 4
export const PITCH = CELL + GAP
export const MONTH_ROW = 12
export const DAYS = Array.from({ length: 7 }, (_, d) => ({ id: `d${d}`, d }))
export const LIFT = [1.3, 1.08, 1.03]

export const EASE_OUT = [0.16, 1, 0.3, 1]
export const SPRING_PRESS = { type: 'spring', stiffness: 500, damping: 30, mass: 0.6 }

export const startOfDay = (d) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Monday on or before `d` (local). Columns read Mon → Sun. */
export const mondayOf = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7))

export const dayKey = (d) => {
  const x = startOfDay(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const fmtDay = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

export const fmtMonth = new Intl.DateTimeFormat('en-US', { month: 'short' })

export const fmtRange = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

/**
 * Build `values[week][day]` intensities 0..1 from YYYY-MM-DD → hours.
 */
export function hoursToHeatValues(hoursByDay, { weeks = 16, endDate, maxHours = 10 } = {}) {
  const end = startOfDay(endDate || new Date())
  const start = addDays(mondayOf(end), -(weeks - 1) * 7)
  const values = []
  for (let w = 0; w < weeks; w += 1) {
    const row = []
    for (let d = 0; d < 7; d += 1) {
      const date = addDays(start, w * 7 + d)
      if (date > end) {
        row.push(0)
        continue
      }
      const key = dayKey(date)
      const hours = Number(hoursByDay[key]) || 0
      row.push(Math.max(0, Math.min(1, hours / maxHours)))
    }
    values.push(row)
  }
  return values
}

/** Deterministic demo field (beui preview); weekends quieter. */
export function demoHeatValues(weeks = 16) {
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const s = Math.sin(w * 12.9898 + d * 78.233) * 43758.5453
      const r = s - Math.floor(s)
      return d >= 5 ? Math.max(0, r - 0.55) * 1.4 : r
    }),
  )
}

export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}
