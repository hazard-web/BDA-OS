import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

/** Live status refresh while viewing today (keep light - cards API is org-wide). */
const LIVE_POLL_MS = 30_000

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function clockLabel(ms) {
  const safe = Math.max(0, Number(ms) || 0)
  return hoursLabel(safe / 3_600_000)
}

function lastCheckOutAt(row) {
  if (row?.checkOutAt) return row.checkOutAt
  const events = [...(row.events || [])].reverse()
  const event = events.find((item) => item.type === 'CHECK_OUT' || item.type === 'MIDNIGHT_CLOSE')
  if (event?.at) return event.at
  const session = [...(row.sessions || [])].reverse().find((item) => item.checkOutAt)
  return session?.checkOutAt || null
}

function attendanceLabel(row) {
  if (row.status === 'active') return 'Active'
  if (row.checkInAt || Number(row.totalActiveMs) > 0 || row.status === 'stopped' || row.status === 'closed') {
    return 'Not active'
  }
  return 'Absent'
}

function eventLabel(type) {
  switch (type) {
    case 'CHECK_IN':
      return 'Checked in'
    case 'RESUME':
      return 'Checked in again'
    case 'CHECK_OUT':
      return 'Checked out'
    case 'MIDNIGHT_CLOSE':
      return 'Day closed'
    case 'TARGET_REACHED':
      return '9h target'
    default:
      return type || 'Activity'
  }
}

function formatEventIp(ip) {
  const value = String(ip || '').trim()
  if (!value) return ''
  if (value === '127.0.0.1' || value === '::1' || value === 'localhost' || value === '0.0.0.0') return ''
  return value
}

function formatEventPlace(event) {
  const loc = event?.location
  if (!loc) return ''
  const lat = Number(loc.lat)
  const lng = Number(loc.lng)
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) {
    return ''
  }
  const named = [loc.city, loc.locality || loc.sector, loc.state].filter(Boolean)
  if (named.length) return [...new Set(named)].join(', ')
  if (loc.displayName) {
    return String(loc.displayName)
      .split(',')
      .slice(0, 2)
      .map((p) => p.trim())
      .filter(Boolean)
      .join(', ')
  }
  if (Number.isFinite(lat) && Number.isFinite(lng)) return `${lat.toFixed(2)}, ${lng.toFixed(2)}`
  return ''
}

