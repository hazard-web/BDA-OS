import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Users,
  Clock,
  CalendarDays,
  FileText,
  ListTodo,
  TrendingUp,
  Settings,
  LayoutDashboard,
  LifeBuoy,
  Wallet,
  Megaphone,
  ChevronRight,
  Grid2X2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AccountsLogo from '../components/AccountsLogo'
import './apps-directory.css'

const FEATURED = {
  id: 'employees',
  name: 'Employees',
  blurb: 'Hire, organize, and manage your workforce from one HR workspace.',
  cta: 'Open Employees',
  to: '/staff',
  Icon: Users,
}

const PROMOS = [
  {
    tag: 'Human Resources',
    title: 'Keep leave and attendance in sync for every employee',
    cta: 'Open Leave',
    to: '/leave',
    tone: 'rose',
  },
  {
    tag: 'Payroll',
    title: 'Generate statutory payslips and push them to the employee portal',
    cta: 'Run Payroll',
    to: '/payslips/generate',
    tone: 'amber',
  },
  {
    tag: 'Project Management',
    title: 'Assign tasks and track delivery across your teams',
    cta: 'Open Tasks',
    to: '/tasks',
    tone: 'mint',
  },
]

const CATEGORIES = [
  {
    id: 'hr',
    label: 'Human Resources',
    apps: [
      { id: 'employees', name: 'Employees', to: '/staff', Icon: Users, color: '#e42527' },
      { id: 'attendance', name: 'Attendance', to: '/attendance', Icon: Clock, color: '#0091ff' },
      { id: 'leave', name: 'Leave', to: '/leave', Icon: CalendarDays, color: '#21a05a' },
      { id: 'leave-policy', name: 'Leave Policy', to: '/leave', state: { activeTab: 'policy' }, Icon: CalendarDays, color: '#0d9488' },
      { id: 'payslips', name: 'Payslips', to: '/payslips', Icon: FileText, color: '#7c3aed' },
      { id: 'payroll', name: 'Payroll', to: '/payslips/generate', Icon: Wallet, color: '#ca8a04' },
      { id: 'performance', name: 'Performance', to: '/performance', Icon: TrendingUp, color: '#ea580c' },
      { id: 'support', name: 'Staff Support', to: '/staff-support', Icon: LifeBuoy, color: '#0284c7' },
      { id: 'announcements', name: 'Announcements', to: '/settings', Icon: Megaphone, color: '#db2777' },
      { id: 'company', name: 'Company', to: '/settings', Icon: Settings, color: '#475569' },
    ],
  },
  {
    id: 'pm',
    label: 'Project Management',
    apps: [
      { id: 'dashboard', name: 'Dashboard', to: '/dashboard', Icon: LayoutDashboard, color: '#2563eb' },
      { id: 'tasks', name: 'Tasks', to: '/tasks', Icon: ListTodo, color: '#16a34a' },
      { id: 'working-days', name: 'Working Days', to: '/attendance', state: { activeTab: 'workingdays' }, Icon: Clock, color: '#0891b2' },
      { id: 'team-performance', name: 'Team Pulse', to: '/performance', Icon: TrendingUp, color: '#c026d3' },
    ],
  },
]

function AppTile({ app }) {
  const navigate = useNavigate()
  const Icon = app.Icon
  return (
    <button
      type="button"
      className="pad-app"
      onClick={() => navigate(app.to, app.state ? { state: app.state } : undefined)}
    >
      <span className="pad-app-icon" style={{ background: app.color }}>
        <Icon size={18} strokeWidth={2.2} />
      </span>
      <span className="pad-app-name">{app.name}</span>
    </button>
  )
}

export default function AppsDirectory() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [promoIndex, setPromoIndex] = useState(0)
  const promo = PROMOS[promoIndex]
  const FeaturedIcon = FEATURED.Icon

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return CATEGORIES
    return CATEGORIES.map((cat) => ({
      ...cat,
      apps: cat.apps.filter((a) => a.name.toLowerCase().includes(q)),
    })).filter((cat) => cat.apps.length > 0)
  }, [query])

  const initials = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase())
    .join('') || (user?.email?.[0]?.toUpperCase() || 'P')

  return (
    <div className="pad-page">
      <header className="pad-top">
        <div className="pad-top-left">
          <button type="button" className="pad-icon-btn" aria-label="Apps" onClick={() => navigate('/apps')}>
            <Grid2X2 size={18} />
          </button>
          <button type="button" className="pad-brand" onClick={() => navigate('/account')}>
            <AccountsLogo size={24} />
            <span>Accounts</span>
          </button>
        </div>
        <div className="pad-top-right">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="pad-avatar"
              referrerPolicy="no-referrer"
              onClick={() => navigate('/account')}
            />
          ) : (
            <button type="button" className="pad-avatar pad-avatar-fallback" onClick={() => navigate('/account')}>
              {initials}
            </button>
          )}
        </div>
      </header>

      <div className="pad-shell">
        <label className="pad-search" htmlFor="pad-search-input">
          <Search size={16} strokeWidth={2.2} aria-hidden="true" />
          <input
            id="pad-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Applications"
            autoComplete="off"
          />
        </label>

        {!query ? (
          <>
            <section className="pad-featured">
              <div className="pad-featured-mark" aria-hidden="true">
                <FeaturedIcon size={36} strokeWidth={2} />
              </div>
              <div className="pad-featured-copy">
                <h2>{FEATURED.name}</h2>
                <p>{FEATURED.blurb}</p>
                <button type="button" className="pad-text-link" onClick={() => navigate(FEATURED.to)}>
                  {FEATURED.cta}
                  <ChevronRight size={14} />
                </button>
              </div>
            </section>

            <section className={`pad-promo pad-promo-${promo.tone}`}>
              <div>
                <p className="pad-promo-tag">{promo.tag}</p>
                <h3>{promo.title}</h3>
              </div>
              <button type="button" className="pad-promo-cta" onClick={() => navigate(promo.to)}>
                {promo.cta}
              </button>
              <div className="pad-promo-dots" role="tablist" aria-label="Promotions">
                {PROMOS.map((item, i) => (
                  <button
                    key={item.tag}
                    type="button"
                    className={i === promoIndex ? 'is-active' : ''}
                    aria-label={`Show promo ${i + 1}`}
                    onClick={() => setPromoIndex(i)}
                  />
                ))}
              </div>
            </section>
          </>
        ) : null}

        <p className="pad-all-label">All BDA OS apps</p>
        <p className="pad-org">
          {user?.companyName ? `Workspace · ${user.companyName}` : 'Your HR & project workspace'}
        </p>

        {filtered.length === 0 ? (
          <p className="pad-empty">No applications match “{query}”.</p>
        ) : (
          filtered.map((cat) => (
            <section key={cat.id} className="pad-category">
              <h2>{cat.label}</h2>
              <div className="pad-grid">
                {cat.apps.map((app) => (
                  <AppTile key={app.id} app={app} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
