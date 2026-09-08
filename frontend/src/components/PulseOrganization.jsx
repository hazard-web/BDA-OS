import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Flex,
  Tabs,
  Typography,
} from 'antd'
import {
  AuditOutlined,
  BankOutlined,
  CalendarOutlined,
  CameraOutlined,
  CarryOutOutlined,
  ClusterOutlined,
  CompassOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  HeartOutlined,
  IdcardOutlined,
  PlusOutlined,
  RiseOutlined,
  RocketOutlined,
  SolutionOutlined,
  ThunderboltOutlined,
  AppstoreOutlined,
} from '@ant-design/icons'
import PulseInviteAdmin from './PulseInviteAdmin'
import PulseAppGrantsAdmin from './PulseAppGrantsAdmin'
import PulseOnboarding from './PulseOnboarding'
import PulseLiveModule, { PulseAnnouncementsBoard } from './PulseLiveWorkspace'

export const BDA_LOGO = '/bda-logo.png'
export const BDA_LOGO_WIDE = '/bda-logo-wide.png'

export const ORG_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'policies', label: 'Policies' },
  { key: 'employee-tree', label: 'Employee Tree' },
  { key: 'department-tree', label: 'Department Tree' },
  { key: 'directory', label: 'Department Directory' },
  { key: 'birthdays', label: 'Birthday Folks' },
  { key: 'new-hires', label: 'New Hires' },
  { key: 'calendar', label: 'Calendar' },
]

const SERVICES = [
  { key: 'onboarding', label: 'Onboarding', Icon: RocketOutlined, color: '#E67E22' },
  { key: 'leave', label: 'Leave Tracker', Icon: CalendarOutlined, color: '#2B8AED' },
  { key: 'attendance', label: 'Attendance', Icon: CarryOutOutlined, color: '#E42527' },
  { key: 'time', label: 'Time Tracker', Icon: ThunderboltOutlined, color: '#D4A017' },
  { key: 'performance', label: 'Performance', Icon: RiseOutlined, color: '#21A05A' },
  { key: 'files', label: 'Files', Icon: FolderOpenOutlined, color: '#2B8AED' },
  { key: 'engagement', label: 'Employee Engagement', Icon: HeartOutlined, color: '#DB2777' },
  { key: 'letters', label: 'HR Letters', Icon: SolutionOutlined, color: '#E67E22' },
  { key: 'travel', label: 'Travel', Icon: CompassOutlined, color: '#E67E22' },
  { key: 'tasks', label: 'Tasks', Icon: AuditOutlined, color: '#E42527' },
  { key: 'compensation', label: 'Compensation', Icon: BankOutlined, color: '#E42527' },
  { key: 'general', label: 'Additional', Icon: IdcardOutlined, color: '#D4A017' },
  { key: 'apps', label: 'App access', Icon: AppstoreOutlined, color: '#1A5F4A' },
  { key: 'okr', label: 'OKR', Icon: ClusterOutlined, color: '#D4A017' },
]

function ServiceTile({ item, active, onClick }) {
  const Icon = item.Icon
  return (
    <button
      type="button"
      className={`pulse-org-service${active ? ' is-on' : ''}`}
      onClick={() => onClick(item.key)}
    >
      <span className="pulse-org-service-ico" style={{ color: item.color }} aria-hidden="true">
        <Icon />
      </span>
      <span className="pulse-org-service-label">{item.label}</span>
    </button>
  )
}

