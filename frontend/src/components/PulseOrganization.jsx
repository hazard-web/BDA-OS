import { Card } from 'antd'
import {
  AppstoreOutlined,
  CalendarOutlined,
  CarryOutOutlined,
  EnvironmentOutlined,
  MailOutlined,
  PhoneOutlined,
  RightOutlined,
  RocketOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import PulseAppGrantsAdmin from './PulseAppGrantsAdmin'
import PulseOnboarding from './PulseOnboarding'
import PulseLiveModule from './PulseLiveWorkspace'
import { openPulsePage } from '../utils/pulseOpenPage'
// Company setup form — parked with Getting Started on `pulse/company-later-services`
// import PulseCompanyInfoForm from './PulseCompanyInfoForm'
// Later build — restore from branch `pulse/company-later-services`
// import PulseInviteAdmin from './PulseInviteAdmin'
// import { PulseAnnouncementsBoard } from './PulseLiveWorkspace'

export const BDA_LOGO = '/bda-logo-lockup.png'
export const BDA_LOGO_WIDE = '/bda-logo-lockup.png'

export const ORG_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'onboarding', label: 'Onboarding' },
]

/*
  Later Company tabs — full bar is on branch `pulse/company-later-services`
  (PulseOrganization.jsx at that commit). Restore when we ship the next build.

  { key: 'announcements', label: 'Announcements' },
  { key: 'policies', label: 'Policies' },
  { key: 'employee-tree', label: 'Employee Tree' },
  { key: 'department-tree', label: 'Department Tree' },
  { key: 'directory', label: 'Department Directory' },
  { key: 'birthdays', label: 'Birthday Folks' },
  { key: 'new-hires', label: 'New Hires' },
  { key: 'calendar', label: 'Calendar' },
*/

const SERVICES = [
  { key: 'onboarding', label: 'Onboarding', Icon: RocketOutlined, hint: 'Employees' },
  { key: 'leave', label: 'Leave Tracker', Icon: CalendarOutlined, hint: 'Apply and requests' },
  { key: 'attendance', label: 'Attendance', Icon: CarryOutOutlined, hint: 'Org check-in' },
  { key: 'companyTime', label: 'Time Tracker', Icon: ThunderboltOutlined, hint: 'Tasks and check-in' },
  { key: 'apps', label: 'App access', Icon: AppstoreOutlined, hint: 'Assigned apps' },
]

/*
  Later modules — full grid is on branch `pulse/company-later-services`
  (PulseOrganization.jsx at that commit). Restore when we ship them.

  { key: 'performance', label: 'Performance', Icon: RiseOutlined, color: '#21A05A' },
  { key: 'files', label: 'Files', Icon: FolderOpenOutlined, color: '#2B8AED' },
  { key: 'engagement', label: 'Employee Engagement', Icon: HeartOutlined, color: '#DB2777' },
  { key: 'letters', label: 'HR Letters', Icon: SolutionOutlined, color: '#E67E22' },
  { key: 'travel', label: 'Travel', Icon: CompassOutlined, color: '#E67E22' },
  { key: 'tasks', label: 'Tasks', Icon: AuditOutlined, color: '#E42527' },
  { key: 'compensation', label: 'Compensation', Icon: BankOutlined, color: '#E42527' },
  { key: 'general', label: 'Additional', Icon: IdcardOutlined, color: '#D4A017' },
  { key: 'okr', label: 'OKR', Icon: ClusterOutlined, color: '#D4A017' },
*/

function OrgPeak() {
  return (
    <div className="pulse-strip-scene" aria-hidden="true">
      <img className="pulse-strip-photo" src="/pulse-overview-peak.jpg" alt="" />
      <div className="pulse-strip-shade" />
      <div className="pulse-aura-sheen" />
    </div>
  )
}

function ServiceTile({ item, featured, onClick }) {
  const Icon = item.Icon
  return (
    <button
      type="button"
      className={`pulse-org-service${featured ? ' is-lead' : ''}`}
      onClick={() => onClick(item.key)}
      aria-label={item.hint ? `${item.label}: ${item.hint}` : item.label}
    >
      <span className="pulse-org-service-ico" aria-hidden="true">
        <Icon />
      </span>
      <span className="pulse-org-service-copy">
        <span className="pulse-org-service-label">{item.label}</span>
        {item.hint ? <span className="pulse-org-service-hint">{item.hint}</span> : null}
      </span>
      <RightOutlined className="pulse-org-service-go" aria-hidden="true" />
    </button>
  )
}

