import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { App, Button, Card, Empty, Table, Tag } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import api from '../api'
import { hoursLabel as hoursFromValue } from '../utils/pulseCalendar'
import PulsePlaceLabel from './PulsePlaceLabel'

function hoursLabel(ms) {
  const safe = Math.max(0, Number(ms) || 0)
  const h = Math.floor(safe / 3_600_000)
  const m = Math.floor((safe % 3_600_000) / 60_000)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function eventTag(type) {
  switch (type) {
    case 'CHECK_IN':
      return <Tag color="success">Checked in</Tag>
    case 'RESUME':
      return <Tag color="success">Checked in again</Tag>
    case 'CHECK_OUT':
      return <Tag color="warning">Checked out</Tag>
    case 'MIDNIGHT_CLOSE':
      return <Tag color="processing">Day closed</Tag>
    case 'TARGET_REACHED':
      return <Tag color="blue">9h target</Tag>
    default:
      return <Tag>{type || 'Activity'}</Tag>
  }
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function taskTimeLabel(row) {
  const minutes = Number(row.taskMinutes) || (row.taskEntries || []).reduce((sum, item) => sum + (Number(item.minutes) || 0), 0)
  return hoursFromValue(minutes / 60)
}

/** Organization: org-wide check-in activity — Ant Design. */
export default function PulseCheckInAdmin({ mode = 'checkin' }) {
  const { message } = App.useApp()
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(true)
  const timesheet = mode === 'timesheet'

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/pulse-checkin/admin/days', {
        params: timesheet ? { limit: 80, date: todayKey() } : { limit: 40 },
      })
      setDays(res.data?.data || [])
    } catch (err) {
      setDays([])
      const status = err?.response?.status
      const msg =
        status === 404
          ? 'API not found — restart the backend (port 5001).'
          : status === 401
            ? 'Session expired — sign in again.'
            : status === 403
              ? 'Admin access required'
              : err?.response?.data?.message || 'Could not load check-in activity'
      message.error(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      width: 120,
      render: (v) => v || '—',
    },
    {
      title: 'Person',
      dataIndex: 'email',
      ellipsis: true,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 110,
      render: (v) => {
        const color = v === 'active' ? 'success' : v === 'closed' ? 'processing' : 'default'
        return <Tag color={color}>{v || 'idle'}</Tag>
      },
    },
    timesheet
      ? {
          title: 'Check-in',
          dataIndex: 'checkInAt',
          width: 110,
          render: (v) => (v ? format(new Date(v), 'h:mm a') : '—'),
        }
      : null,
    {
      title: 'Worked',
      dataIndex: 'totalActiveMs',
      width: 110,
      render: (ms, row) =>
        row.timesheetHours != null && row.timesheetLogged ? `${row.timesheetHours}h` : hoursLabel(ms),
    },
    timesheet
      ? {
          title: 'Tasks',
          key: 'tasks',
          width: 80,
          render: (_, row) => row.taskEntries?.length || 0,
        }
      : null,
    timesheet
      ? {
          title: 'Task time',
          key: 'taskTime',
          width: 110,
          render: (_, row) => taskTimeLabel(row),
        }
      : null,
    {
      title: 'Timesheet',
      dataIndex: timesheet ? 'timesheetSubmitted' : 'timesheetLogged',
      width: 120,
      render: (v) => (v ? <Tag color="green">{timesheet ? 'Submitted' : 'Logged'}</Tag> : <Tag>{timesheet ? 'Draft' : 'Open'}</Tag>),
    },
    timesheet
      ? null
      : {
          title: 'Events',
          key: 'events',
          width: 80,
          render: (_, row) => row.events?.length || 0,
        },
  ].filter(Boolean)

  const expandedRowRender = (row) => {
    const events = [...(row.events || [])].reverse()
    const tasks = row.taskEntries || []
    return (
      <div className="pulse-ts-admin-detail">
        {timesheet ? (
          <Table
            size="small"
            pagination={false}
            rowKey={(item) => item._id || item.description}
            dataSource={tasks}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tasks submitted" /> }}
            columns={[
              { title: 'Task', dataIndex: 'description' },
              { title: 'Project', dataIndex: 'project', width: 140, render: (v) => v || 'BDA OS' },
              {
                title: 'Time',
                dataIndex: 'minutes',
                width: 110,
                render: (mins) => hoursFromValue((Number(mins) || 0) / 60),
              },
            ]}
          />
        ) : null}
        {events.length ? (
          <Table
            size="small"
            pagination={false}
            rowKey={(e) => e._id || `${e.type}-${e.at}`}
            dataSource={events}
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
                render: (ms) => hoursLabel(ms),
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
        ) : timesheet ? null : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No events yet" />
        )}
      </div>
    )
  }

  return (
    <Card
      size="small"
      className="pulse-org-card"
      title={timesheet ? 'Time tracker' : 'Check-in activity'}
      extra={
        <Button type="text" icon={<ReloadOutlined />} onClick={load} loading={loading} aria-label="Refresh" />
      }
    >
      <Table
        size="small"
        loading={loading}
        rowKey={(row) => row._id || `${row.email}-${row.date}`}
        dataSource={days}
        columns={columns}
        pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }}
        expandable={{ expandedRowRender }}
        scroll={{ x: 720 }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={timesheet ? 'No timesheets for today yet' : 'No check-in activity yet'}
            />
          ),
        }}
      />
    </Card>
  )
}