function OverviewPanel({ user, onSoon, onTab, liveProps }) {
  const [mainTab, setMainTab] = useState('services')
  const [service, setService] = useState(null)

  const orgName = user?.companyName || 'BDA Technologies'
  const location = [user?.state, user?.country || 'India'].filter(Boolean).join(', ')
  const logoSrc = user?.companyLogo || BDA_LOGO

  const serviceBody = useMemo(() => {
    if (!service) return null
    if (service === 'onboarding') return <PulseOnboarding />
    if (service === 'apps') return <PulseAppGrantsAdmin />
    const kind = service === 'general' ? 'additional' : service
    return <PulseLiveModule kind={kind} scope="org" {...liveProps} />
  }, [service, liveProps])

  return (
    <div className="pulse-org-overview">
      <div className="pulse-org-cover">
        <Button
          className="pulse-org-cover-btn"
          icon={<CameraOutlined />}
          onClick={() => onSoon('Edit Cover Photo')}
        >
          Edit Cover Photo
        </Button>
      </div>

      <div className="pulse-org-body">
        <aside className="pulse-org-aside">
          <Card size="small" className="pulse-org-card pulse-org-profile">
            <Flex vertical align="center" gap={8}>
              <div className="pulse-org-logo">
                <img src={logoSrc} alt={orgName} />
              </div>
              <Typography.Title level={4} className="pulse-org-name">
                {orgName}
              </Typography.Title>
              <Typography.Text type="secondary">{location}</Typography.Text>
            </Flex>
          </Card>

          <Card
            size="small"
            className="pulse-org-card"
            title="Quick Links"
            extra={
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                aria-label="Add quick link"
                onClick={() => onSoon('Quick Links')}
              />
            }
          >
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No quick links" />
          </Card>
        </aside>

        <section className="pulse-org-main">
          <Card size="small" className="pulse-org-card pulse-org-main-card">
            <Tabs
              activeKey={mainTab}
              onChange={(key) => {
                setMainTab(key)
                setService(null)
              }}
              items={[
                {
                  key: 'services',
                  label: 'Services',
                  children: service ? (
                    <div className="pulse-org-service-panel">
                      <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
                        <Typography.Text strong>
                          {SERVICES.find((s) => s.key === service)?.label}
                        </Typography.Text>
                        <Button type="link" onClick={() => setService(null)}>
                          All services
                        </Button>
                      </Flex>
                      {serviceBody}
                    </div>
                  ) : (
                    <div className="pulse-org-services">
                      {SERVICES.map((item) => (
                        <ServiceTile
                          key={item.key}
                          item={item}
                          active={false}
                          onClick={(key) => {
                            if (key === 'onboarding' && onTab) {
                              onTab('onboarding')
                              return
                            }
                            setService(key)
                          }}
                        />
                      ))}
                    </div>
                  ),
                },
                {
                  key: 'location',
                  label: 'Location',
                  children: (
                    <div className="pulse-org-location">
                      <Flex align="flex-start" gap={12}>
                        <GlobalOutlined style={{ fontSize: 22, color: '#1A5F4A', marginTop: 2 }} />
                        <div>
                          <Typography.Text strong>{orgName}</Typography.Text>
                          <div>
                            <Typography.Text type="secondary">
                              {user?.companyAddress || location || 'Add work location in setup'}
                            </Typography.Text>
                          </div>
                          {user?.companyPhone ? (
                            <div>
                              <Typography.Text type="secondary">{user.companyPhone}</Typography.Text>
                            </div>
                          ) : null}
                          {user?.companyEmail ? (
                            <div>
                              <Typography.Text type="secondary">{user.companyEmail}</Typography.Text>
                            </div>
                          ) : null}
                        </div>
                      </Flex>
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        </section>
      </div>
    </div>
  )
}

/** Pulse Organization — org home with Ant Design. */
export default function PulseOrganization({ user, tab = 'overview', onSoon, onTab, liveProps, calendar }) {
  if (tab === 'overview') {
    return <OverviewPanel user={user} onSoon={onSoon} onTab={onTab} liveProps={liveProps} />
  }

  if (tab === 'onboarding') {
    return (
      <div className="pulse-org-page pulse-org-onboarding">
        <PulseOnboarding />
      </div>
    )
  }

  if (tab === 'directory' || tab === 'employee-tree') {
    return (
      <div className="pulse-org-page">
        <PulseInviteAdmin />
      </div>
    )
  }

  if (tab === 'department-tree') {
    return <PulseLiveModule kind="departments" scope="org" {...liveProps} />
  }

  if (tab === 'announcements') {
    return <PulseAnnouncementsBoard name={user?.name || 'HR'} />
  }

  if (tab === 'policies') {
    return <PulseLiveModule kind="policies" scope="org" {...liveProps} />
  }

  if (tab === 'birthdays') {
    return <PulseLiveModule kind="birthdays" scope="org" {...liveProps} />
  }

  if (tab === 'new-hires') {
    return <PulseLiveModule kind="new-hires" scope="org" {...liveProps} />
  }

  if (tab === 'calendar') {
    return calendar || <PulseLiveModule kind="reports" scope="org" {...liveProps} />
  }

  return <PulseLiveModule kind="reports" scope="org" {...liveProps} />
}
