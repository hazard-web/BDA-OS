import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import dayjs from 'dayjs'
import { App, Button, DatePicker, Drawer, Input, Select, Tooltip } from 'antd'
import { CheckOutlined, CloseOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import { hoursLabel } from '../utils/pulseCalendar'
import { PULSE_CHECKIN_EVENT } from '../utils/pulseCheckIn'
import { fetchTimesheetToday, saveTimesheetDraft, submitTimesheet } from '../utils/pulseCheckInApi'
import {
  ATTENDANCE_PERIODS,
  DEFAULT_WORK_DAYS,
  buildRangeDays,
  periodRange,
  weekRange,
} from '../utils/pulseWorkWeek'
import PulseSlideClose from './PulseSlideClose'

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function newRow() {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, description: '', hours: '', minutes: '' }
}

function rowsFromEntries(entries) {
  const list = Array.isArray(entries) ? entries : []
  if (!list.length) return [newRow()]
  return list.map((item, index) => {
    const minutes = Math.max(0, Number(item.minutes) || 0)
    return {
      id: item._id || `entry-${index}`,
      description: item.description || '',
      hours: String(Math.floor(minutes / 60) || ''),
      minutes: String(minutes % 60 || ''),
    }
  })
}

function toEntries(rows) {
  return rows
    .map((row) => ({
      description: String(row.description || '').trim(),
      project: 'BDA OS',
      minutes: (Number(row.hours) || 0) * 60 + (Number(row.minutes) || 0),
    }))
    .filter((item) => item.description && item.minutes > 0)
}

const SAMPLE_ROWS = [
  { id: 's1', description: 'Internal product review', hours: '2', minutes: '30' },
  { id: 's2', description: 'Onboarding notes', hours: '1', minutes: '15' },
]

const WEEK_TARGET_H = 45

/** Clearer KPI copy: "38 hrs and 52 m" */
function hoursAndMinutesLabel(value) {
  const hours = Number(value) || 0
  if (hours <= 0) return '0 hrs'
  const secs = Math.round(hours * 3600)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h <= 0) return `${m} m`
  if (m <= 0) return `${h} hrs`
  return `${h} hrs ${m} m`
}

