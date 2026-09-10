import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Empty, Input, Popover, Typography } from 'antd'
import { BellOutlined, SearchOutlined } from '@ant-design/icons'
import api from '../api'
import { isPulseAdmin } from '../utils/pulseRoles'
import { APP_NOTES } from '../utils/pulseEntry'
import { PULSE_SHELL_VIEWS } from '../utils/pulseOpenPage'
import { MORE_SERVICES } from './PulseMoreLauncher'

const PAGE_RESULTS = [
  { key: 'home', title: 'Overview', subtitle: 'You · Home', type: 'Page', view: 'home' },
  { key: 'calendar', title: 'Calendar', subtitle: 'You · Calendar', type: 'Page', view: 'calendar' },
  { key: 'leave', title: 'Leave Tracker', subtitle: 'You · Leave', type: 'Page', view: 'leave' },
  { key: 'my-attendance', title: 'My Attendance', subtitle: 'You · Attendance', type: 'Page', view: 'myAttendance' },
  { key: 'hours', title: 'Timesheet', subtitle: 'You · Hours', type: 'Page', view: 'hours' },
  { key: 'account', title: 'Account', subtitle: 'You · Account', type: 'Page', view: 'account' },
  { key: 'company', title: 'Company', subtitle: 'Organization overview', type: 'Page', view: 'company', admin: true },
  { key: 'onboarding', title: 'Onboarding', subtitle: 'Company · Employees', type: 'Page', view: 'onboarding', admin: true },
  { key: 'org-attendance', title: 'Company Attendance', subtitle: 'Company · Attendance', type: 'Page', view: 'attendance', admin: true },
  { key: 'apps', title: 'App access', subtitle: 'Company · Apps', type: 'Page', view: 'apps', admin: true },
  {
    key: 'notes',
    title: 'Notebook',
    subtitle: 'Open notes board',
    type: 'Page',
    open: () => window.open(`${window.location.origin}${APP_NOTES}`, '_blank', 'noopener,noreferrer'),
  },
]

function matchQuery(text, q) {
  return String(text || '')
    .toLowerCase()
    .includes(q)
}

