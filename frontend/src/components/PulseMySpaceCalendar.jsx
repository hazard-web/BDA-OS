import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar } from 'antd'
import calendarEn from 'antd/es/calendar/locale/en_US'
import { CaretDown, CaretLeft, CaretRight } from '@phosphor-icons/react'
import dayjs from 'dayjs'
import { format } from 'date-fns'
import api from '../api'
import {
  NAMED_HOLIDAYS,
  SAMPLE_TEAM_LEAVE,
  holidayMap,
  hoursLabel,
  leaveByDay,
} from '../utils/pulseCalendar'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function yearOptions(center) {
  const start = center - 8
  return Array.from({ length: 17 }, (_, i) => start + i)
}

const CALENDAR_LOCALE = {
  ...calendarEn,
  lang: {
    ...calendarEn.lang,
    shortWeekDays: WEEKDAYS,
  },
}

function dayKey(value) {
  return value.format('YYYY-MM-DD')
}

function dayCaption(value, holiday, team, mine) {
  const when = value.format('ddd D MMM')
  if (holiday) return `${when} · ${holiday.name}`
  if (team.length) {
    const names = team.map((row) => row.name.split(' ')[0]).join(', ')
    return `${when} · ${names} off`
  }
  if (mine.onLeave) return `${when} · You are on leave`
  if (mine.absent) return `${when} · You were absent`
  if (mine.present && mine.hours) return `${when} · ${hoursLabel(mine.hours)} logged`
  if (mine.weekend) return `${when} · Weekend`
  return `${when} · Ordinary working day`
}

