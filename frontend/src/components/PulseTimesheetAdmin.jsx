import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { App, Button, DatePicker, Empty, Select } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api'
import { hoursLabel } from '../utils/pulseCalendar'

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

function personName(row) {
  return row.name || String(row.email || '').split('@')[0] || 'Employee'
}

function personInitial(row) {
  return personName(row).trim().charAt(0).toUpperCase() || 'E'
}

export default function PulseTimesheetAdmin() {
  const { message } = App.useApp()
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('today')
  const [customDate, setCustomDate] = useState(() => dayjs())
  const viewed = useMemo(() => {
    const next = period === 'custom' && customDate ? customDate.toDate() : new Date()
    return next
  }, [period, customDate])
  const date = dayKey(viewed)

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

  return (
    <div className="pulse-ts-admin">
      <header className="pulse-ts-admin-head">
        <div>
          <p className="pov-kicker">{period === 'custom' ? 'Custom' : 'Today'}</p>
          <h2>{format(viewed, 'EEEE d MMM')}</h2>
        </div>
        <div className="pulse-ts-admin-filter">
          <Select
            value={period}
            onChange={setPeriod}
            options={DATE_FILTERS}
            className="pulse-ts-admin-select"
            classNames={{ popup: { root: 'pulse-att-select-dropdown' } }}
            aria-label="Timesheet date filter"
          />
          {period === 'custom' ? (
            <DatePicker
              value={customDate}
              allowClear={false}
              format="DD-MMM-YYYY"
              className="pulse-ts-admin-date"
              classNames={{ popup: { root: 'pulse-att-range-dropdown' } }}
              disabledDate={(value) => value && value.isAfter(dayjs(), 'day')}
              onChange={(next) => {
                if (next) setCustomDate(next)
              }}
            />
          ) : null}
          <Button type="text" icon={<ReloadOutlined />} onClick={load} loading={loading} aria-label="Refresh" />
        </div>
      </header>

      {loading && !days.length ? (
        <p className="pulse-ts-admin-empty">Loading employee timesheets…</p>
      ) : null}

      {!loading && !days.length ? (
        <div className="pov-glass pulse-ts-person">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No employees to show yet" />
        </div>
      ) : null}

      <div className="pulse-ts-admin-grid">
        {days.map((row) => {
          const tasks = row.taskEntries || []
          const submitted = Boolean(row.timesheetSubmitted)
          return (
            <article key={String(row.user || row.email)} className="pov-glass pulse-ts-person">
              <header className="pulse-ts-person-head">
                {row.avatarUrl ? (
                  <img className="pulse-ts-person-avatar" src={row.avatarUrl} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="pulse-ts-person-avatar is-fallback" aria-hidden="true">{personInitial(row)}</span>
                )}
                <div>
                  <h3>{personName(row)}</h3>
                  <p>{row.email || 'No email'}</p>
                </div>
                <span className={`pulse-ts-person-tag${submitted ? ' is-on' : ''}`}>
                  {submitted ? 'Submitted' : tasks.length ? 'Draft' : 'No timesheet'}
                </span>
              </header>

              <div className="pulse-ts-person-metrics">
                <div>
                  <p>Check-in</p>
                  <strong>{row.checkInAt ? format(new Date(row.checkInAt), 'h:mm a') : '—'}</strong>
                </div>
                <div>
                  <p>Clock</p>
                  <strong>{clockLabel(row.totalActiveMs)}</strong>
                </div>
                <div>
                  <p>Task time</p>
                  <strong>{hoursLabel((Number(row.taskMinutes) || 0) / 60)}</strong>
                </div>
              </div>

              <ul className="pulse-ts-person-tasks">
                {tasks.length ? tasks.map((task, index) => (
                  <li key={task._id || `${task.description}-${index}`}>
                    <span>{task.description}</span>
                    <em>{hoursLabel((Number(task.minutes) || 0) / 60)}</em>
                  </li>
                )) : (
                  <li className="is-empty">No tasks submitted yet</li>
                )}
              </ul>
            </article>
          )
        })}
      </div>
    </div>
  )
}
