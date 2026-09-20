import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import {
  addDays,
  CELL,
  dayKey,
  EMPTY,
  fmtMonth,
  GAP,
  HEAT_COLOR,
  MONTH_ROW,
  mondayOf,
  PITCH,
  STEPS,
  startOfDay,
} from './utils'

function useHoverCapable() {
  const [canHover, setCanHover] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const update = () => setCanHover(mq.matches)
    update()
    mq.addEventListener?.('change', update)
    return () => mq.removeEventListener?.('change', update)
  }, [])
  return canHover
}

/**
 * Weeks of activity as a single-hue grid — ported from beui Heat Calendar.
 * @see https://beui.dev/charts/heat-calendar
 */
export function useHeatCalendarModel({
  unit = 'hrs',
  weeks = 16,
  maxCount = 10,
  values,
  endDate,
  color = HEAT_COLOR,
  hoursByDay = null,
  formatHours = null,
  selection: controlledSelection,
  defaultSelection = null,
  onSelectionChange,
} = {}) {
  const reduce = useReducedMotion()
  const canHover = useHoverCapable()
  const [storedHover, setHover] = useState(null)
  const [internalSelection, setInternalSelection] = useState(defaultSelection)
  const requestedSelection = controlledSelection === undefined ? internalSelection : controlledSelection
  const setSelection = (next) => {
    if (controlledSelection === undefined) setInternalSelection(next)
    onSelectionChange?.(next)
  }
  const gridRef = useRef(null)
  const tooltipId = useId()
  const [step, setStep] = useState(null)
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSettled(true), reduce ? 0 : (weeks + 7) * 18 + 500)
    return () => clearTimeout(t)
  }, [weeks, reduce])

  const [today, setToday] = useState(null)
  useEffect(() => setToday(startOfDay(new Date())), [])
  const end = useMemo(() => (endDate ? startOfDay(endDate) : today), [endDate, today])
  const start = useMemo(() => (end ? addDays(mondayOf(end), -(weeks - 1) * 7) : null), [end, weeks])

  const level = (w, d) => Math.max(0, Math.min(1, values?.[w]?.[d] ?? 0))
  // Any positive intensity → bucket ≥ 1 so 1h never matches empty gray
  const bucket = (v) => (v <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil(v * 4))))
  const fill = (b) => (b === 0 ? EMPTY : `color-mix(in srgb, ${color} ${STEPS[b]}%, transparent)`)
  const count = (v) => Math.round(v * maxCount)
  const dateOf = (w, d) => (start ? addDays(start, w * 7 + d) : null)
  const hoursExact = (w, d) => {
    const date = dateOf(w, d)
    const key = date ? dayKey(date) : null
    if (key && hoursByDay && Object.prototype.hasOwnProperty.call(hoursByDay, key)) {
      return Number(hoursByDay[key]) || 0
    }
    // Demo / intensity-only: show exact fractional hours from the cell value
    return level(w, d) * maxCount
  }
  const hoursText = (w, d) => {
    const hrs = hoursExact(w, d)
    if (typeof formatHours === 'function') return formatHours(hrs)
    return `${hrs} ${unit}`
  }
  const future = (w, d) => {
    const date = dateOf(w, d)
    return end !== null && date !== null && date > end
  }

  const validCell = (cell) =>
    cell
    && Number.isInteger(cell.w)
    && Number.isInteger(cell.d)
    && cell.w >= 0
    && cell.w < weeks
    && cell.d >= 0
    && cell.d < 7
    && !future(cell.w, cell.d)

  const selection =
    requestedSelection
    && validCell(requestedSelection.start)
    && (!requestedSelection.end || validCell(requestedSelection.end))
      ? requestedSelection
      : null

  useEffect(() => {
    if (requestedSelection && !selection && controlledSelection === undefined) {
      setInternalSelection(null)
    }
  }, [requestedSelection, selection, controlledSelection])

  const pinned = selection?.start ?? null
  const spanEnd = selection?.end ?? null
  const hover = storedHover && validCell(storedHover) ? storedHover : null

  useEffect(() => {
    if (storedHover && !hover) setHover(null)
  }, [storedHover, hover])

  const cols = useMemo(() => {
    const list = Array.from({ length: weeks }, (_, w) => {
      const date = start ? addDays(start, w * 7) : null
      const m = date ? date.getMonth() : -1
      const fresh =
        start !== null
        && date !== null
        && (w === 0 || addDays(start, (w - 1) * 7).getMonth() !== m)
      return { id: `w${w}`, w, m, label: fresh && date ? fmtMonth.format(date) : null }
    })
    if (list[1]?.label || list[2]?.label) list[0].label = null
    return list
  }, [start, weeks])

  const idx = (c) => c.w * 7 + c.d
  const clear = () => setSelection(null)
  const spanTo = spanEnd ?? (pinned ? (hover ?? pinned) : null)
  const span =
    pinned && spanTo
      ? { lo: Math.min(idx(pinned), idx(spanTo)), hi: Math.max(idx(pinned), idx(spanTo)) }
      : null

  let spanTotal = 0
  if (span) {
    for (let i = span.lo; i <= span.hi; i += 1) {
      if (future(Math.floor(i / 7), i % 7)) break
      spanTotal += hoursExact(Math.floor(i / 7), i % 7)
    }
  }

  const select = (cell) => {
    if (spanEnd) clear()
    else if (pinned && idx(pinned) === idx(cell)) setSelection(null)
    else if (pinned) setSelection({ start: pinned, end: cell })
    else setSelection({ start: cell })
  }

  const hot = hover ?? spanEnd ?? pinned
  const tip = spanEnd ?? hover ?? pinned
  const tipDate = tip ? dateOf(tip.w, tip.d) : null
  const hotMonth = hot ? (dateOf(hot.w, hot.d)?.getMonth() ?? null) : null
  const tipX = tip ? tip.w * PITCH + CELL / 2 : 0
  const tipY = tip ? MONTH_ROW + GAP + tip.d * PITCH : 0
  const tipHours = tip ? hoursExact(tip.w, tip.d) : 0
  const tipLabel = tip
    ? (span && span.hi !== span.lo
      ? (typeof formatHours === 'function' ? formatHours(spanTotal) : `${spanTotal} ${unit}`)
      : hoursText(tip.w, tip.d))
    : ''
  const tooltip =
    tip && tipDate
      ? {
          date: tipDate,
          count: tipHours,
          total: spanTotal,
          label: tipLabel,
          startDate: start && span ? addDays(start, span.lo) : tipDate,
          endDate: start && span ? addDays(start, span.hi) : tipDate,
          days: span ? span.hi - span.lo + 1 : 1,
        }
      : null

  return {
    unit,
    weeks,
    reduce,
    canHover,
    hover,
    pinned,
    spanEnd,
    step,
    setStep,
    settled,
    start,
    end,
    level,
    bucket,
    fill,
    count,
    hoursExact,
    hoursText,
    dateOf,
    future,
    cols,
    clear,
    span,
    spanTotal,
    select,
    hot,
    tip,
    tipDate,
    hotMonth,
    tipX,
    tipY,
    setHover,
    gridRef,
    tooltipId,
    tooltip,
    selection,
    setSelection,
  }
}

export const HeatCalendarContext = createContext(null)

export function useHeatCalendar() {
  const context = useContext(HeatCalendarContext)
  if (!context) throw new Error('HeatCalendar parts must be inside HeatCalendar')
  return context
}