function PickMenu({ anchorRef, className, children }) {
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useLayoutEffect(() => {
    const place = () => {
      const el = anchorRef.current
      if (!el) return
      const box = el.getBoundingClientRect()
      setPos({ top: box.bottom + 6, left: box.left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchorRef])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className={className} role="listbox" style={{ top: pos.top, left: pos.left }}>
      {children}
    </div>,
    document.body,
  )
}

function CalendarToolbar({ value, onChange }) {
  const [open, setOpen] = useState(null)
  const wrapRef = useRef(null)
  const monthRef = useRef(null)
  const yearRef = useRef(null)
  const goMonth = (delta) => onChange(value.add(delta, 'month'))

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (event) => {
      if (wrapRef.current?.contains(event.target)) return
      if (event.target.closest?.('.pulse-cal-pick-menu')) return
      setOpen(null)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="pulse-cal-toolbar" ref={wrapRef}>
      <div className="pulse-cal-stepper" role="group" aria-label="Calendar month">
        <button type="button" className="pulse-cal-step" aria-label="Previous month" onClick={() => goMonth(-1)}>
          <CaretLeft size={14} weight="bold" />
        </button>
        <button type="button" className="pulse-cal-step" aria-label="Next month" onClick={() => goMonth(1)}>
          <CaretRight size={14} weight="bold" />
        </button>
      </div>
      <div className="pulse-cal-pickers">
        <div className="pulse-cal-pick">
          <button
            ref={monthRef}
            type="button"
            className={`pulse-cal-pick-btn${open === 'month' ? ' is-open' : ''}`}
            aria-haspopup="listbox"
            aria-expanded={open === 'month'}
            aria-label="Choose month"
            onClick={() => setOpen((next) => (next === 'month' ? null : 'month'))}
          >
            <span>{value.format('MMM')}</span>
            <CaretDown size={12} weight="bold" />
          </button>
          {open === 'month' ? (
            <PickMenu anchorRef={monthRef} className="pulse-cal-pick-menu is-months">
              {MONTHS.map((label, monthIndex) => (
                <button
                  key={label}
                  type="button"
                  role="option"
                  aria-selected={value.month() === monthIndex}
                  className={value.month() === monthIndex ? 'is-on' : undefined}
                  onClick={() => {
                    onChange(value.month(monthIndex))
                    setOpen(null)
                  }}
                >
                  {label}
                </button>
              ))}
            </PickMenu>
          ) : null}
        </div>
        <div className="pulse-cal-pick">
          <button
            ref={yearRef}
            type="button"
            className={`pulse-cal-pick-btn${open === 'year' ? ' is-open' : ''}`}
            aria-haspopup="listbox"
            aria-expanded={open === 'year'}
            aria-label="Choose year"
            onClick={() => setOpen((next) => (next === 'year' ? null : 'year'))}
          >
            <span>{value.format('YYYY')}</span>
            <CaretDown size={12} weight="bold" />
          </button>
          {open === 'year' ? (
            <PickMenu anchorRef={yearRef} className="pulse-cal-pick-menu is-years">
              {yearOptions(value.year()).map((year) => (
                <button
                  key={year}
                  type="button"
                  role="option"
                  aria-selected={value.year() === year}
                  className={value.year() === year ? 'is-on' : undefined}
                  onClick={() => {
                    onChange(value.year(year))
                    setOpen(null)
                  }}
                >
                  {year}
                </button>
              ))}
            </PickMenu>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function sampleDays(month) {
  const start = dayjs(`${month}-01`)
  const days = {}
  const last = start.daysInMonth()
  for (let date = 1; date <= last; date += 1) {
    const key = start.date(date).format('YYYY-MM-DD')
    const weekend = start.date(date).day() === 0 || start.date(date).day() === 6
    days[key] = {
      date: key,
      hours: weekend || NAMED_HOLIDAYS[key] ? 0 : key === '2026-09-08' ? 8.4 : 0,
      present: key === '2026-09-08',
      absent: key === '2026-09-10',
      onLeave: false,
      weekend,
      holiday: Boolean(NAMED_HOLIDAYS[key]),
      sessions: key === '2026-09-08'
        ? [
            { in: '2026-09-08T09:12:00', out: '2026-09-08T13:40:00', hours: 4.5 },
            { in: '2026-09-08T14:10:00', out: '2026-09-08T18:05:00', hours: 3.9 },
          ]
        : [],
    }
  }
  return days
}

function sampleHolidays(month) {
  return Object.entries(NAMED_HOLIDAYS)
    .filter(([date]) => date.startsWith(month))
    .map(([date, meta]) => ({ date, ...meta }))
}

export default function PulseMySpaceCalendar({ sample, weekDays = [], checkedInAt, compact = false }) {
  const [value, setValue] = useState(() => dayjs())
  const [board, setBoard] = useState({ holidays: [], teamLeave: [], days: {} })
  const rootRef = useRef(null)

  const month = value.format('YYYY-MM')

  useEffect(() => {
    if (sample) {
      setBoard({
        holidays: sampleHolidays(month),
        teamLeave: SAMPLE_TEAM_LEAVE.filter((row) => row.days.some((day) => day.startsWith(month))),
        days: sampleDays(month),
      })
      return undefined
    }
    let live = true
    api
      .get('/pulse-checkin/calendar', { params: { month } })
      .then((res) => {
        if (!live) return
        const payload = res.data?.data || {}
        setBoard({
          holidays: Array.isArray(payload.holidays) ? payload.holidays : [],
          teamLeave: Array.isArray(payload.teamLeave) ? payload.teamLeave : [],
          days: payload.days && typeof payload.days === 'object' ? payload.days : {},
        })
      })
      .catch(() => {
        if (!live) return
        setBoard({
          holidays: sampleHolidays(month),
          teamLeave: [],
          days: {},
        })
      })
    return () => {
      live = false
    }
  }, [month, sample])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const clear = () => {
      root.querySelectorAll('.ant-picker-cell[title]').forEach((cell) => {
        cell.removeAttribute('title')
      })
    }
    clear()
    const observer = new MutationObserver(clear)
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['title'] })
    return () => observer.disconnect()
  }, [value, board])

  const holidays = useMemo(() => holidayMap(board.holidays), [board.holidays])
  const teamByDay = useMemo(() => leaveByDay(board.teamLeave), [board.teamLeave])

  const weekMap = useMemo(() => {
    const map = new Map()
    weekDays.forEach((day) => {
      map.set(format(day.date, 'yyyy-MM-dd'), day)
    })
    return map
  }, [weekDays])

  const selectedKey = dayKey(value)
  const selected = board.days[selectedKey] || {}
  const selectedHoliday = holidays.get(selectedKey)
  const selectedTeam = teamByDay.get(selectedKey) || []

  const marksFor = (current) => {
    const key = dayKey(current)
    const weekDay = weekMap.get(key)
    const mine = board.days[key] || {}
    const holiday = holidays.get(key)
    const team = teamByDay.get(key) || []
    const chips = []
    if (holiday) {
      chips.push({ tone: 'holiday', label: holiday.name })
    }
    if (team.length) {
      const names = team.slice(0, 2).map((row) => row.name.split(' ')[0]).join(', ')
      chips.push({
        tone: 'leave',
        label: team.length > 2 ? `${names} +${team.length - 2}` : `${names} off`,
      })
    }
    if (mine.absent || weekDay?.status === 'Absent') chips.push({ tone: 'absent', label: 'Absent' })
    if (mine.present || weekDay?.present || (weekDay?.today && checkedInAt)) {
      chips.push({ tone: 'present', label: mine.hours ? hoursLabel(mine.hours) : 'Present' })
    }
    return chips
  }

  const cellRender = (current, info) => {
    if (info.type !== 'date') return info.originNode
    const chips = marksFor(current)
    if (!chips.length) return null
    return (
      <ul className="pulse-cal-events">
        {chips.map((chip) => (
          <li key={`${dayKey(current)}-${chip.tone}-${chip.label}`} className={`pulse-cal-chip is-${chip.tone}`}>
            {chip.label}
          </li>
        ))}
      </ul>
    )
  }

  const fullCellRender = (date, info) => {
    if (info.type !== 'date') return info.originNode
    const isToday = date.isSame(dayjs(), 'day')
    if (compact) {
      const tone = marksFor(date)[0]?.tone
      const weekend = date.day() === 0 || date.day() === 6
      return (
        <div className={`ant-picker-cell-inner pulse-cal-mini${isToday ? ' is-today' : ''}${weekend ? ' is-weekend' : ''}${tone ? ` is-${tone}` : ''}`}>
          <span>{date.date()}</span>
          {tone ? <i className={`pulse-cal-dot is-${tone}`} aria-hidden="true" /> : <i className="pulse-cal-dot is-empty" aria-hidden="true" />}
        </div>
      )
    }
    return (
      <div className={`ant-picker-cell-inner ant-picker-calendar-date${isToday ? ' ant-picker-calendar-date-today' : ''}`}>
        <div className="ant-picker-calendar-date-value">{date.date()}</div>
        <div className="ant-picker-calendar-date-content">{cellRender(date, info)}</div>
      </div>
    )
  }

  return (
    <div ref={rootRef} className={compact ? 'pulse-cal-widget' : 'pulse-cal-scroll'}>
      <CalendarToolbar value={value} onChange={setValue} />
      {compact ? (
        <p className="pulse-cal-legend pulse-cal-legend-mini">
          <span className="is-leave">Team off</span>
          <span className="is-holiday">Holiday</span>
          <span className="is-present">Hours in</span>
          <span className="is-absent">Absent</span>
        </p>
      ) : (
        <p className="pulse-cal-legend">
          <span className="is-holiday">Holiday</span>
          <span className="is-leave">Team leave</span>
          <span className="is-absent">Absent</span>
          <span className="is-present">Hours in</span>
        </p>
      )}
      <Calendar
        fullscreen={!compact}
        value={value}
        onChange={(next) => {
          if (next.isSame(value, 'month')) setValue(next)
        }}
        onPanelChange={() => {}}
        headerRender={() => null}
        className="pulse-calendar"
        locale={CALENDAR_LOCALE}
        fullCellRender={fullCellRender}
      />
      {compact ? (
        <p className="pulse-cal-caption">{dayCaption(value, selectedHoliday, selectedTeam, selected)}</p>
      ) : null}
    </div>
  )
}