export function PulseHeaderSearch({ user, onOpenModule, onOpenView }) {
  const admin = isPulseAdmin(user)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [people, setPeople] = useState([])
  const [loadingPeople, setLoadingPeople] = useState(false)
  const query = q.trim().toLowerCase()

  const runHit = (item) => {
    if (typeof item.open === 'function') {
      item.open()
      return
    }
    if (item.view) {
      const shell = PULSE_SHELL_VIEWS[item.view]
      if (shell) {
        onOpenView?.(shell)
        return
      }
    }
    if (item.module) onOpenModule?.(item.module)
  }

  const pageHits = useMemo(() => {
    if (query.length < 1) return []
    const pages = PAGE_RESULTS.filter((item) => !item.admin || admin)
    const services = MORE_SERVICES.map((item) => ({
      key: `svc-${item.id}`,
      title: item.name,
      subtitle: 'More services',
      type: 'Service',
      module: item.id,
    }))
    return [...pages, ...services]
      .filter((item) => matchQuery(item.title, query) || matchQuery(item.subtitle, query))
      .slice(0, 8)
  }, [query, admin])

  useEffect(() => {
    if (!open || !admin || query.length < 2) {
      setPeople([])
      return undefined
    }
    let cancelled = false
    setLoadingPeople(true)
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.get('/candidates', { params: { q: query } })
        if (cancelled) return
        const rows = res.data?.data?.candidates || []
        setPeople(
          rows.slice(0, 8).map((row) => {
            const name = [row.firstName, row.lastName].filter(Boolean).join(' ') || row.email || 'Employee'
            return {
              key: `cand-${row._id}`,
              title: name,
              subtitle: row.officialEmail || row.email || row.status || 'Onboarding',
              type: 'Employee',
              view: 'onboarding',
            }
          }),
        )
      } catch {
        if (!cancelled) setPeople([])
      } finally {
        if (!cancelled) setLoadingPeople(false)
      }
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, admin, query])

  const hits = [...pageHits, ...people]
  const showEmpty = query.length >= 1 && !loadingPeople && hits.length === 0

  const panel = (
    <div className="pulse-head-search-panel">
      <Input
        allowClear
        autoFocus
        prefix={<SearchOutlined />}
        placeholder="Search pages, people…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="pulse-head-search-list">
        {query.length < 1 ? <p className="pulse-head-search-hint">Type to search BDA OS</p> : null}
        {loadingPeople ? <p className="pulse-head-search-hint">Searching people…</p> : null}
        {showEmpty ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No matches for “${q.trim()}”`} />
        ) : null}
        {hits.map((item) => (
          <button
            key={item.key}
            type="button"
            className="pulse-head-search-row"
            onClick={() => {
              setOpen(false)
              setQ('')
              runHit(item)
            }}
          >
            <span>
              <strong>{item.title}</strong>
              <em>{item.subtitle}</em>
            </span>
            <Typography.Text type="secondary">{item.type}</Typography.Text>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQ('')
      }}
      content={panel}
      arrow={false}
      destroyOnHidden
      rootClassName="pulse-head-pop"
      getPopupContainer={() => document.body}
      styles={{ root: { zIndex: 10000 } }}
    >
      <Button type="text" icon={<SearchOutlined />} aria-label="Search" aria-expanded={open} />
    </Popover>
  )
}

export function PulseHeaderNotifications({ approvals = [], onOpenLeave }) {
  const [open, setOpen] = useState(false)
  const [remote, setRemote] = useState([])

  const loadRemote = async () => {
    try {
      const res = await api.get('/notifications/admin')
      setRemote(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch {
      setRemote([])
    }
  }

  useEffect(() => {
    if (!open) return undefined
    loadRemote()
    const timer = window.setInterval(loadRemote, 60000)
    return () => window.clearInterval(timer)
  }, [open])

  const items = useMemo(() => {
    const fromApprovals = (approvals || []).map((row) => ({
      key: `ap-${row.key}`,
      title: row.from || 'Update',
      message: `${row.type || 'Item'} · ${row.subject || 'Needs attention'}`,
      status: row.status || 'Pending',
      unread: ['Pending', 'Accepted', 'In Progress'].includes(row.status),
      onClick: () => onOpenLeave?.(),
    }))
    const fromRemote = remote
      .filter((row) => !row.isArchived)
      .slice(0, 12)
      .map((row) => ({
        key: `nt-${row._id}`,
        title: row.staff?.fullName || 'Update',
        message: row.message || row.type || 'Notification',
        status: row.isRead ? 'Read' : 'New',
        unread: !row.isRead,
        onClick: async () => {
          try {
            if (!row.isRead) await api.put(`/notifications/${row._id}/read`)
          } catch {
            /* ignore */
          }
          onOpenLeave?.()
          loadRemote()
        },
      }))
    return [...fromApprovals, ...fromRemote].slice(0, 16)
  }, [approvals, remote, onOpenLeave])

  const unread = items.filter((item) => item.unread).length

  const markAll = async () => {
    try {
      await api.post('/notifications/admin/mark-all-read')
    } catch {
      /* ignore */
    }
    loadRemote()
  }

  const panel = (
    <div className="pulse-head-note-panel">
      <header>
        <strong>Notifications</strong>
        {unread > 0 ? (
          <Button type="link" size="small" onClick={markAll}>
            Mark all read
          </Button>
        ) : null}
      </header>
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="You're all caught up" />
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className={item.unread ? 'is-unread' : undefined}
                onClick={() => {
                  setOpen(false)
                  item.onClick?.()
                }}
              >
                <span>
                  <strong>{item.title}</strong>
                  <em>{item.message}</em>
                </span>
                <b>{item.status}</b>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      content={panel}
      arrow={false}
      destroyOnHidden
      rootClassName="pulse-head-pop"
      getPopupContainer={() => document.body}
      styles={{ root: { zIndex: 10000 } }}
    >
      <Badge count={unread} size="small" overflowCount={9}>
        <Button type="text" icon={<BellOutlined />} aria-label="Notifications" aria-expanded={open} />
      </Badge>
    </Popover>
  )
}
