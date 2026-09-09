import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Avatar,
  Button,
  Card,
  Empty,
  Flex,
  Input,
  Spin,
  Tooltip,
  Typography,
} from 'antd'
import { InfoCircleOutlined, SearchOutlined } from '@ant-design/icons'
import { useAuth } from '../context/AuthContext'
import { getPulseOpenPath } from '../utils/pulseEntry'
import { goToLoginOrCloseTab } from '../utils/pulseAuthSync'
import PulseMark from './PulseMark'
import api from '../api'
import './apps-flyout.css'

const { Text, Title } = Typography

const PANEL_WIDTH = 420
const PANEL_GAP = 8
const CARET_HALF = 9

function profilePhoto(user) {
  return String(user?.avatarUrl || user?.picture || user?.photo || '').trim()
}

function displayUserId(id) {
  const raw = String(id || '').trim()
  if (!raw) return '-'
  const hex = raw.replace(/[^a-fA-F0-9]/g, '')
  if (hex.length >= 10) {
    try {
      return BigInt(`0x${hex.slice(-12)}`).toString().slice(0, 11)
    } catch {
      return raw.slice(-11)
    }
  }
  return raw
}

function profileName(user) {
  const raw = String(
    user?.name?.trim() ||
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      user?.firstName ||
      String(user?.email || 'there').split('@')[0],
  ).trim()
  if (!raw) return 'there'
  return raw
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function AppTile({ app, onOpen }) {
  return (
    <button type="button" className="af-app" onClick={() => onOpen(app)}>
      <Avatar
        shape="square"
        size={40}
        src={app.iconUrl || undefined}
        className="af-app-avatar"
        style={{ background: app.iconUrl ? '#fff' : '#E8F2EE', color: '#1A5F4A' }}
      >
        {(app.name || '?').charAt(0)}
      </Avatar>
      <Text className="af-app-name" ellipsis>
        {app.name}
      </Text>
    </button>
  )
}

export default function AppsFlyout({
  open,
  onClose,
  anchorRef,
  variant = 'apps',
  signingOut = false,
  onSignOut,
}) {
  const pulseHome = variant === 'pulse'
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [photoBroken, setPhotoBroken] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState({ top: 58, right: 0, caretRight: 7 })
  const [apps, setApps] = useState(() =>
    Array.isArray(user?.assignedApps) ? user.assignedApps : [],
  )
  const [count, setCount] = useState(() =>
    Number.isFinite(user?.assignedAppCount) ? user.assignedAppCount : (user?.assignedApps?.length || 0),
  )
  const [loading, setLoading] = useState(false)

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const pulseHit = 'pulse'.includes(q)
      ? [{ id: 'pulse', name: 'Pulse', to: '/pulse', isPulse: true }]
      : []
    return [
      ...pulseHit,
      ...apps.filter((a) => String(a.name || '').toLowerCase().includes(q)),
    ]
  }, [query, apps])

  useLayoutEffect(() => {
    if (!open) return undefined

    const place = () => {
      const el = anchorRef?.current
      const vw = window.innerWidth
      const right = 0
      const panelWidth = Math.min(PANEL_WIDTH, vw)
      if (!el) {
        setPos({ top: 58, right, caretRight: 7 })
        return
      }
      const r = el.getBoundingClientRect()
      const iconCenterX = r.left + r.width / 2
      const tipFromPanelRight = vw - right - iconCenterX
      const caretRight = Math.max(
        4,
        Math.min(panelWidth - CARET_HALF * 2 - 4, tipFromPanelRight - CARET_HALF),
      )
      setPos({
        top: Math.round(r.bottom + PANEL_GAP),
        right,
        caretRight: Math.round(caretRight),
      })
    }

    place()
    const t = window.setTimeout(place, 40)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    setPhotoBroken(false)
  }, [user?.avatarUrl, user?.picture, user?.photo, open])

  useEffect(() => {
    if (!open) {
      setQuery('')
      return undefined
    }
    let cancelled = false
    setLoading(true)
    api
      .get('/launcher/apps', {
        headers: { 'Cache-Control': 'no-cache' },
        params: { t: Date.now() },
      })
      .then((res) => {
        if (cancelled) return
        const list = Array.isArray(res.data?.data?.apps) ? res.data.data.apps : []
        setApps(list)
        setCount(list.length)
      })
      .catch(() => {
        if (cancelled) return
        const fallback = Array.isArray(user?.assignedApps) ? user.assignedApps : []
        setApps(fallback)
        setCount(fallback.length)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, user?.email, user?.assignedAppCount])

  const go = (appOrTo) => {
    onClose()
    if (typeof appOrTo === 'string') {
      if (appOrTo === '/pulse' || appOrTo.startsWith('/pulse')) {
        window.open(getPulseOpenPath(user), '_blank', 'noopener,noreferrer')
      }
      return
    }
    if (appOrTo?.isPulse || appOrTo?.to === '/pulse' || appOrTo?.id === 'pulse') {
      window.open(getPulseOpenPath(user), '_blank', 'noopener,noreferrer')
      return
    }
    if (appOrTo?.url) {
      window.open(appOrTo.url, '_blank', 'noopener,noreferrer')
    }
  }

  if (typeof document === 'undefined') return null

  const assignedLabel = `Assigned to ${user?.email || 'you'}${loading ? '' : ` (${count})`}`
  const name = profileName(user)
  const initial = (name || 'S').charAt(0).toUpperCase()
  const photoSrc = !photoBroken ? profilePhoto(user) : ''

  const assignedBlock = (
    <>
      <Text className="af-section-label">{assignedLabel}</Text>
      {loading && apps.length === 0 ? (
        <Flex justify="center" style={{ padding: 24 }}>
          <Spin />
        </Flex>
      ) : apps.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={`No apps assigned to ${user?.email || 'this email'} yet.`}
        />
      ) : (
        <div className="af-grid">
          {apps.map((app) => (
            <AppTile key={app.id || app.appId || app.url} app={app} onOpen={go} />
          ))}
        </div>
      )}
    </>
  )

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="af-root" role="dialog" aria-modal="true" aria-label={pulseHome ? 'Account and assigned apps' : 'People OS apps'}>
          <motion.button
            type="button"
            className="af-backdrop"
            aria-label="Close apps"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.aside
            className="af-panel"
            style={{ top: pos.top, right: pos.right, '--af-caret-right': `${pos.caretRight}px` }}
            initial={{ x: '110%', opacity: 0.85 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '110%', opacity: 0.85 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.85 }}
          >
            <span className="af-caret" aria-hidden="true" />
            <div className={`af-panel-inner${pulseHome ? ' is-pulse' : ''}`}>
              {pulseHome ? (
                <>
                  <div className="af-profile">
                    <Avatar
                      className="af-profile-photo"
                      src={photoSrc || undefined}
                      size={88}
                      referrerPolicy="no-referrer"
                      style={photoSrc ? undefined : { background: '#1A5F4A', fontSize: 32 }}
                      onError={() => {
                        setPhotoBroken(true)
                        return true
                      }}
                    >
                      {initial}
                    </Avatar>
                    <Title level={4}>{name}</Title>
                    <Text type="secondary">{user?.email}</Text>
                    <Text type="secondary" className="af-profile-id">
                      User ID : {displayUserId(user?._id)}{' '}
                      <Tooltip title="Your unique People OS account identifier">
                        <InfoCircleOutlined />
                      </Tooltip>
                    </Text>
                    <Button
                      type="primary"
                      danger
                      loading={signingOut}
                      onClick={() => {
                        if (onSignOut) {
                          onSignOut()
                          return
                        }
                        onClose()
                        logout()
                        goToLoginOrCloseTab(navigate)
                      }}
                    >
                      Sign Out
                    </Button>
                  </div>
                  {assignedBlock}
                </>
              ) : (
                <>
                  <Input
                    allowClear
                    size="large"
                    prefix={<SearchOutlined />}
                    placeholder="Search applications"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoComplete="off"
                    autoFocus
                    className="af-search"
                  />

                  {query ? (
                    <>
                      <Text className="af-section-label">Search results</Text>
                      {searchResults.length === 0 ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No apps match “${query}”.`} />
                      ) : (
                        <div className="af-grid">
                          {searchResults.map((app) =>
                            app.isPulse ? (
                              <button key="pulse" type="button" className="af-app" onClick={() => go('/pulse')}>
                                <span className="af-app-mark">
                                  <PulseMark size={28} />
                                </span>
                                <Text className="af-app-name">Pulse</Text>
                              </button>
                            ) : (
                              <AppTile key={app.id || app.appId} app={app} onOpen={go} />
                            ),
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <Text className="af-section-label">Featured app</Text>
                      <Card size="small" className="af-featured" bordered>
                        <Flex gap={12} align="center">
                          <PulseMark size={40} title="Pulse" />
                          <div className="af-featured-copy">
                            <Title level={5}>Pulse</Title>
                            <Button type="link" onClick={() => go('/pulse')}>
                              Open Pulse now
                            </Button>
                          </div>
                        </Flex>
                      </Card>
                      {assignedBlock}
                    </>
                  )}
                </>
              )}
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
