import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { App, Button, Drawer, Input, Space } from 'antd'
import { CloseOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useAuth } from '../context/AuthContext'
import { hoursLabel } from '../utils/pulseCalendar'
import { fetchTimesheetToday, saveTimesheetDraft, submitTimesheet } from '../utils/pulseCheckInApi'
import { PulseTaskRows } from './PulseGlassBoard'

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

  const liveClockMs = Math.max(clockMs, Number(elapsed) || 0)
  const entries = useMemo(() => toEntries(rows), [rows])
  const declaredMs = entries.reduce((sum, item) => sum + item.minutes * 60_000, 0)

  const weekBoard = useMemo(() => {
    const fromWeek = (timesheetRows || []).map((row, index) => ({
      key: row.key || `w-${index}`,
      task: `${row.project || 'BDA OS'} · ${row.task || 'Hours'}`,
      owner: name,
      due: hoursLabel(row.hours),
      status: Number(row.hours) > 0 ? 'On track' : 'Draft',
      done: Number(row.hours) > 0,
    }))
    if (fromWeek.length) return fromWeek
    return [{
      key: 'week-0',
      task: 'BDA OS · This week',
      owner: name,
      due: hoursLabel(weekHours),
      status: weekHours ? 'Draft' : 'Waiting',
      done: false,
    }]
  }, [timesheetRows, name, weekHours])

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

  const checkInLabel = checkInAt ? format(new Date(checkInAt), 'h:mm a') : 'Not in'
  const dayLabel = format(new Date(), 'EEEE d MMM')
  const tableRows = submitted ? submittedBoard : weekBoard

  return (
    <div className="pov">
      <div className="pov-app pov-app-bare">
        <div className="pov-app-body">
          <header className="pov-top">
            <div>
              <p className="pov-kicker">{dayLabel}</p>
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
            <article className="pov-glass plive-metric">
              <p>Logged</p>
              <strong>{hoursLabel(weekHours || liveClockMs / 3_600_000)}</strong>
              <span>This week</span>
            </article>
            <article className="pov-glass plive-metric">
              <p>Target</p>
              <strong>40h</strong>
              <span>Friday close</span>
            </article>
            <article className="pov-glass plive-metric">
              <p>Entries</p>
              <strong>{String(submitted ? entries.length : weekBoard.length)}</strong>
              <span>{submitted ? 'Tasks today' : 'This week'}</span>
            </article>
            <article className="pov-glass plive-metric">
              <p>Status</p>
              <strong>{submitted ? 'Submitted' : 'Open'}</strong>
              <span>{checkInLabel === 'Not in' ? 'Check-in still open' : `In at ${checkInLabel}`}</span>
            </article>
          </div>

          <section className="pov-glass pov-tasks">
            <div className="pov-group-head">
              <h4>{submitted ? 'Today’s tasks' : 'This week'}</h4>
              <span>{submitted ? hoursLabel(declaredMs / 3_600_000) : 'Hours follow check-in'}</span>
            </div>
            <PulseTaskRows
              rows={tableRows}
              empty={submitted ? 'No tasks submitted.' : 'No hours logged yet.'}
              taskLabel={submitted ? 'Task' : 'Day'}
              dueLabel="Hours"
            />
          </section>
        </div>
      </div>

      <Drawer
        title="Submit timesheet"
        placement="right"
        width={560}
        open={open}
        onClose={closeForm}
        destroyOnHidden
        rootClassName="pulse-ts-add-drawer"
        closable={false}
        footer={(
          <Space>
            <Button type="primary" loading={saving} onClick={onSubmit}>
              Submit timesheet
            </Button>
            <Button onClick={closeForm} disabled={saving}>Cancel</Button>
          </Space>
        )}
      >
        <div className="pulse-ts-drawer-log">
          <h4>Time log</h4>
          <dl>
            <div>
              <dt>Check-in</dt>
              <dd>{checkInLabel}</dd>
            </div>
            <div>
              <dt>Clock</dt>
              <dd>{hoursLabel(liveClockMs / 3_600_000)}</dd>
            </div>
            <div>
              <dt>This week</dt>
              <dd>{hoursLabel(weekHours)}</dd>
            </div>
            <div>
              <dt>On tasks</dt>
              <dd>{hoursLabel(declaredMs / 3_600_000)}</dd>
            </div>
          </dl>
        </div>

        <div className="pulse-ts-drawer-tasks">
          <h4>Today’s tasks</h4>
          <p>What you worked on, and for how long</p>
          <div className="pulse-ts-rows">
            <div className="pulse-ts-row is-head">
              <span>Task</span>
              <span>Hours</span>
              <span>Min</span>
              <span />
            </div>
            {rows.map((row) => (
              <div key={row.id} className="pulse-ts-row">
                <Input
                  value={row.description}
                  placeholder="Task you did today"
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
                  danger
                  icon={<DeleteOutlined />}
                  disabled={saving || rows.length <= 1}
                  aria-label="Remove task"
                  onClick={() => removeRow(row.id)}
                />
              </div>
            ))}
          </div>
          <button type="button" className="pulse-ts-add" onClick={addRow}>
            <PlusOutlined /> Add task
          </button>
        </div>
      </Drawer>
      {open
        ? createPortal(
            <button
              type="button"
              className="pulse-ts-drawer-close"
              aria-label="Close"
              onClick={closeForm}
            >
              <CloseOutlined />
            </button>,
            document.body,
          )
        : null}
    </div>
  )
}