export default function PulseAttendanceAdmin() {
  const { message } = App.useApp()
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('today')
  const [customDate, setCustomDate] = useState(() => dayjs())
  const [selected, setSelected] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const viewed = useMemo(() => {
    const next = period === 'custom' && customDate ? customDate.toDate() : new Date()
    return next
  }, [period, customDate])
  const date = dayKey(viewed)
  const isToday = date === dayKey()
  const dateRef = useRef(date)
  dateRef.current = date

  const fetchDays = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const res = await api.get('/pulse-checkin/admin/days', {
        params: { limit: 80, date: dateRef.current, view: 'cards' },
      })
      if (dateRef.current !== date) return
      setDays(res.data?.data || [])
    } catch (err) {
      if (dateRef.current !== date) return
      if (!silent) {
        setDays([])
        const status = err?.response?.status
        message.error(
          status === 403
            ? 'Admin access required'
            : err?.response?.data?.message || 'Could not load attendance',
        )
      }
    } finally {
      if (dateRef.current === date && !silent) setLoading(false)
    }
  }, [date, message])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .get('/pulse-checkin/admin/days', {
        params: { limit: 80, date, view: 'cards' },
      })
      .then((res) => {
        if (!cancelled) setDays(res.data?.data || [])
      })
      .catch((err) => {
        if (cancelled) return
        setDays([])
        const status = err?.response?.status
        message.error(
          status === 403
            ? 'Admin access required'
            : err?.response?.data?.message || 'Could not load attendance',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [date, message])

  useEffect(() => {
    if (!isToday) return undefined
    const id = window.setInterval(() => {
      void fetchDays({ silent: true })
    }, LIVE_POLL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') void fetchDays({ silent: true })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [isToday, fetchDays])

  const openDetail = async (row) => {
    setSelected(row)
    setDetailLoading(true)
    try {
      const res = await api.get('/pulse-checkin/admin/days/detail', {
        params: { user: row.user, date },
      })
      const detail = res.data?.data
      if (detail) setSelected(detail)
    } catch {
      /* keep card preview in the slide-in */
    } finally {
      setDetailLoading(false)
    }
  }

  const selectedEvents = useMemo(() => {
    if (!selected) return []
    return [...(selected.events || [])].sort((a, b) => {
      const ta = a?.at ? new Date(a.at).getTime() : 0
      const tb = b?.at ? new Date(b.at).getTime() : 0
      return ta - tb
    })
  }, [selected])
  const selectedCheckOut = selected ? lastCheckOutAt(selected) : null
  const atToday = dayjs(viewed).isSame(dayjs(), 'day')

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
    <div className="pulse-att-page pulse-org-admin-att pulse-att-admin">
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
              aria-label="Attendance date filter"
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

        <section className="pulse-att-panel" aria-label="Company attendance">
          <div className="pulse-att-panel-chrome">
            <header className="pulse-att-panel-head">
              <h4>Attendance</h4>
              <span>
                {days.length} people
              </span>
            </header>
            <div className="pulse-att-cols pulse-att-admin-cols" aria-hidden="true">
              <span className="pulse-att-cols-spacer" />
              <span>Person</span>
              <span>Check-in</span>
              <span>Check-out</span>
              <span>Worked</span>
              <span>Status</span>
            </div>
          </div>

          <div className="pulse-org-admin-body">
            {loading && !days.length ? (
              <p className="pulse-org-admin-empty">Loading employee attendance…</p>
            ) : !loading && !days.length ? (
              <div className="pulse-org-admin-empty">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No employees to show yet" />
              </div>
            ) : (
              <ul className="pulse-att-list" aria-label="Employee attendance">
                {days.map((row) => {
                  const label = attendanceLabel(row)
                  const active = label === 'Active'
                  const checkOut = lastCheckOutAt(row)
                  return (
                    <li
                      key={String(row.user || row.email)}
                      className={`pulse-att-row pulse-org-admin-row is-clickable${active ? ' is-today' : ''}`}
                      onClick={() => void openDetail(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          void openDetail(row)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <span className={`pulse-att-dot ${active ? 'is-ok' : label === 'Absent' ? 'is-open' : 'is-bad'}`} aria-hidden="true" />
                      <div className="pulse-att-day">
                        <strong>{personName(row)}</strong>
                        <span>{row.email || 'No email'}</span>
                      </div>
                      <div className="pulse-att-hours">
                        {row.checkInAt ? format(new Date(row.checkInAt), 'h:mm a') : '-'}
                      </div>
                      <div className="pulse-att-hours">
                        {checkOut ? format(new Date(checkOut), 'h:mm a') : row.status === 'active' ? 'In' : '-'}
                      </div>
                      <div className="pulse-att-hours">
                        {clockLabel(row.totalActiveMs)}
                        {row.anomaly?.flagged ? (
                          <em className="pulse-ts-anomaly" title={row.anomaly.reason || 'Hours exceed session wall time'}>
                            {' '}Review
                          </em>
                        ) : null}
                      </div>
                      <span className={`pulse-att-status ${active ? 'is-ok' : label === 'Absent' ? 'is-open' : 'is-bad'}`}>
                        {label}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <Drawer
        title={selected ? personName(selected) : 'Attendance'}
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
                <p>
                  {[selected.email || null, detailLoading ? 'Loading…' : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <span
                className={`pulse-att-status ${
                  attendanceLabel(selected) === 'Active'
                    ? 'is-ok'
                    : attendanceLabel(selected) === 'Absent'
                      ? 'is-open'
                      : 'is-bad'
                }`}
              >
                {attendanceLabel(selected)}
              </span>
            </header>

            <div className="pulse-att-detail-metrics" role="group" aria-label="Day summary">
              <div>
                <p>Check-in</p>
                <strong>{selected.checkInAt ? format(new Date(selected.checkInAt), 'h:mm a') : '-'}</strong>
              </div>
              <div>
                <p>Check-out</p>
                <strong>
                  {selectedCheckOut
                    ? format(new Date(selectedCheckOut), 'h:mm a')
                    : selected.status === 'active'
                      ? 'Still in'
                      : '-'}
                </strong>
              </div>
              <div>
                <p>Worked</p>
                <strong>{clockLabel(selected.totalActiveMs)}</strong>
              </div>
              <div>
                <p>Sessions</p>
                <strong>{selectedEvents.filter((e) => e.type === 'CHECK_IN' || e.type === 'RESUME').length || '-'}</strong>
              </div>
            </div>

            {selected.anomaly?.flagged ? (
              <p className="pulse-ts-anomaly-note">
                {selected.anomaly.reason || 'Hours exceed session wall time'}
              </p>
            ) : null}

            <div className="pulse-att-detail-activity">
              <h4>Check-in activity</h4>
              {detailLoading && !selectedEvents.length ? (
                <p className="pulse-att-detail-empty">Loading activity…</p>
              ) : selectedEvents.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No check-in events yet" />
              ) : (
                <ul className="pulse-att-detail-timeline" aria-label="Check-in events">
                  {selectedEvents.map((event, index) => {
                    const tone =
                      event.type === 'CHECK_OUT' || event.type === 'MIDNIGHT_CLOSE'
                        ? 'out'
                        : event.type === 'TARGET_REACHED'
                          ? 'target'
                          : 'in'
                    const place = formatEventPlace(event)
                    const ip = formatEventIp(event.ip)
                    const meta = [place, ip].filter(Boolean).join(' · ')
                    return (
                      <li key={event._id || `${event.type}-${event.at}-${index}`} className={`is-${tone}`}>
                        <span className="pulse-att-detail-rail" aria-hidden="true" />
                        <span className="pulse-att-detail-dot" aria-hidden="true" />
                        <div className="pulse-att-detail-when">
                          <strong>{event.at ? format(new Date(event.at), 'h:mm a') : '-'}</strong>
                        </div>
                        <div className="pulse-att-detail-what">
                          <strong>{eventLabel(event.type)}</strong>
                          {meta ? <span>{meta}</span> : null}
                        </div>
                        <div className="pulse-att-detail-elapsed" title="Timer at event">
                          {clockLabel(event.activeMsAtEvent)}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>
      <PulseSlideClose open={Boolean(selected)} onClose={() => setSelected(null)} width={720} top={76} />
    </div>
  )
}
