import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Empty, Popover, Typography } from 'antd'
import { BellOutlined, SearchOutlined } from '@ant-design/icons'
import {
  BookOpen,
  CalendarDays,
  Clock3,
  Home,
  LineChart,
  Plane,
  Timer,
  User,
  Wallet,
} from 'lucide-react'
import api from '../api'
import { isPulseAdmin, pulseRoleLabel } from '../utils/pulseRoles'
import { APP_NOTES } from '../utils/pulseEntry'
import { PULSE_SHELL_VIEWS } from '../utils/pulseOpenPage'
import { personName } from '../utils/pulsePerson'
import { CommandPalette } from './command-palette'

const YOU_PAGES = [
  { key: 'home', title: 'Dashboard', subtitle: 'You · Home', type: 'Page', view: 'home', icon: Home, group: 'You' },
  { key: 'calendar', title: 'Calendar', subtitle: 'You · Calendar', type: 'Page', view: 'calendar', icon: CalendarDays, group: 'You' },
  { key: 'leave', title: 'Leave Tracker', subtitle: 'You · Leave', type: 'Page', view: 'leave', icon: Plane, group: 'You' },
  { key: 'my-attendance', title: 'My Attendance', subtitle: 'You · Attendance', type: 'Page', view: 'myAttendance', icon: Clock3, group: 'You' },
  { key: 'hours', title: 'Timesheet', subtitle: 'You · Hours', type: 'Page', view: 'hours', icon: Timer, group: 'You' },
  { key: 'performance', title: 'Performance', subtitle: 'You · Performance', type: 'Page', view: 'performance', icon: LineChart, group: 'You' },
  { key: 'payroll', title: 'Payroll', subtitle: 'You · Payroll', type: 'Page', view: 'payroll', icon: Wallet, group: 'You' },
  { key: 'account', title: 'Account', subtitle: 'You · Account', type: 'Page', view: 'account', icon: User, group: 'You' },
  {
    key: 'notes',
    title: 'Notebook',
    subtitle: 'Open notes board',
    type: 'Page',
    icon: BookOpen,
    group: 'You',
    open: () => window.open(`${window.location.origin}${APP_NOTES}`, '_blank', 'noopener,noreferrer'),
  },
]

function samePerson(row, user) {
  const id = String(user?._id || '')
  const email = String(user?.email || '')
    .trim()
    .toLowerCase()
  if (id && String(row?._id || '') === id) return true
  if (email && String(row?.email || '').trim().toLowerCase() === email) return true
  return false
}

export function PulseHeaderSearch({ user, onOpenModule, onOpenView }) {
  const admin = isPulseAdmin(user)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [people, setPeople] = useState([])
  const [loadingPeople, setLoadingPeople] = useState(false)
  const query = q.trim()

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

  const toCommand = (item) => ({
    id: item.key,
    label: item.title,
    group: item.group || item.type || 'Results',
    badge: item.type,
    hint: item.hint,
    keywords: [item.subtitle, item.type, item.hint, ...(item.keywords || [])].filter(Boolean),
    icon: item.icon,
    onSelect: () => {
      setOpen(false)
      setQ('')
      runHit(item)
    },
  })

  useEffect(() => {
    if (!open) {
      setPeople([])
      setLoadingPeople(false)
      return undefined
    }
    let cancelled = false
    setLoadingPeople(true)
    api
      .get('/launcher/people')
      .then((res) => {
        if (cancelled) return
        const rows = res.data?.data?.members || []
        setPeople(rows.filter((row) => !samePerson(row, user)))
      })
      .catch(() => {
        if (!cancelled) setPeople([])
      })
      .finally(() => {
        if (!cancelled) setLoadingPeople(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, user?._id, user?.email])

  const items = useMemo(() => {
    if (query) {
      return people.map((row) => {
        const name = personName(row) || row.email || 'Employee'
        return toCommand({
          key: `user-${row._id}`,
          title: name,
          subtitle: row.email || '',
          hint: row.email || '',
          type: pulseRoleLabel(row.role),
          view: admin ? 'people' : undefined,
          icon: User,
          group: 'People',
          keywords: [row.email, row.firstName, row.lastName, row.displayName, row.role].filter(Boolean),
        })
      })
    }
    return YOU_PAGES.map(toCommand)
  }, [query, people, admin])

  return (
    <>
      <Button
        type="text"
        icon={<SearchOutlined />}
        aria-label="Search people"
        aria-keyshortcuts="Meta+K Control+K"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      />
      <CommandPalette
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            setQ('')
            setPeople([])
          }
        }}
        onQueryChange={setQ}
        shortcut="k"
        placeholder="Search people…"
        emptyMessage={loadingPeople ? 'Searching people…' : 'No people found.'}
        items={items}
      />
    </>
  )
}