export default function PulseTimesheetForm({
  name = 'You',
  checkedInAt,
  elapsed = 0,
  weekHours = 0,
  timesheetRows = [],
  sample = false,
}) {
  const { message } = App.useApp()
  const { user } = useAuth()
  const date = todayKey()
  const [rows, setRows] = useState(sample ? SAMPLE_ROWS : [newRow()])
  const [submitted, setSubmitted] = useState(false)
  const [open, setOpen] = useState(false)
  const [checkInAt, setCheckInAt] = useState(checkedInAt || null)
  const [clockMs, setClockMs] = useState(Math.max(0, Number(elapsed) || 0))
  const [saving, setSaving] = useState(false)
  const [period, setPeriod] = useState('week')
  const [customRange, setCustomRange] = useState(() => [dayjs().startOf('week'), dayjs()])
  const [history, setHistory] = useState({
    records: [],
    workDays: DEFAULT_WORK_DAYS,
    holidays: [],
    leaveDates: [],
    leaveByDate: {},
  })

  const custom = useMemo(() => {
    if (period !== 'custom' || !customRange?.[0] || !customRange?.[1]) return null
    return { start: customRange[0].toDate(), end: customRange[1].toDate() }
  }, [period, customRange])
  const range = useMemo(() => periodRange(period, new Date(), custom), [period, custom])
  const periodLabel = ATTENDANCE_PERIODS.find((item) => item.value === period)?.label || 'This week'

  useEffect(() => {
    if (sample) return undefined
    let cancelled = false
    fetchTimesheetToday(date)
      .then((data) => {
        if (cancelled || !data) return
        setRows(rowsFromEntries(data.taskEntries))
        setSubmitted(Boolean(data.timesheetSubmitted))
        setCheckInAt(data.checkInAt || checkedInAt || null)
        if (data.totalActiveMs) setClockMs(Number(data.totalActiveMs) || 0)
      })
      .catch(() => {
        if (!cancelled) message.error('Could not load today\'s timesheet')
      })
    return () => {
      cancelled = true
    }
  }, [date, sample, checkedInAt, message])

  useEffect(() => {
    if (checkedInAt) setCheckInAt(checkedInAt)
  }, [checkedInAt])

  useEffect(() => {
    if (sample) return undefined
    let cancelled = false
    const load = () => {
      api
        .get('/pulse-checkin/overview', { params: { from: range.from, to: range.to } })
        .then((res) => {
          if (cancelled) return
          const data = res.data?.data || {}
          setHistory({
            records: Array.isArray(data.days) ? data.days : [],
            workDays: DEFAULT_WORK_DAYS,
            holidays: Array.isArray(data.holidays) ? data.holidays : [],
            leaveDates: Array.isArray(data.leaveDates) ? data.leaveDates : [],
            leaveByDate: data.leaveByDate && typeof data.leaveByDate === 'object' ? data.leaveByDate : {},
          })
        })
        .catch(() => {
          if (!cancelled) {
            setHistory({
              records: [],
              workDays: DEFAULT_WORK_DAYS,
              holidays: [],
              leaveDates: [],
              leaveByDate: {},
            })
          }
        })
    }
    load()
    const onChange = () => load()
    window.addEventListener(PULSE_CHECKIN_EVENT, onChange)
    return () => {
      cancelled = true
      window.removeEventListener(PULSE_CHECKIN_EVENT, onChange)
    }
  }, [sample, range.from, range.to])

  const liveClockMs = Math.max(clockMs, Number(elapsed) || 0)
  const todaySeconds = Math.max(0, Math.floor(liveClockMs / 1000))
  const entries = useMemo(() => toEntries(rows), [rows])
  const declaredMs = entries.reduce((sum, item) => sum + item.minutes * 60_000, 0)

  const periodDays = useMemo(() => {
    if (sample) {
      return (timesheetRows || []).map((row) => ({
        key: row.key,
        task: row.task || 'Hours',
        hours: Number(row.hours) || 0,
        seconds: (Number(row.hours) || 0) * 3600,
        today: false,
        present: Number(row.hours) > 0,
      }))
    }
    return buildRangeDays({
      start: range.start,
      end: range.end,
      records: history.records,
      workDays: history.workDays,
      checkedInToday: Boolean(checkedInAt),
      leaveDates: history.leaveDates,
      leaveByDate: history.leaveByDate,
      holidays: history.holidays,
      todaySeconds,
      useSample: false,
    })
  }, [
    sample,
    timesheetRows,
    range.start,
    range.end,
    history,
    checkedInAt,
    todaySeconds,
  ])

  const periodRows = useMemo(() => {
    if (sample) {
      return periodDays.map((day) => ({
        key: day.key,
        task: day.task,
        owner: name,
        due: hoursLabel(day.hours),
        status: day.hours > 0 ? 'Logged' : 'No hours',
        done: day.hours > 0,
      }))
    }
    return periodDays
      .filter((day) => !day.weekend && !day.holiday)
      .map((day) => {
        const hours = Math.max(0, Number(day.hours) || 0)
        const hasHours = hours > 0 || (day.today && liveClockMs > 0)
        return {
          key: day.key,
          task: format(day.date, 'EEE d MMM'),
          owner: name,
          due: hasHours ? hoursLabel(day.today ? Math.max(hours, liveClockMs / 3_600_000) : hours) : '—',
          status: day.onLeave ? 'On leave' : hasHours ? 'Logged' : day.past ? 'Missing' : 'Open',
          done: hasHours,
        }
      })
  }, [sample, periodDays, name, liveClockMs])

  const periodHours = useMemo(() => {
    if (sample) {
      return periodDays.reduce((sum, day) => sum + (Number(day.hours) || 0), 0)
    }
    const total = periodDays.reduce((sum, day) => {
      if (day.weekend || day.holiday) return sum
      const hours = Number(day.hours) || 0
      if (day.today) return sum + Math.max(hours, liveClockMs / 3_600_000)
      return sum + hours
    }, 0)
    if (total > 0) return total
    return period === 'week' ? Number(weekHours) || 0 : 0
  }, [sample, periodDays, liveClockMs, period, weekHours])

  const daysLogged = periodRows.filter((row) => row.done).length
  const workdayCount = periodRows.length
  const todayHours = liveClockMs / 3_600_000
  const remainingToTarget = period === 'week'
    ? Math.max(0, WEEK_TARGET_H - periodHours)
    : null

  const weekCalendarDays = useMemo(() => {
    const week = period === 'week' ? range : weekRange(new Date())
    const days = sample
      ? Array.from({ length: 7 }, (_, index) => {
          const date = new Date(week.start)
          date.setDate(week.start.getDate() + index)
          const day = date.getDay()
          if (!DEFAULT_WORK_DAYS.includes(day)) return null
          const key = todayKey(date)
          const filled = index === 1 || index === 2
          return {
            key,
            date,
            label: format(date, 'EEE'),
            num: format(date, 'd'),
            filled,
            today: false,
          }
        }).filter(Boolean)
      : buildRangeDays({
          start: week.start,
          end: week.end,
          records: history.records,
          workDays: DEFAULT_WORK_DAYS,
          checkedInToday: Boolean(checkedInAt),
          leaveDates: history.leaveDates,
          leaveByDate: history.leaveByDate,
          holidays: history.holidays,
          todaySeconds,
          useSample: false,
        })
          .filter((day) => DEFAULT_WORK_DAYS.includes(day.date.getDay()))
          .map((day) => {
            const filled = Boolean(day.record?.timesheetSubmitted) || (day.today && submitted)
            return {
              key: day.key,
              date: day.date,
              label: format(day.date, 'EEE'),
              num: format(day.date, 'd'),
              filled,
              today: day.today,
            }
          })
    return days
  }, [
    sample,
    period,
    range,
    history,
    checkedInAt,
    todaySeconds,
    submitted,
  ])

  const submittedBoard = useMemo(() => (
    entries.map((item, index) => ({
      key: `done-${index}`,
      task: item.description,
      owner: name,
      due: hoursLabel(item.minutes / 60),
      status: 'Done',
      done: true,
    }))
  ), [entries, name])

  const tableRows = submitted && period === 'week' ? submittedBoard : periodRows
  const panelTitle = submitted && period === 'week' ? 'Today’s tasks' : periodLabel
  const panelHint = `${tableRows.length} day${tableRows.length === 1 ? '' : 's'}`

  const updateRow = (id, patch) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const addRow = () => {
    if (submitted || rows.length >= 20) return
    setRows((prev) => [...prev, newRow()])
  }

  const removeRow = (id) => {
    if (submitted) return
    setRows((prev) => (prev.length <= 1 ? [newRow()] : prev.filter((row) => row.id !== id)))
  }

  const persistDraft = async () => {
    if (sample || submitted || !entries.length) return
    try {
      await saveTimesheetDraft({ date, email: user?.email, entries })
    } catch {
      /* keep local rows */
    }
  }

  const closeForm = () => {
    if (saving) return
    setOpen(false)
  }

  const onSubmit = async () => {
    if (submitted || saving) return
    if (!entries.length) {
      message.error('Add a task and the time you spent on it')
      return
    }
    setSaving(true)
    try {
      if (!sample) {
        const data = await submitTimesheet({ date, email: user?.email, entries })
        if (data?.taskEntries) setRows(rowsFromEntries(data.taskEntries))
      }
      setSubmitted(true)
      setOpen(false)
      message.success('Timesheet submitted')
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not submit timesheet')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pulse-att-page pulse-ts-att">
      <div className="pulse-att-board">
        <header className="pulse-att-toolbar">
          <div className="pulse-att-period">
            <Select
              value={period}
              onChange={setPeriod}
              options={ATTENDANCE_PERIODS}
              className="pulse-att-select"
              classNames={{ popup: { root: 'pulse-att-select-dropdown' } }}
              popupMatchSelectWidth={false}
              aria-label="Timesheet period"
            />
            {period === 'custom' ? (
              <DatePicker.RangePicker
                value={customRange}
                allowClear={false}
                format="DD-MMM-YYYY"
                className="pulse-att-range"
                placement="bottomLeft"
                getPopupContainer={(node) => node.parentElement || document.body}
                classNames={{ popup: { root: 'pulse-att-range-dropdown' } }}
                disabledDate={(value) => value && value.isAfter(dayjs(), 'day')}
                onChange={(next) => {
                  if (next?.[0] && next?.[1]) setCustomRange(next)
                }}
              />
            ) : null}
          </div>
          {submitted ? (
            <span className="pulse-ts-sent">Submitted</span>
          ) : (
            <button
              type="button"
              className="pov-cta plive-top-cta plive-checkin"
              onClick={() => setOpen(true)}
            >
              Submit timesheet
            </button>
          )}
        </header>

        <div className="plive-metrics">
          <article className="plive-metric plive-metric--split">
            <p>Hours worked</p>
            <div className="plive-metric-split">
              <div>
                <strong>{hoursLabel(periodHours)}</strong>
                <span>{periodLabel}</span>
              </div>
              <div>
                <strong>{hoursLabel(todayHours)}</strong>
                <span>Today</span>
              </div>
            </div>
          </article>
          <article className="plive-metric plive-metric--split">
            <p>{period === 'week' ? 'Week target' : 'Days logged'}</p>
            <div className="plive-metric-split">
              {period === 'week' ? (
                <>
                  <div>
                    <strong>{WEEK_TARGET_H} hrs</strong>
                    <span>To done</span>
                  </div>
                  <div>
                    <strong>{hoursAndMinutesLabel(remainingToTarget || 0)}</strong>
                    <span>Left</span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <strong>{daysLogged}</strong>
                    <span>With hours</span>
                  </div>
                  <div>
                    <strong>{Math.max(0, workdayCount - daysLogged)}</strong>
                    <span>Still open</span>
                  </div>
                </>
              )}
            </div>
          </article>
          <article className="plive-metric plive-metric--split">
            <p>Workdays</p>
            <div className="plive-metric-split">
              <div>
                <strong>{daysLogged} Days</strong>
                <span>Logged</span>
              </div>
              <div>
                <strong>{workdayCount} days</strong>
                <span>{period === 'week' ? 'Till Saturday' : 'In range'}</span>
              </div>
            </div>
          </article>
          <article className="plive-metric plive-metric--ts-week">
            <p>Timesheet</p>
            <div className="pulse-ts-week-kpi">
              <div className="pulse-ts-week-status">
                <strong>{submitted ? 'Done' : 'Draft'}</strong>
                <span>{submitted ? 'Submitted today' : 'Not submitted'}</span>
              </div>
              <div className="pulse-ts-week-strip" role="list" aria-label="Weekly timesheet">
                {weekCalendarDays.map((day) => (
                  <Tooltip
                    key={day.key}
                    title={day.filled ? 'Timesheet filled and submitted' : 'Timesheet not submitted'}
                  >
                    <div
                      className={`pulse-ts-week-day${day.today ? ' is-today' : ''}${day.filled ? ' is-filled' : ' is-empty'}`}
                      role="listitem"
                    >
                      <span className="pulse-ts-week-dow">{day.label}</span>
                      <span className={`pulse-ts-week-mark${day.filled ? ' is-ok' : ' is-miss'}`} aria-hidden="true">
                        {day.filled ? <CheckOutlined /> : <CloseOutlined />}
                      </span>
                      <span className="pulse-ts-week-num">{day.num}</span>
                    </div>
                  </Tooltip>
                ))}
              </div>
            </div>
          </article>
        </div>

        <section className="pulse-att-panel" aria-label={panelTitle}>
          <div className="pulse-att-panel-chrome">
            <header className="pulse-att-panel-head">
              <h4>{panelTitle}</h4>
              <span>{panelHint}</span>
            </header>
            <div className="pulse-att-cols pulse-ts-att-cols" aria-hidden="true">
              <span>{submitted && period === 'week' ? 'Task' : 'Day'}</span>
              <span>Hours</span>
              <span>Status</span>
            </div>
          </div>

          {tableRows.length === 0 ? (
            <p className="pulse-att-empty">
              {submitted ? 'No tasks submitted.' : 'No hours in this period yet.'}
            </p>
          ) : (
            <ul className="pulse-att-list pulse-ts-att-list" aria-label={panelTitle}>
              {tableRows.map((row) => {
                const tone = String(row.status || '').toLowerCase()
                const statusTone = ['done', 'logged', 'submitted'].includes(tone)
                  ? 'ok'
                  : tone === 'missing' || tone === 'absent'
                    ? 'bad'
                    : tone.includes('leave')
                      ? 'leave'
                      : 'open'
                return (
                  <li key={row.key} className={`pulse-att-row pulse-ts-att-row is-${statusTone}`}>
                    <span className={`pulse-att-dot is-${statusTone}`} aria-hidden="true" />
                    <div className="pulse-att-day">
                      <strong>{row.task}</strong>
                      <span>{row.owner || name}</span>
                    </div>
                    <div className="pulse-att-hours">{row.due}</div>
                    <span className={`pulse-att-status is-${statusTone}`}>{row.status || 'Open'}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <Drawer
        title="Submit timesheet"
        placement="right"
        width={520}
        open={open}
        onClose={closeForm}
        destroyOnHidden
        rootClassName="pulse-ts-add-drawer"
        closable={false}
        footer={(
          <div className="pulse-ts-drawer-foot">
            <div className="pulse-ts-drawer-actions">
              <Button type="primary" loading={saving} onClick={onSubmit}>
                Submit
              </Button>
              <Button onClick={closeForm} disabled={saving}>
                Cancel
              </Button>
            </div>
            <p className="pulse-ts-drawer-total">
              <span>
                On tasks <strong>{hoursLabel(declaredMs / 3_600_000)}</strong>
              </span>
              <span className="pulse-ts-drawer-total-sep" aria-hidden="true" />
              <span>
                Clock <strong>{hoursLabel(liveClockMs / 3_600_000)}</strong>
              </span>
            </p>
          </div>
        )}
      >
        <div className="pulse-ts-drawer-body">
          <header className="pulse-ts-drawer-intro">
            <h4>Today’s tasks</h4>
          </header>

          <div className="pulse-ts-rows">
            <div className="pulse-ts-row is-head">
              <span>Task</span>
              <span>Hrs</span>
              <span>Min</span>
              <span className="pulse-ts-row-action" />
            </div>
            {rows.map((row, index) => (
              <div key={row.id} className="pulse-ts-row">
                <Input
                  value={row.description}
                  placeholder={index === 0 ? 'e.g. Product review' : 'Another task'}
                  disabled={saving}
                  onChange={(event) => updateRow(row.id, { description: event.target.value })}
                  onBlur={persistDraft}
                />
                <Input
                  inputMode="numeric"
                  value={row.hours}
                  placeholder="0"
                  disabled={saving}
                  onChange={(event) => updateRow(row.id, { hours: event.target.value.replace(/\D/g, '').slice(0, 2) })}
                  onBlur={persistDraft}
                  aria-label="Hours"
                />
                <Input
                  inputMode="numeric"
                  value={row.minutes}
                  placeholder="00"
                  disabled={saving}
                  onChange={(event) => {
                    const next = event.target.value.replace(/\D/g, '').slice(0, 2)
                    updateRow(row.id, { minutes: Number(next) > 59 ? '59' : next })
                  }}
                  onBlur={persistDraft}
                  aria-label="Minutes"
                />
                <Button
                  type="text"
                  className="pulse-ts-row-remove"
                  icon={<DeleteOutlined />}
                  disabled={saving || rows.length <= 1}
                  aria-label="Remove task"
                  onClick={() => removeRow(row.id)}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            className="pulse-ts-add"
            onClick={addRow}
            disabled={saving || rows.length >= 20}
          >
            <PlusOutlined /> Add task
          </button>
        </div>
      </Drawer>
      <PulseSlideClose open={open} onClose={closeForm} width={520} />
    </div>
  )
}
