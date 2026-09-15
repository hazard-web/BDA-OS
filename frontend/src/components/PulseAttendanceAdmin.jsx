import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { App, Button, DatePicker, Empty, Modal, Select, Table, Tag } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api'
import { hoursLabel } from '../utils/pulseCalendar'
import PulsePlaceLabel from './PulsePlaceLabel'

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

function lastCheckOutAt(row) {
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

function eventTag(type) {
  switch (type) {
    case 'CHECK_IN':
    case 'RESUME':
      return <Tag color="success">{eventLabel(type)}</Tag>
    case 'CHECK_OUT':
      return <Tag color="warning">{eventLabel(type)}</Tag>
    case 'MIDNIGHT_CLOSE':
      return <Tag color="processing">{eventLabel(type)}</Tag>
    case 'TARGET_REACHED':
      return <Tag color="blue">{eventLabel(type)}</Tag>
    default:
      return <Tag>{eventLabel(type)}</Tag>
  }
}


export default function PulseAttendanceAdmin() {
  const { message } = App.useApp()
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('today')
  const [customDate, setCustomDate] = useState(() => dayjs())
  const [selected, setSelected] = useState(null)
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
          : err?.response?.data?.message || 'Could not load attendance',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .get('/pulse-checkin/admin/days', { params: { limit: 80, date } })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const selectedEvents = useMemo(
    () => (selected ? [...(selected.events || [])].reverse() : []),
    [selected],
  )
  const selectedCheckOut = selected ? lastCheckOutAt(selected) : null

  return (
    <div className="pulse-ts-admin pulse-org-att">
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
            aria-label="Attendance date filter"
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
        <p className="pulse-ts-admin-empty">Loading employee attendance…</p>
      ) : null}

      {!loading && !days.length ? (
        <div className="pov-glass pulse-ts-person">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No employees to show yet" />
        </div>
      ) : null}

      <div className="pulse-ts-admin-grid">
        {days.map((row) => {
          const label = attendanceLabel(row)
          const active = label === 'Active'
          const checkOut = lastCheckOutAt(row)
          const events = [...(row.events || [])].reverse().slice(0, 4)
          return (
            <button
              type="button"
              key={String(row.user || row.email)}
              className="pov-glass pulse-ts-person is-clickable"
              onClick={() => setSelected(row)}
            >
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
                <span className={`pulse-ts-person-tag${active ? ' is-on' : ''}`}>
                  {label}
                </span>
              </header>

              <div className="pulse-ts-person-metrics">
                <div>
                  <p>Check-in</p>
                  <strong>{row.checkInAt ? format(new Date(row.checkInAt), 'h:mm a') : '—'}</strong>
                </div>
                <div>
                  <p>Check-out</p>
                  <strong>{checkOut ? format(new Date(checkOut), 'h:mm a') : row.status === 'active' ? 'In' : '—'}</strong>
                </div>
                <div>
                  <p>Worked</p>
                  <strong>{clockLabel(row.totalActiveMs)}</strong>
                  {row.anomaly?.flagged ? (
                    <em className="pulse-ts-anomaly" title={row.anomaly.reason || 'Hours exceed session wall time'}>
                      Review
                    </em>
                  ) : null}
                </div>
              </div>

              <ul className="pulse-ts-person-tasks">
                {events.length ? events.map((event, index) => (
                  <li key={event._id || `${event.type}-${event.at}-${index}`}>
                    <span>{eventLabel(event.type)}</span>
                    <em>{event.at ? format(new Date(event.at), 'h:mm a') : '—'}</em>
                  </li>
                )) : (
                  <li className="is-empty">No check-in activity</li>
                )}
              </ul>
            </button>
          )
        })}
      </div>

      <Modal
        open={Boolean(selected)}
        onCancel={() => setSelected(null)}
        footer={null}
        width={920}
        destroyOnHidden
        rootClassName="pulse-att-detail-modal-root"
        className="pulse-att-detail-modal"
        title={selected ? `${personName(selected)} · check-in activity` : 'Check-in activity'}
      >
        {selected ? (
          <div className="pulse-att-detail">
            <p className="pulse-att-detail-sub">{selected.email || 'No email'}</p>
            <div className="pulse-ts-person-metrics pulse-att-detail-metrics">
              <div>
                <p>Status</p>
                <strong>{attendanceLabel(selected)}</strong>
              </div>
              <div>
                <p>Check-in</p>
                <strong>{selected.checkInAt ? format(new Date(selected.checkInAt), 'h:mm a') : '—'}</strong>
              </div>
              <div>
                <p>Check-out</p>
                <strong>
                  {selectedCheckOut
                    ? format(new Date(selectedCheckOut), 'h:mm a')
                    : selected.status === 'active'
                      ? 'In'
                      : '—'}
                </strong>
              </div>
              <div>
                <p>Worked</p>
                <strong>{clockLabel(selected.totalActiveMs)}</strong>
                {selected.anomaly?.flagged ? (
                  <p className="pulse-ts-anomaly-note">{selected.anomaly.reason || 'Hours exceed session wall time'}</p>
                ) : null}
              </div>
            </div>

            <Table
              size="small"
              pagination={false}
              rowKey={(e) => e._id || `${e.type}-${e.at}`}
              dataSource={selectedEvents}
              scroll={{ x: 720 }}
              locale={{
                emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No events yet" />,
              }}
              columns={[
                {
                  title: 'When',
                  dataIndex: 'at',
                  width: 170,
                  render: (v) => (v ? format(new Date(v), 'd MMM · h:mm a') : '—'),
                },
                {
                  title: 'Activity',
                  dataIndex: 'type',
                  width: 140,
                  render: (v) => eventTag(v),
                },
                {
                  title: 'Timer at event',
                  dataIndex: 'activeMsAtEvent',
                  width: 120,
                  render: (ms) => clockLabel(ms),
                },
                {
                  title: 'IP',
                  dataIndex: 'ip',
                  width: 130,
                  render: (v) => v || '—',
                },
                {
                  title: 'Location',
                  key: 'loc',
                  render: (_, e) => <PulsePlaceLabel location={e.location} />,
                },
              ]}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
