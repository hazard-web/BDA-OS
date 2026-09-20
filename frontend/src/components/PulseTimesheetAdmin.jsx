import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { App, DatePicker, Drawer, Empty, Select } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api'
import { hoursLabel } from '../utils/pulseCalendar'
import { personName } from '../utils/pulsePerson'
import PulseSlideClose from './PulseSlideClose'
import './pulse-performance.css'

const DATE_FILTERS = [
  { value: 'today', label: 'Today' },
  { value: 'custom', label: 'Custom' },
]

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function clockLabel(ms) {
  const safe = Math.max(0, Number(ms) || 0)
  return hoursLabel(safe / 3_600_000)
}

function rowStatus(row) {
  const tasks = row.taskEntries || []
  if (row.timesheetSubmitted) return { label: 'Submitted', tone: 'ok' }
  if (tasks.length) return { label: 'Draft', tone: 'open' }
  return { label: 'No timesheet', tone: 'bad' }
}

export default function PulseTimesheetAdmin() {
  const { message } = App.useApp()
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [period, setPeriod] = useState('today')
  const [customDate, setCustomDate] = useState(() => dayjs())
  const viewed = useMemo(() => {
    const next = period === 'custom' && customDate ? customDate.toDate() : new Date()
    return next
  }, [period, customDate])
  const date = dayKey(viewed)
  const atToday = dayjs(viewed).isSame(dayjs(), 'day')

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/pulse-checkin/admin/days', { params: { limit: 80, date } })
      setDays(res.data?.data || [])
    } catch (err) {
      setDays([])
      const status = err?.response?.status
      message.error(
        status === 403
          ? 'Admin access required'
          : err?.response?.data?.message || 'Could not load timesheets',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const shiftDay = (delta) => {
    const base = period === 'custom' && customDate ? customDate : dayjs()
    const next = base.add(delta, 'day').startOf('day')
    if (next.isAfter(dayjs(), 'day')) return
    if (next.isSame(dayjs(), 'day')) {
      setPeriod('today')
      setCustomDate(dayjs())
      return
    }
    setPeriod('custom')
    setCustomDate(next)
  }

  return (
    <div className="pulse-att-page pulse-org-admin-att pulse-ts-admin-att">
      <div className="pulse-att-board">
        <header className="pulse-att-toolbar">
          <div className="pulse-att-period">
            <div className="pulse-att-day-nav" role="group" aria-label="Change day">
              <button
                type="button"
                className="pulse-att-day-step"
                onClick={() => shiftDay(-1)}
                aria-label="Previous day"
              >
                <LeftOutlined />
              </button>
              <button
                type="button"
                className="pulse-att-day-step"
                onClick={() => shiftDay(1)}
                disabled={atToday}
                aria-label="Next day"
              >
                <RightOutlined />
              </button>
            </div>
            <strong className="pulse-org-admin-day-label">{format(viewed, 'EEEE d MMM')}</strong>
            <Select
              value={period}
              onChange={(next) => {
                setPeriod(next)
                if (next === 'today') setCustomDate(dayjs())
              }}
              options={DATE_FILTERS}
              className="pulse-att-select pulse-org-admin-select"
              classNames={{ popup: { root: 'pulse-att-select-dropdown' } }}
              aria-label="Timesheet date filter"
            />
            {period === 'custom' ? (
              <DatePicker
                value={customDate}
                allowClear={false}
                format="DD-MMM-YYYY"
                className="pulse-org-admin-date"
                classNames={{ popup: { root: 'pulse-att-range-dropdown' } }}
                disabledDate={(value) => value && value.isAfter(dayjs(), 'day')}
                onChange={(next) => {
                  if (!next) return
                  if (next.isSame(dayjs(), 'day')) {
                    setPeriod('today')
                    setCustomDate(dayjs())
                    return
                  }
                  setCustomDate(next)
                }}
              />
            ) : null}
          </div>
        </header>

        <section className="pulse-att-panel" aria-label="Company timesheets">
          <div className="pulse-att-panel-chrome">
            <header className="pulse-att-panel-head">
              <h4>Timesheets</h4>
              <span>
                {days.length} people
              </span>
            </header>
            <div className="pulse-att-cols pulse-ts-admin-cols" aria-hidden="true">
              <span className="pulse-att-cols-spacer" />
              <span>Person</span>
              <span>Check-in</span>
              <span>Clock</span>
              <span>Tasks</span>
              <span>Status</span>
            </div>
          </div>

          <div className="pulse-org-admin-body">
            {loading && !days.length ? (
              <p className="pulse-org-admin-empty">Loading employee timesheets…</p>
            ) : !loading && !days.length ? (
              <div className="pulse-org-admin-empty">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No employees to show yet" />
              </div>
            ) : (
              <ul className="pulse-att-list" aria-label="Employee timesheets">
                {days.map((row) => {
                  const tasks = row.taskEntries || []
                  const { label: status, tone } = rowStatus(row)
                  return (
                    <li
                      key={String(row.user || row.email)}
                      className="pulse-att-row pulse-org-admin-row is-clickable"
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelected(row)
                        }
                      }}
                    >
                      <span className={`pulse-att-dot is-${tone}`} aria-hidden="true" />
                      <div className="pulse-att-day">
                        <strong>{personName(row)}</strong>
                        <span>{row.email || 'No email'}</span>
                      </div>
                      <div className="pulse-att-hours">
                        {row.checkInAt ? format(new Date(row.checkInAt), 'h:mm a') : '-'}
                      </div>
                      <div className="pulse-att-hours">{clockLabel(row.totalActiveMs)}</div>
                      <div className="pulse-att-hours">
                        {hoursLabel((Number(row.taskMinutes) || 0) / 60)}
                        {tasks.length ? (
                          <em className="pulse-org-admin-task-hint">
                            {' '}
                            · {tasks.length} task{tasks.length === 1 ? '' : 's'}
                          </em>
                        ) : null}
                      </div>
                      <span className={`pulse-att-status is-${tone}`}>{status}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <Drawer
        title={selected ? personName(selected) : 'Timesheet'}
        placement="right"
        width={720}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        destroyOnHidden
        rootClassName="pulse-perf-edit-drawer"
        zIndex={1195}
        closable={false}
        styles={{
          mask: { boxShadow: 'none' },
          wrapper: { boxShadow: 'none' },
          content: { boxShadow: 'none' },
        }}
      >
        {selected ? (
          <div className="pulse-att-detail">
            <header className="pulse-att-detail-head">
              <div className="pulse-att-detail-head-copy">
                <p>{selected.email || ''}</p>
              </div>
              <span className={`pulse-att-status is-${rowStatus(selected).tone}`}>
                {rowStatus(selected).label}
              </span>
            </header>

            <div className="pulse-att-detail-metrics" role="group" aria-label="Timesheet summary">
              <div>
                <p>Check-in</p>
                <strong>{selected.checkInAt ? format(new Date(selected.checkInAt), 'h:mm a') : '-'}</strong>
              </div>
              <div>
                <p>Clock</p>
                <strong>{clockLabel(selected.totalActiveMs)}</strong>
              </div>
              <div>
                <p>Task time</p>
                <strong>{hoursLabel((Number(selected.taskMinutes) || 0) / 60)}</strong>
              </div>
              <div>
                <p>Tasks</p>
                <strong>{(selected.taskEntries || []).length || '-'}</strong>
              </div>
            </div>

            <div className="pulse-att-detail-activity">
              <h4>What they filled</h4>
              {!(selected.taskEntries || []).length ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No tasks filled for this day"
                />
              ) : (
                <ul className="pulse-ts-admin-filled" aria-label="Timesheet tasks">
                  {(selected.taskEntries || []).map((task, index) => (
                    <li key={task._id || `${task.description}-${index}`}>
                      <div>
                        <strong>{task.description || 'Task'}</strong>
                      </div>
                      <em>{hoursLabel((Number(task.minutes) || 0) / 60)}</em>
                    </li>
                  ))}
                </ul>
              )}
              {selected.timesheetSubmittedAt ? (
                <p className="pulse-ts-admin-filled-meta">
                  Submitted {format(new Date(selected.timesheetSubmittedAt), 'd MMM · h:mm a')}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Drawer>
      <PulseSlideClose open={Boolean(selected)} onClose={() => setSelected(null)} width={720} top={76} />
    </div>
  )
}
