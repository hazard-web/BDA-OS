import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import {
  Avatar,
  Button,
  Card,
  Col,
  Dropdown,
  Empty,
  Flex,
  Input,
  List,
  Modal,
  Progress,
  Result,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import {
  CalendarOutlined,
  MailOutlined,
  MoreOutlined,
  NotificationOutlined,
  PlusOutlined,
  SoundOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import HrGettingStarted from '../components/HrGettingStarted'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const fmtTime = (dt) => {
  if (!dt) return '—'
  return new Date(dt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

const calcWorkedTime = (record, now) => {
  if (!record) return '—'
  if (!record.sessions || !Array.isArray(record.sessions) || record.sessions.length === 0) {
    if (!record.punchIn) return '—'
    const start = new Date(record.punchIn)
    const end = record.punchOut ? new Date(record.punchOut) : now
    const diffMs = Math.max(0, end - start)
    const h = Math.floor(diffMs / 3600000)
    const m = Math.floor((diffMs % 3600000) / 60000)
    return `${h}h ${String(m).padStart(2, '0')}m`
  }
  let totalMs = 0
  record.sessions.forEach((session) => {
    if (!session) return
    const start = new Date(session.startTime)
    const end = session.endTime ? new Date(session.endTime) : session.isActive ? now : null
    if (start && end) totalMs += Math.max(0, end.getTime() - start.getTime())
  })
  const h = Math.floor(totalMs / 3600000)
  const m = Math.floor((totalMs % 3600000) / 60000)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

const monthValue = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

const parseMonthValue = (value) => {
  const [year, month] = String(value || '').split('-').map(Number)
  const now = new Date()
  return {
    year: Number.isFinite(year) ? year : now.getFullYear(),
    month: Number.isFinite(month) ? month : now.getMonth() + 1,
  }
}

const shiftMonthValue = (value, delta) => {
  const { year, month } = parseMonthValue(value)
  return monthValue(new Date(year, month - 1 + delta, 1))
}

const buildMonthOptions = (count = 18) => {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return { value: monthValue(date), label: `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}` }
  })
}

const getLatestAttendanceSession = (record) => {
  const sessions = Array.isArray(record?.sessions) ? record.sessions.filter(Boolean) : []
  const normalized = sessions
    .map((session) => ({
      ...session,
      startTime: session?.startTime ? new Date(session.startTime) : null,
      endTime: session?.endTime ? new Date(session.endTime) : null,
    }))
    .filter((session) => session.startTime && !Number.isNaN(session.startTime.getTime()))

  if (!normalized.length) {
    if (!record?.punchIn) return null
    return {
      startTime: new Date(record.punchIn),
      endTime: record.punchOut ? new Date(record.punchOut) : null,
      isActive: !record.punchOut,
      source: record?.source || 'MANUAL',
    }
  }
  normalized.sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
  return normalized[0]
}

const formatAttendanceLogout = (session, active) => {
  if (active) return '—'
  if (!session?.endTime) return '—'
  const endTime = new Date(session.endTime)
  const isAutoAt1159 =
    (session?.source === 'AUTO_PUNCH_OUT' || session?.source === 'SYSTEM') &&
    endTime.getHours() === 23 &&
    endTime.getMinutes() === 59
  return isAutoAt1159 ? '11:59 PM (Auto)' : fmtTime(endTime)
}

function StaffCell({ staff, onClick }) {
  return (
    <Flex gap={8} align="center" style={{ cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <Avatar src={staff?.documents?.profileImage?.url} size={28}>
        {(staff?.fullName || '?').charAt(0)}
      </Avatar>
      <Typography.Text strong ellipsis>
        {staff?.fullName || 'Unknown'}
      </Typography.Text>
    </Flex>
  )
}

function AttentionRequired({ notActiveStaff, approvedOnLeaveToday, pendingLeaves, fetchData, loading }) {
  const navigate = useNavigate()
  const [composer, setComposer] = useState({ open: false, type: 'email', subject: '', body: '', recipientName: '', recipientId: '' })

  const openComposer = (item, actionType) => {
    const staff = item.staff || {}
    const startStr = item.startDate ? new Date(item.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
    const endStr = item.endDate ? new Date(item.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
    let subject = ''
    let body = ''
    if (actionType === 'email') {
      if (item.type === 'absent') {
        subject = `Absence notice — ${staff.fullName || 'Employee'}`
        body = `Hello ${staff.fullName || 'Team Member'},\n\nWe noticed that you have not punched in for today's shift yet. Please update your status on the portal.\n\nHR Team`
      } else if (item.type === 'pending') {
        subject = 'Leave request review update'
        body = `Hello ${staff.fullName || 'Team Member'},\n\nYour leave request from ${startStr} to ${endStr} is currently under review.\n\nHR Team`
      } else {
        subject = 'On leave today'
        body = `Hello ${staff.fullName || 'Team Member'},\n\nYou are marked as on leave today.\n\nHR Team`
      }
    } else {
      body =
        item.type === 'absent'
          ? 'Please punch in today as soon as possible.'
          : item.type === 'pending'
            ? `Your leave request from ${startStr} to ${endStr} is under review.`
            : 'You are marked as on leave today.'
    }
    setComposer({
      open: true,
      type: actionType,
      subject,
      body,
      recipientName: staff.fullName || 'Employee',
      recipientId: staff._id,
    })
  }

  const handleLeaveAction = async (id, status) => {
    try {
      const res = await api.post('/leaves/admin/respond', { id, status, adminNotes: 'Responded via Dashboard Widget' })
      if (res.data.success) {
        toast.success(`Leave request ${status.toLowerCase()} successfully`)
        fetchData?.()
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update leave request')
    }
  }

  const attentionItems = useMemo(() => {
    const items = []
    pendingLeaves.forEach((leave) => {
      items.push({
        id: leave._id,
        type: 'pending',
        staff: leave.staff,
        leaveType: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        reason: leave.reason,
      })
    })
    approvedOnLeaveToday.forEach((leave) => {
      items.push({
        id: leave._id,
        type: 'leave',
        staff: leave.staff,
        leaveType: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        reason: leave.reason,
      })
    })
    notActiveStaff.forEach((staff) => {
      items.push({ id: staff._id, type: 'absent', staff, employeeId: staff.employeeId })
    })
    return items
  }, [pendingLeaves, approvedOnLeaveToday, notActiveStaff])

  const columns = [
    {
      title: 'Employee',
      dataIndex: 'staff',
      render: (staff) => <StaffCell staff={staff} onClick={() => staff?._id && navigate(`/staff/${staff._id}`)} />,
    },
    {
      title: 'Status',
      dataIndex: 'type',
      width: 150,
      render: (type) => {
        if (type === 'pending') return <Tag color="gold">Pending request</Tag>
        if (type === 'leave') return <Tag color="blue">On leave</Tag>
        return <Tag color="red">Absent</Tag>
      },
    },
    {
      title: 'Details',
      render: (_, item) => {
        if (item.type === 'absent') return <Typography.Text type="secondary">Not active today</Typography.Text>
        const startStr = item.startDate ? new Date(item.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
        const endStr = item.endDate ? new Date(item.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
        return (
          <div>
            <div>{item.leaveType} ({startStr} – {endStr})</div>
            <Typography.Text type="secondary" ellipsis style={{ fontSize: 12 }}>{item.reason}</Typography.Text>
          </div>
        )
      },
    },
    {
      title: '',
      width: 56,
      align: 'right',
      render: (_, item) => (
        <Dropdown
          menu={{
            items: [
              { key: 'notify', icon: <NotificationOutlined />, label: 'Notify', onClick: () => openComposer(item, 'notify') },
              { key: 'email', icon: <MailOutlined />, label: 'Send email', onClick: () => openComposer(item, 'email') },
              { key: 'task', label: 'Assign task', onClick: () => navigate(`/tasks?staffId=${item.staff?._id}`) },
              item.type === 'pending'
                ? { key: 'approve', label: 'Approve leave', onClick: () => handleLeaveAction(item.id, 'Approved') }
                : null,
            ].filter(Boolean),
          }}
          trigger={['click']}
        >
          <Button type="text" icon={<MoreOutlined />} aria-label="Actions" />
        </Dropdown>
      ),
    },
  ]

  return (
    <Card title="Attention required" styles={{ body: { padding: 0 } }}>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={attentionItems}
        loading={loading}
        pagination={false}
        size="small"
        scroll={{ y: 280 }}
        locale={{ emptyText: <Empty description="Nothing needs attention today" /> }}
      />
      <Modal
        open={composer.open}
        onCancel={() => setComposer((prev) => ({ ...prev, open: false }))}
        title={composer.type === 'email' ? `Email ${composer.recipientName}` : `Notify ${composer.recipientName}`}
        okText={composer.type === 'email' ? 'Send email' : 'Send notification'}
        onOk={() => {
          setComposer((prev) => ({ ...prev, open: false }))
          toast.success(composer.type === 'email' ? `Email sent to ${composer.recipientName}` : `Notification sent to ${composer.recipientName}`)
        }}
      >
        {composer.type === 'email' && (
          <div style={{ marginBottom: 12 }}>
            <Typography.Text type="secondary">Subject</Typography.Text>
            <Input value={composer.subject} onChange={(e) => setComposer((prev) => ({ ...prev, subject: e.target.value }))} />
          </div>
        )}
        <Typography.Text type="secondary">{composer.type === 'email' ? 'Email body' : 'Message'}</Typography.Text>
        <Input.TextArea
          rows={composer.type === 'email' ? 8 : 4}
          value={composer.body}
          onChange={(e) => setComposer((prev) => ({ ...prev, body: e.target.value }))}
        />
      </Modal>
    </Card>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [staffData, setStaffData] = useState([])
  const [activeCount, setActiveCount] = useState(0)
  const [todayPunchins, setTodayPunchins] = useState([])
  const [approvedLeaves, setApprovedLeaves] = useState([])
  const [pendingLeaves, setPendingLeaves] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [now, setNow] = useState(new Date())
  const [showNotActiveModal, setShowNotActiveModal] = useState(false)
  const [showAllAttendance, setShowAllAttendance] = useState(false)
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [showActiveModal, setShowActiveModal] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [attendanceMonth, setAttendanceMonth] = useState(() => monthValue(new Date()))
  const [performancePeriod, setPerformancePeriod] = useState('month')
  const [performanceStats, setPerformanceStats] = useState({ averageScore: 0, topPerformerName: '-', topPerformerScore: 0, teamEfficiency: 0 })
  const [leaveMonth, setLeaveMonth] = useState(() => monthValue(new Date()))
  const [monthlyAttendance, setMonthlyAttendance] = useState([])
  const [previousMonthlyAttendance, setPreviousMonthlyAttendance] = useState([])
  const isFirstMonthlyFetch = useRef(true)
  const [detailLoading, setDetailLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    try {
      setDetailLoading(true)
      setLoadError('')
      const res = await api.get('/activities/dashboard-summary?lite=1', { signal: controller.signal })
      const d = res.data
      setStaffData(d.staff || [])
      setActiveCount(d.activeCount || 0)
      setTodayPunchins(d.todayPunchins || [])
      setApprovedLeaves(d.approvedLeaves || [])
      setPendingLeaves(d.pendingLeaves || [])
      if (d.announcements) {
        const all = d.announcements || []
        all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        setAnnouncements(all.slice(0, 3))
      }
      setMonthlyAttendance(d.currentMonthly || [])
      setPreviousMonthlyAttendance(d.prevMonthly || [])
    } catch (err) {
      console.error('Dashboard load error:', err)
      setLoadError(
        err.name === 'CanceledError' || err.message === 'canceled'
          ? 'Dashboard data request timed out. Please check backend and MongoDB Atlas connection.'
          : err.message || 'Dashboard data could not be loaded.'
      )
    } finally {
      clearTimeout(timer)
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (isFirstMonthlyFetch.current) {
      isFirstMonthlyFetch.current = false
      return
    }
    const controller = new AbortController()
    const run = async () => {
      const { month, year } = parseMonthValue(attendanceMonth)
      const previous = parseMonthValue(shiftMonthValue(attendanceMonth, -1))
      try {
        const [currentRes, previousRes] = await Promise.all([
          api.get('/attendance/admin/monthly', { params: { month, year }, signal: controller.signal }),
          api.get('/attendance/admin/monthly', { params: { month: previous.month, year: previous.year }, signal: controller.signal }),
        ])
        setMonthlyAttendance(currentRes.data?.data || [])
        setPreviousMonthlyAttendance(previousRes.data?.data || [])
      } catch (err) {
        if (err.name === 'CanceledError' || err.message === 'canceled') return
        setMonthlyAttendance([])
        setPreviousMonthlyAttendance([])
      }
    }
    run()
    return () => controller.abort()
  }, [attendanceMonth])

  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      try {
        const res = await api.get('/attendance/admin/performance-stats', {
          params: { period: performancePeriod },
          signal: controller.signal,
        })
        if (res.data?.success && res.data?.data) setPerformanceStats(res.data.data)
      } catch (err) {
        if (err.name === 'CanceledError' || err.message === 'canceled') return
      }
    }
    run()
    return () => controller.abort()
  }, [performancePeriod])

  const stats = useMemo(() => {
    const totalEmployees = staffData.length
    const safeActive = Math.min(Math.max(activeCount, 0), totalEmployees)
    const totalPresentToday = todayPunchins.length
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)
    const approvedOnLeaveToday = approvedLeaves.filter((leave) => {
      const start = new Date(leave.startDate)
      const end = new Date(leave.endDate)
      return start <= endOfToday && end >= startOfToday
    })
    const punchedInStaffIds = new Set(todayPunchins.map((r) => String(r.staff?._id || '')))
    const onLeaveStaffIds = new Set(
      approvedOnLeaveToday.flatMap((leave) => [String(leave.staff?._id || ''), String(leave.staffId || '')]).filter(Boolean)
    )
    const notActiveStaff = staffData.filter((s) => s._id && !punchedInStaffIds.has(String(s._id)) && !onLeaveStaffIds.has(String(s._id)))
    return {
      totalEmployees,
      safeActive,
      totalPresentToday,
      onLeave: approvedOnLeaveToday.length,
      notActiveStaff,
      notActiveCount: notActiveStaff.length,
      approvedOnLeaveToday,
    }
  }, [staffData, activeCount, todayPunchins, approvedLeaves])

  const sortedAttendance = useMemo(() => {
    return [...todayPunchins].sort((a, b) => {
      const aSession = getLatestAttendanceSession(a)
      const bSession = getLatestAttendanceSession(b)
      const aStart = aSession?.startTime ? new Date(aSession.startTime) : new Date(a.punchIn || 0)
      const bStart = bSession?.startTime ? new Date(bSession.startTime) : new Date(b.punchIn || 0)
      const aActive = Boolean(aSession?.isActive) ? 1 : 0
      const bActive = Boolean(bSession?.isActive) ? 1 : 0
      if (aActive !== bActive) return bActive - aActive
      return new Date(bStart) - new Date(aStart)
    })
  }, [todayPunchins])

  const activeAttendance = useMemo(() => sortedAttendance.filter((r) => !r.punchOut), [sortedAttendance])
  const monthOptions = useMemo(() => buildMonthOptions(18), [])

  const selectedMonthLeaves = useMemo(() => {
    const { month, year } = parseMonthValue(leaveMonth)
    const filterYearMonthStr = `${year}-${String(month).padStart(2, '0')}`
    const approved = approvedLeaves.filter((leave) => leave.startDate?.substring(0, 7) === filterYearMonthStr || leave.endDate?.substring(0, 7) === filterYearMonthStr)
    const pending = pendingLeaves.filter((leave) => leave.startDate?.substring(0, 7) === filterYearMonthStr || leave.endDate?.substring(0, 7) === filterYearMonthStr)
    const total = approved.length + pending.length
    return {
      approved,
      pending,
      total,
      approvedPct: total > 0 ? Math.round((approved.length / total) * 100) : 0,
    }
  }, [leaveMonth, approvedLeaves, pendingLeaves])

  const attendanceRows = useMemo(
    () =>
      sortedAttendance.map((record) => {
        const latestSession = getLatestAttendanceSession(record)
        const active = Boolean(latestSession?.isActive)
        const isAutoPunchOut = Boolean(
          latestSession?.endTime &&
            (latestSession?.source === 'AUTO_PUNCH_OUT' || latestSession?.source === 'SYSTEM') &&
            new Date(latestSession.endTime).getHours() === 23 &&
            new Date(latestSession.endTime).getMinutes() === 59
        )
        return {
          key: record._id,
          record,
          login: latestSession?.startTime || record.punchIn,
          logout: formatAttendanceLogout(latestSession, active),
          worked: calcWorkedTime(record, now),
          active,
          status: active ? 'Active' : isAutoPunchOut ? 'Auto punch out' : 'Not active',
        }
      }),
    [sortedAttendance, now]
  )

  const attendanceColumns = [
    {
      title: 'Employee',
      render: (_, row) => (
        <StaffCell staff={row.record.staff} onClick={() => row.record.staff?._id && navigate(`/staff/${row.record.staff._id}`)} />
      ),
    },
    { title: 'Login', dataIndex: 'login', width: 110, render: (v) => (v ? fmtTime(v) : '—') },
    { title: 'Logout', dataIndex: 'logout', width: 130 },
    { title: 'Worked', dataIndex: 'worked', width: 100 },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 130,
      render: (status, row) => <Tag color={row.active ? 'green' : status.includes('Auto') ? 'gold' : 'default'}>{status}</Tag>,
    },
  ]

  if (detailLoading) {
    return (
      <Flex align="center" justify="center" style={{ minHeight: 360 }}>
        <Spin size="large" />
      </Flex>
    )
  }

  if (loadError) {
    return (
      <Result
        status="warning"
        title="Dashboard data not loaded"
        subTitle={loadError}
        extra={<Button type="primary" onClick={fetchData}>Retry</Button>}
      />
    )
  }

  const { totalEmployees, safeActive, totalPresentToday, onLeave, notActiveStaff, notActiveCount, approvedOnLeaveToday } = stats

  return (
    <Space direction="vertical" size={20} style={{ width: '100%', display: 'flex' }}>
      <HrGettingStarted companyName={user?.companyName} />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="hr-stat-card" hoverable onClick={() => navigate('/staff')}>
            <Statistic title="Total employees" value={totalEmployees} prefix={<TeamOutlined />} />
            <Typography.Text type="secondary">All registered team members</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="hr-stat-card" hoverable onClick={() => setShowActiveModal(true)}>
            <Statistic title="Active today" value={safeActive} valueStyle={{ color: '#2F7D57' }} prefix={<UserOutlined />} />
            <Typography.Text type="secondary">Currently punched in</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="hr-stat-card" hoverable onClick={() => setShowLeaveModal(true)}>
            <Statistic title="On leave today" value={onLeave} valueStyle={{ color: '#C48A2A' }} prefix={<CalendarOutlined />} />
            <Typography.Text type="secondary">Approved leave today</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="hr-stat-card" hoverable onClick={() => setShowNotActiveModal(true)}>
            <Statistic title="Absent" value={notActiveCount} valueStyle={{ color: '#B42318' }} />
            <Typography.Text type="secondary">Not punched in today</Typography.Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card
            title="Team performance"
            extra={
              <Select
                size="small"
                value={performancePeriod}
                onChange={setPerformancePeriod}
                options={[
                  { value: 'today', label: 'Today' },
                  { value: 'week', label: 'This week' },
                  { value: 'month', label: 'This month' },
                  { value: 'year', label: 'This year' },
                  { value: 'all', label: 'All time' },
                  ...monthOptions,
                ]}
                style={{ minWidth: 140 }}
              />
            }
          >
            <Statistic title="Average score" value={performanceStats.averageScore} suffix="%" />
            <Flex justify="space-between" style={{ marginTop: 16 }}>
              <div>
                <Typography.Text type="secondary">Top performer</Typography.Text>
                <div>
                  <Typography.Text strong>{performanceStats.topPerformerName}</Typography.Text>
                  <Tag color="green" style={{ marginLeft: 8 }}>{performanceStats.topPerformerScore}%</Tag>
                </div>
              </div>
            </Flex>
            <div style={{ marginTop: 16 }}>
              <Typography.Text type="secondary">Team efficiency</Typography.Text>
              <Progress percent={performanceStats.teamEfficiency} strokeColor="#176B5B" />
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            title="Leave overview"
            extra={
              <Select size="small" value={leaveMonth} onChange={setLeaveMonth} options={monthOptions} style={{ minWidth: 140 }} />
            }
          >
            <Statistic title="Total leaves" value={selectedMonthLeaves.total} />
            <Space direction="vertical" style={{ marginTop: 16 }} size={4}>
              <Typography.Text>
                Approved <Tag color="green">{selectedMonthLeaves.approved.length}</Tag>
              </Typography.Text>
              <Typography.Text>
                Pending <Tag color="gold">{selectedMonthLeaves.pending.length}</Tag>
              </Typography.Text>
            </Space>
            <Progress
              percent={selectedMonthLeaves.approvedPct}
              success={{ percent: selectedMonthLeaves.approvedPct }}
              strokeColor="#C48A2A"
              format={() => `${selectedMonthLeaves.approvedPct}% approved`}
              style={{ marginTop: 16 }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            title="Recent announcements"
            extra={
              <Space>
                <Button type="text" icon={<PlusOutlined />} onClick={() => navigate('/settings?tab=announcements')} />
                <Button type="link" onClick={() => navigate('/settings?tab=announcements')}>View all</Button>
              </Space>
            }
          >
            {announcements.length === 0 ? (
              <Empty description="No announcements" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                dataSource={announcements}
                renderItem={(a) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<Avatar icon={<SoundOutlined />} style={{ background: '#E8F1EE', color: '#176B5B' }} />}
                      title={a.title}
                      description={new Date(a.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <AttentionRequired
            notActiveStaff={notActiveStaff}
            approvedOnLeaveToday={approvedOnLeaveToday}
            pendingLeaves={pendingLeaves}
            fetchData={fetchData}
            loading={detailLoading}
          />
        </Col>
        <Col xs={24} xl={12}>
          <Card
            title="Today's attendance"
            extra={<Button type="link" onClick={() => setShowAllAttendance(true)}>View all</Button>}
            styles={{ body: { padding: 0 } }}
          >
            <Table
              columns={attendanceColumns}
              dataSource={attendanceRows.slice(0, 8)}
              pagination={false}
              size="small"
              locale={{ emptyText: <Empty description="No punch-ins recorded today" /> }}
            />
            {attendanceRows.length > 0 && (
              <Flex gap={16} style={{ padding: '12px 16px', borderTop: '1px solid #E6E1D8' }}>
                <Typography.Text type="secondary">Present <Typography.Text strong>{totalPresentToday}</Typography.Text></Typography.Text>
                <Typography.Text type="secondary">Active <Typography.Text strong>{safeActive}</Typography.Text></Typography.Text>
                <Typography.Text type="secondary">This month <Typography.Text strong>{monthlyAttendance.length}</Typography.Text></Typography.Text>
                {previousMonthlyAttendance.length > 0 && (
                  <Typography.Text type="secondary">
                    vs last month {monthlyAttendance.length >= previousMonthlyAttendance.length ? '+' : ''}
                    {monthlyAttendance.length - previousMonthlyAttendance.length}
                  </Typography.Text>
                )}
              </Flex>
            )}
          </Card>
        </Col>
      </Row>

      <Modal open={showAllAttendance} onCancel={() => setShowAllAttendance(false)} title={`All attendance · ${attendanceRows.length}`} footer={null} width={840}>
        <Table columns={attendanceColumns} dataSource={attendanceRows} pagination={false} size="small" scroll={{ y: 420 }} />
      </Modal>

      <Modal open={showNotActiveModal} onCancel={() => setShowNotActiveModal(false)} title="Absent / not active" footer={null}>
        <List
          dataSource={notActiveStaff}
          locale={{ emptyText: 'All team members have punched in today.' }}
          renderItem={(person) => (
            <List.Item>
              <List.Item.Meta
                avatar={<Avatar src={person.documents?.profileImage?.url}>{person.fullName?.charAt(0)}</Avatar>}
                title={person.fullName}
                description={person.designation || 'Team member'}
              />
            </List.Item>
          )}
        />
      </Modal>

      <Modal open={showLeaveModal} onCancel={() => setShowLeaveModal(false)} title="Leave requests" footer={null}>
        <Typography.Text type="secondary">Pending {pendingLeaves.length} · Approved today {approvedOnLeaveToday.length}</Typography.Text>
        <List
          style={{ marginTop: 12 }}
          dataSource={[
            ...pendingLeaves.map((leave) => ({ ...leave, _status: 'Pending' })),
            ...approvedOnLeaveToday.map((leave) => ({ ...leave, _status: 'Approved' })),
          ]}
          locale={{ emptyText: 'No leave records for today.' }}
          renderItem={(leave) => (
            <List.Item extra={<Tag color={leave._status === 'Pending' ? 'gold' : 'green'}>{leave._status}</Tag>}>
              <List.Item.Meta
                avatar={<Avatar src={leave.staff?.documents?.profileImage?.url}>{(leave.staff?.fullName || '?').charAt(0)}</Avatar>}
                title={leave.staff?.fullName || 'Unknown'}
                description={`${leave.type || 'Leave'} · ${new Date(leave.startDate).toLocaleDateString('en-GB')} to ${new Date(leave.endDate).toLocaleDateString('en-GB')}`}
              />
            </List.Item>
          )}
        />
      </Modal>

      <Modal open={showActiveModal} onCancel={() => setShowActiveModal(false)} title="Active team today" footer={null}>
        <List
          dataSource={activeAttendance}
          locale={{ emptyText: 'No active team members right now.' }}
          renderItem={(record) => (
            <List.Item extra={<Tag color="green">{calcWorkedTime(record, now)}</Tag>}>
              <List.Item.Meta
                avatar={<Avatar src={record.staff?.documents?.profileImage?.url}>{(record.staff?.fullName || '?').charAt(0)}</Avatar>}
                title={record.staff?.fullName || 'Unknown'}
                description={`Punch-in ${fmtTime(record.punchIn)}`}
              />
            </List.Item>
          )}
        />
      </Modal>
    </Space>
  )
}