const SEEN_APPROVALS_KEY = 'pulse.notifications.seenApprovals'

function readSeenApprovals() {
  try {
    const raw = sessionStorage.getItem(SEEN_APPROVALS_KEY)
    const list = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(list) ? list.map(String) : [])
  } catch {
    return new Set()
  }
}

function writeSeenApprovals(set) {
  try {
    sessionStorage.setItem(SEEN_APPROVALS_KEY, JSON.stringify([...set]))
  } catch {
    /* ignore quota / private mode */
  }
}

export function PulseHeaderNotifications({ approvals = [], onOpenLeave }) {
  const [open, setOpen] = useState(false)
  const [remote, setRemote] = useState([])
  const [seenApprovals, setSeenApprovals] = useState(() => readSeenApprovals())

  const loadRemote = async () => {
    try {
      const res = await api.get('/notifications/admin')
      setRemote(Array.isArray(res.data?.data) ? res.data.data : [])
    } catch {
      setRemote([])
    }
  }

  useEffect(() => {
    loadRemote()
    const timer = window.setInterval(loadRemote, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (open) loadRemote()
  }, [open])

  const markRemoteRead = async (id) => {
    const noteId = String(id || '')
    if (!noteId) return
    setRemote((prev) =>
      prev.map((row) => (String(row._id) === noteId ? { ...row, isRead: true } : row)),
    )
    try {
      await api.put(`/notifications/${noteId}/read`)
    } catch {
      // Re-sync if the server rejected the update.
      loadRemote()
    }
  }

  const markApprovalSeen = (key) => {
    const next = new Set(seenApprovals)
    next.add(String(key))
    setSeenApprovals(next)
    writeSeenApprovals(next)
  }

  const items = useMemo(() => {
    const fromApprovals = (approvals || []).map((row) => {
      const key = `ap-${row.key}`
      const openStatus = ['Pending', 'Accepted', 'In Progress'].includes(row.status)
      const unread = openStatus && !seenApprovals.has(key)
      return {
        key,
        title: row.from || 'Update',
        message: `${row.type || 'Item'} · ${row.subject || 'Needs attention'}`,
        status: unread ? (row.status || 'Pending') : 'Read',
        unread,
        onClick: async () => {
          markApprovalSeen(key)
          onOpenLeave?.()
        },
      }
    })
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
          if (!row.isRead) await markRemoteRead(row._id)
          onOpenLeave?.()
        },
      }))
    return [...fromApprovals, ...fromRemote].slice(0, 16)
  }, [approvals, remote, onOpenLeave, seenApprovals])

  const unread = items.filter((item) => item.unread).length

  const markAll = async (event) => {
    event?.stopPropagation?.()
    setRemote((prev) => prev.map((row) => ({ ...row, isRead: true })))
    const next = new Set(seenApprovals)
    ;(approvals || []).forEach((row) => next.add(`ap-${row.key}`))
    setSeenApprovals(next)
    writeSeenApprovals(next)
    try {
      await api.post('/notifications/admin/mark-all-read')
    } catch {
      loadRemote()
    }
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
                onClick={async () => {
                  await item.onClick?.()
                  setOpen(false)
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