function OverviewPanel({ user }) {
  const orgName = user?.companyName || 'BDA Technologies'
  const location = [user?.state, user?.country || 'India'].filter(Boolean).join(', ') || 'India'
  const logoSrc = user?.companyLogo || BDA_LOGO
  const facts = [
    user?.companyAddress
      ? { key: 'address', Icon: EnvironmentOutlined, text: user.companyAddress }
      : null,
    user?.companyPhone
      ? { key: 'phone', Icon: PhoneOutlined, text: user.companyPhone }
      : null,
    user?.companyEmail
      ? { key: 'email', Icon: MailOutlined, text: user.companyEmail }
      : null,
  ].filter(Boolean)

  return (
    <div className="pulse-org-overview">
      <div className="pulse-org-grid">
        <aside className="pulse-org-identity">
          <Card size="small" className="pulse-org-card pulse-org-profile">
            <div className="pulse-org-brand">
              <div className={`pulse-org-logo${logoSrc === BDA_LOGO ? ' is-lockup' : ''}`}>
                <img src={logoSrc} alt={`${orgName} logo`} />
              </div>
              <h1 className="pulse-org-name">{orgName}</h1>
              <p className="pulse-org-place">{location}</p>
            </div>
            {facts.length ? (
              <ul className="pulse-org-facts">
                {facts.map((fact) => {
                  const Icon = fact.Icon
                  return (
                    <li key={fact.key} className="pulse-org-fact">
                      <Icon className="pulse-org-fact-ico" aria-hidden="true" />
                      <span>{fact.text}</span>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </Card>
        </aside>

        <section className="pulse-org-main">
          <Card size="small" className="pulse-org-card pulse-org-main-card">
            <h2 className="pulse-org-pane-title">Services</h2>
            <div className="pulse-org-services">
              {SERVICES.map((item, index) => (
                <ServiceTile
                  key={item.key}
                  item={item}
                  featured={index === 0}
                  onClick={openPulsePage}
                />
              ))}
            </div>
          </Card>
        </section>
      </div>
    </div>
  )
}

/** Organization — org home aligned with Overview. */
export default function PulseOrganization({ user, tab = 'overview', onSoon, onTab, liveProps }) {
  if (tab === 'overview') {
    return (
      <div className="pulse-strip-root">
        <OrgPeak />
        <div className="pulse-scroll pulse-scroll-surface pulse-ov-open pulse-org-open">
          <OverviewPanel user={user} />
        </div>
      </div>
    )
  }

  if (tab === 'onboarding') {
    return (
      <div className="pulse-strip-root">
        <OrgPeak />
        <div className="pulse-scroll pulse-scroll-surface pulse-ov-open pulse-org-open">
          <div className="pulse-org-overview pulse-org-employee">
            <PulseOnboarding />
          </div>
        </div>
      </div>
    )
  }

  if (tab === 'apps') {
    return (
      <div className="pulse-strip-root">
        <OrgPeak />
        <div className="pulse-scroll pulse-scroll-surface pulse-ov-open pulse-org-open">
          <div className="pulse-org-apps">
            <PulseAppGrantsAdmin />
          </div>
        </div>
      </div>
    )
  }

  if (tab === 'attendance') {
    return (
      <div className="pulse-strip-root">
        <OrgPeak />
        <div className="pulse-scroll pulse-scroll-surface pulse-ov-open pulse-org-open">
          <PulseLiveModule kind="attendance" scope="org" {...liveProps} />
        </div>
      </div>
    )
  }

  if (tab === 'time') {
    return (
      <div className="pulse-strip-root">
        <OrgPeak />
        <div className="pulse-scroll pulse-scroll-surface pulse-ov-open pulse-org-open">
          <PulseLiveModule kind="time" scope="org" {...liveProps} />
        </div>
      </div>
    )
  }

  /*
    Later Company tab bodies — restore from `pulse/company-later-services`

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
  */

  return (
    <div className="pulse-strip-root">
      <OrgPeak />
      <div className="pulse-scroll pulse-scroll-surface pulse-ov-open pulse-org-open">
        <OverviewPanel user={user} />
      </div>
    </div>
  )
}
