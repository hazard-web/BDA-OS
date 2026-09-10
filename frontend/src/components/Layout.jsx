import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AppstoreOutlined,
  BellOutlined,
  CalendarOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  DownloadOutlined,
  LeftOutlined,
  LogoutOutlined,
  MenuOutlined,
  MoonOutlined,
  NotificationOutlined,
  RightOutlined,
  SettingOutlined,
  SunOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Drawer,
  Dropdown,
  Empty,
  Flex,
  Layout as AntLayout,
  List,
  Menu,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { toast } from 'react-hot-toast'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import GlobalSearch from './GlobalSearch'
import PeopleOsMark from './PeopleOsMark'

const { Header, Sider, Content } = AntLayout

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 1024px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1024px)')
    const onChange = (e) => setMobile(e.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return mobile
}

const menuItems = [
  { key: '/apps', icon: <AppstoreOutlined />, label: 'Apps' },
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/staff', icon: <TeamOutlined />, label: 'Employees' },
  {
    key: 'attendance-group',
    icon: <ClockCircleOutlined />,
    label: 'Attendance',
    children: [
      { key: '/attendance', label: 'Attendance' },
      { key: 'attendance-workingdays', label: 'Working Days' },
    ],
  },
  {
    key: 'leave-group',
    icon: <CalendarOutlined />,
    label: 'Leave',
    children: [
      { key: '/leave', label: 'Leave Requests' },
      { key: 'leave-policy', label: 'Leave Policy' },
    ],
  },
  { key: '/performance', icon: <ThunderboltOutlined />, label: 'Performance' },
  { key: '/tasks', icon: <CheckOutlined />, label: 'Tasks' },
  { key: '/payslips', icon: <UnorderedListOutlined />, label: 'Payslips' },
  { key: '/settings', icon: <SettingOutlined />, label: 'Settings' },
]

export default function Layout() {
  const isMobile = useIsMobile()
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()

  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [announcements, setAnnouncements] = useState([])

  const fetchAnnouncements = async () => {
    try {
      const res = await api.get('/announcements')
      const all = res.data.data || []
      const now = new Date()
      const active = all.filter((a) => {
        if (!a.isActive) return false
        if (a.startDate) {
          const start = new Date(a.startDate)
          start.setHours(0, 0, 0, 0)
          if (start > now) return false
        }
        if (a.endDate) {
          const end = new Date(a.endDate)
          end.setHours(23, 59, 59, 999)
          if (end < now) return false
        }
        return true
      })
      active.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      setAnnouncements(active)
    } catch {
      /* ignore */
    }
  }

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications/admin')
      setNotifications(res.data.data)
    } catch {
      console.error('Failed to fetch notifications')
    }
  }

  useEffect(() => {
    if (!user) return
    fetchNotifications()
    fetchAnnouncements()
    const interval = setInterval(() => {
      fetchNotifications()
      fetchAnnouncements()
    }, 60000)
    return () => clearInterval(interval)
  }, [user])

  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`)
      fetchNotifications()
    } catch {
      console.error('Failed to mark as read')
    }
  }

  const archiveNotification = async (id) => {
    try {
      await api.put(`/notifications/${id}/archive`)
      fetchNotifications()
      toast.success('Notification archived')
    } catch {
      toast.error('Failed to archive')
    }
  }

  const markAllAsRead = async () => {
    try {
      await api.post('/notifications/admin/mark-all-read')
      fetchNotifications()
      toast.success('All marked as read')
    } catch {
      toast.error('Action failed')
    }
  }

  const handleLeaveAction = async (id, status) => {
    try {
      await api.post('/leaves/admin/respond', { id, status })
      toast.success(`Leave ${status.toLowerCase()}`)
      fetchNotifications()
    } catch {
      toast.error('Action failed')
    }
  }

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      window.deferredPrompt = e
      setDeferredPrompt(e)
    }
    const handleAppInstalled = () => {
      window.deferredPrompt = null
      setDeferredPrompt(null)
    }
    if (window.deferredPrompt) setDeferredPrompt(window.deferredPrompt)
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') setDeferredPrompt(null)
    } else {
      toast('To install, use Add to Home Screen from your browser menu.', { duration: 5000 })
    }
  }

  const selectedKeys = useMemo(() => {
    const path = location.pathname
    const tab = location.state?.activeTab
    if (path.startsWith('/attendance')) {
      return tab === 'workingdays' ? ['attendance-workingdays'] : ['/attendance']
    }
    if (path.startsWith('/leave')) {
      return tab === 'policy' ? ['leave-policy'] : ['/leave']
    }
    const match = ['/apps', '/dashboard', '/staff', '/performance', '/tasks', '/payslips', '/settings']
      .sort((a, b) => b.length - a.length)
      .find((item) => (item === '/dashboard' ? path === item : path.startsWith(item)))
    return match ? [match] : []
  }, [location.pathname, location.state])

  const openKeys = useMemo(() => {
    if (location.pathname.startsWith('/attendance')) return ['attendance-group']
    if (location.pathname.startsWith('/leave')) return ['leave-group']
    return []
  }, [location.pathname])

  const crumbs = useMemo(() => {
    const path = location.pathname
    const segments = path.split('/').filter(Boolean)
    const items = [{ title: <a onClick={() => navigate('/apps')}>Apps</a> }]
    let currentPath = ''
    const labels = {
      staff: 'Employees',
      attendance: 'Attendance',
      leave: 'Leave',
      performance: 'Performance',
      tasks: 'Tasks',
      payslips: 'Payslips',
      settings: 'Settings',
      dashboard: 'Dashboard',
      generate: 'Generate payslip',
    }
    segments.forEach((seg) => {
      currentPath += `/${seg}`
      const dest = currentPath
      const label = labels[seg] || (/^[a-f\d]{24}$/i.test(seg) ? 'Detail' : seg.charAt(0).toUpperCase() + seg.slice(1))
      items.push({ title: <a onClick={() => navigate(dest)}>{label}</a> })
    })
    return items
  }, [location.pathname, navigate])

  const onMenuClick = ({ key }) => {
    if (key === 'attendance-workingdays') navigate('/attendance', { state: { activeTab: 'workingdays' } })
    else if (key === 'leave-policy') navigate('/leave', { state: { activeTab: 'policy' } })
    else navigate(key)
    if (isMobile) setDrawerOpen(false)
  }

  const unread = notifications.filter((n) => !n.isRead).length
  const companyName = user?.companyName || 'BDA OS'

  const sideMenu = (
    <Flex vertical style={{ height: '100%' }}>
      <Menu
        mode="inline"
        selectedKeys={selectedKeys}
        defaultOpenKeys={openKeys}
        items={menuItems}
        onClick={onMenuClick}
        style={{ flex: 1, borderInlineEnd: 'none', paddingTop: 12 }}
      />
      <div className="hr-user-card">
        <Flex
          gap={10}
          align="center"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            navigate('/account')
            if (isMobile) setDrawerOpen(false)
          }}
        >
          {user?.companyLogo ? (
            <Avatar src={user.companyLogo} shape="square" size={36} />
          ) : (
            <Avatar shape="square" size={36} style={{ background: '#1A5F4A' }}>
              {companyName.charAt(0).toUpperCase()}
            </Avatar>
          )}
          {!collapsed || isMobile ? (
            <div style={{ minWidth: 0 }}>
              <Typography.Text strong ellipsis style={{ display: 'block' }}>
                {companyName}
              </Typography.Text>
              <Typography.Text type="secondary" ellipsis style={{ display: 'block', fontSize: 12 }}>
                {user?.email || 'admin'}
              </Typography.Text>
            </div>
          ) : null}
        </Flex>
        {(!collapsed || isMobile) && (
          <Button
            type="text"
            danger
            icon={<LogoutOutlined />}
            onClick={logout}
            style={{ marginTop: 8, width: '100%', justifyContent: 'flex-start' }}
          >
            Sign out
          </Button>
        )}
      </div>
    </Flex>
  )

  const announcementPanel = (
    <div style={{ width: 340, maxHeight: 420, overflow: 'auto' }}>
      <Flex justify="space-between" align="center" style={{ padding: '12px 16px', borderBottom: '1px solid #E6E1D8' }}>
        <Typography.Text strong>Announcements</Typography.Text>
        <Button type="link" size="small" onClick={() => navigate('/settings?tab=announcements')}>
          View all
        </Button>
      </Flex>
      {announcements.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No active announcements" style={{ padding: 24 }} />
      ) : (
        <List
          dataSource={announcements}
          renderItem={(a) => (
            <List.Item style={{ padding: '12px 16px', alignItems: 'flex-start' }}>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Space>
                  <Tag color={a.priority === 'Urgent' ? 'red' : a.priority === 'Important' ? 'gold' : 'green'}>
                    {a.priority}
                  </Tag>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </Typography.Text>
                </Space>
                <Typography.Text strong>{a.title}</Typography.Text>
                <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }} ellipsis={{ rows: 2 }}>
                  {a.message}
                </Typography.Paragraph>
              </Space>
            </List.Item>
          )}
        />
      )}
    </div>
  )

  const typeNav = {
    LEAVE_REQUEST: '/leave',
    STAFF_CREATED: '/staff',
    PAYSLIP_PUSHED: '/payslips',
    PROFILE_UPDATE: '/staff',
    ATTENDANCE_ALERT: '/attendance',
  }

  const notificationPanel = (
    <div style={{ width: 380, maxHeight: 480, overflow: 'auto' }}>
      <Flex justify="space-between" align="center" style={{ padding: '12px 16px', borderBottom: '1px solid #E6E1D8' }}>
        <Space>
          <Typography.Text strong>Notifications</Typography.Text>
          {unread > 0 && <Badge count={unread} />}
        </Space>
        <Button type="link" size="small" onClick={markAllAsRead}>
          Mark all read
        </Button>
      </Flex>
      {notifications.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No notifications yet" style={{ padding: 32 }} />
      ) : (
        <List
          dataSource={notifications}
          renderItem={(n) => (
            <List.Item
              style={{ padding: 16, background: n.isRead ? undefined : '#F8F6F1' }}
              actions={
                n.type === 'LEAVE_REQUEST' && !n.isRead
                  ? [
                      <Button size="small" type="primary" onClick={() => handleLeaveAction(n.referenceId, 'Approved')}>
                        Approve
                      </Button>,
                      <Button size="small" onClick={() => handleLeaveAction(n.referenceId, 'Rejected')}>
                        Deny
                      </Button>,
                      <Button size="small" type="text" onClick={() => archiveNotification(n._id)}>
                        Archive
                      </Button>,
                    ]
                  : undefined
              }
            >
              <List.Item.Meta
                avatar={<Avatar style={{ background: n.isRead ? '#E6E1D8' : '#1A5F4A' }}>{(n.staff?.fullName || 'N').charAt(0)}</Avatar>}
                title={
                  <a
                    onClick={() => {
                      markAsRead(n._id)
                      navigate(typeNav[n.type] || '/dashboard')
                    }}
                  >
                    {n.staff?.fullName || 'Update'}
                  </a>
                }
                description={
                  <>
                    <div>{n.message}</div>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      {new Date(n.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Typography.Text>
                  </>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  )

  return (
    <AntLayout className="hr-shell">
      <Header>
        {isMobile && (
          <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} aria-label="Open menu" />
        )}
        <div className="hr-brand" onClick={() => navigate('/account')}>
          {user?.companyLogo ? (
            <img src={user.companyLogo} alt="" width={28} height={28} style={{ borderRadius: 6, objectFit: 'contain' }} />
          ) : (
            <PeopleOsMark size={24} />
          )}
          {!collapsed && !isMobile && <span className="hr-brand-name">{companyName}</span>}
        </div>
        {!isMobile && (
          <Button
            type="text"
            size="small"
            icon={collapsed ? <RightOutlined /> : <LeftOutlined />}
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          />
        )}
        <Breadcrumb items={crumbs} style={{ marginLeft: 8 }} />
        <div className="hr-header-tools">
          <GlobalSearch portal="admin" />
          {deferredPrompt && (
            <Tooltip title="Install app">
              <Button type="primary" icon={<DownloadOutlined />} onClick={handleInstallClick} />
            </Tooltip>
          )}
          <Dropdown dropdownRender={() => announcementPanel} trigger={['click']} placement="bottomRight">
            <Badge dot={announcements.length > 0}>
              <Button type="text" icon={<NotificationOutlined />} aria-label="Announcements" />
            </Badge>
          </Dropdown>
          <Dropdown dropdownRender={() => notificationPanel} trigger={['click']} placement="bottomRight">
            <Badge count={unread} size="small">
              <Button type="text" icon={<BellOutlined />} aria-label="Notifications" />
            </Badge>
          </Dropdown>
          <Tooltip title={theme === 'light' ? 'Dark mode' : 'Light mode'}>
            <Button
              type="text"
              icon={theme === 'light' ? <MoonOutlined /> : <SunOutlined />}
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            />
          </Tooltip>
        </div>
      </Header>
      <AntLayout>
        {isMobile ? (
          <Drawer
            placement="left"
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            width={260}
            styles={{ body: { padding: 0 } }}
          >
            {sideMenu}
          </Drawer>
        ) : (
          <Sider collapsible collapsed={collapsed} trigger={null} width={240} collapsedWidth={72}>
            {sideMenu}
          </Sider>
        )}
        <Content>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  )
}
