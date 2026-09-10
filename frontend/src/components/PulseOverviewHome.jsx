import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { CloseOutlined, HolderOutlined, ReloadOutlined, SlidersOutlined } from '@ant-design/icons'
import { Circle, Pause } from '@phosphor-icons/react'
import { Avatar, Button, Card, Popover, Switch, Typography } from 'antd'
import api from '../api'
import PulseGreetingBanner, { periodForHour, PulseSkyWash } from './PulseGreetingBanner'
import PulseWorkSchedule from './PulseWorkSchedule'
import PulseMySpaceCalendar from './PulseMySpaceCalendar'
import PulseCheckinBuddy from './PulseCheckinBuddy'
import {
  DashListWidget,
  DEMO as DASH_WIDGET_DEMO,
  EMPTY_DASH,
  filterWidgetData,
} from './PulseMySpaceDashboard'
import { formatElapsed } from '../utils/pulseCheckIn'
import { hiResAvatarUrl } from '../utils/hiResAvatar'
import { DRAG_THRESHOLD, SWAP_LOCK_PX, crossedSwapMid, hitIdFromPoint, moveId } from '../utils/pulseWidgetDrag'

const STORAGE_KEY = 'pulseOverviewCards.v4'
const LEGACY_STORAGE_KEYS = ['pulseOverviewCards.v2', 'pulseOverviewCards.v1']

const PINNED_TILES = [
  { id: 'today', label: 'Today' },
  { id: 'checkin', label: 'Check-in' },
]

const CORE_TILES = [
  { id: 'portrait', label: 'Profile' },
  { id: 'calendar', label: 'Calendar' },
]

const DASH_TILES = [
  { id: 'birthday', label: 'Birthday', dataKey: 'birthday', empty: 'No birthdays this month', showAvatar: true, tone: 'amber' },
  { id: 'workAnniv', label: 'Work anniversary', dataKey: 'workAnniv', empty: 'No work anniversaries this month', showAvatar: true, tone: 'green' },
]

const MOVABLE_TILES = [...CORE_TILES, ...DASH_TILES]
const TILES = [...PINNED_TILES, ...MOVABLE_TILES]
const PINNED_IDS = PINNED_TILES.map((tile) => tile.id)
const MOVABLE_IDS = MOVABLE_TILES.map((tile) => tile.id)
const DASH_BY_ID = Object.fromEntries(DASH_TILES.map((tile) => [tile.id, tile]))
const DEFAULT_ORDER = [...MOVABLE_IDS]
const DEFAULT_ENABLED = Object.fromEntries(MOVABLE_TILES.map((tile) => [tile.id, true]))

export function PulseStripBackdrop() {
  return (
    <div className="pulse-strip-scene" aria-hidden="true">
      <img className="pulse-strip-photo" src="/pulse-overview-peak.jpg" alt="" />
      <div className="pulse-strip-shade" />
      <div className="pulse-aura-sheen" />
    </div>
  )
}

function defaultPrefs() {
  return { order: DEFAULT_ORDER, enabled: { ...DEFAULT_ENABLED } }
}

function normalizeOrder(list) {
  const next = (Array.isArray(list) ? list : []).filter((id) => MOVABLE_IDS.includes(id))
  MOVABLE_IDS.forEach((id) => {
    if (!next.includes(id)) next.push(id)
  })
  return next.length === DEFAULT_ORDER.length ? next : DEFAULT_ORDER
}

function readPrefs() {
  try {
    let raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      for (const key of LEGACY_STORAGE_KEYS) {
        raw = window.localStorage.getItem(key)
        if (raw) break
      }
    }
    const parsed = JSON.parse(raw || 'null')
    if (Array.isArray(parsed)) {
      return { order: normalizeOrder(parsed), enabled: { ...DEFAULT_ENABLED } }
    }
    if (parsed && typeof parsed === 'object') {
      return {
        order: normalizeOrder(parsed.order),
        enabled: { ...DEFAULT_ENABLED, ...(parsed.enabled || {}) },
      }
    }
  } catch {
    /* ignore */
  }
  return defaultPrefs()
}

function writePrefs(prefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

function OverviewCustomizePanel({ prefs, setPrefs, onClose }) {
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const rowRefs = useRef(new Map())
  const dragRef = useRef(null)

  const list = useMemo(() => {
    const byId = Object.fromEntries(MOVABLE_TILES.map((tile) => [tile.id, tile]))
    return prefs.order.map((id) => byId[id]).filter(Boolean)
  }, [prefs.order])

  const toggle = (id, on) => {
    setPrefs((prev) => {
      const next = { ...prev, enabled: { ...prev.enabled, [id]: on } }
      writePrefs(next)
      return next
    })
  }

  const commitOrder = useCallback((fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return
    setPrefs((prev) => {
      const order = normalizeOrder(moveId(prev.order, fromId, toId))
      if (order.join() === prev.order.join()) return prev
      const next = { ...prev, order }
      writePrefs(next)
      return next
    })
  }, [setPrefs])

  useEffect(() => {
    if (!dragId) return undefined
    const onMove = (event) => {
      const session = dragRef.current
      if (!session) return
      const dx = event.clientX - session.startX
      const dy = event.clientY - session.startY
      if (!session.active && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      session.active = true
      const ids = list.map((item) => item.id)
      const hit = hitIdFromPoint(ids, rowRefs, event.clientX, event.clientY)
      if (hit && hit !== session.fromId) {
        setOverId(hit)
        commitOrder(session.fromId, hit)
      }
    }
    const onUp = () => {
      dragRef.current = null
      setDragId(null)
      setOverId(null)
      document.body.classList.remove('pulse-dash-dragging')
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragId, list, commitOrder])

  const startRowDrag = (id, event) => {
    if (event.button != null && event.button !== 0) return
    event.preventDefault()
    dragRef.current = { fromId: id, startX: event.clientX, startY: event.clientY, active: false }
    setDragId(id)
    setOverId(null)
    document.body.classList.add('pulse-dash-dragging')
  }

  return (
    <div className="pulse-dash-customize pulse-ov-customize">
      <header className="pulse-dash-customize-head">
        <Typography.Text strong>Customize overview</Typography.Text>
        <Button
          type="text"
          size="small"
          className="pulse-dash-customize-close"
          icon={<CloseOutlined />}
          aria-label="Close"
          onClick={onClose}
        />
      </header>
      <div className="pulse-dash-customize-scroll">
        <p className="pulse-dash-customize-kicker">Pinned</p>
        <ul className="pulse-dash-customize-list">
          {PINNED_TILES.map((item) => (
            <li key={item.id} className="pulse-dash-customize-row is-pinned">
              <span className="pulse-dash-customize-grip-spacer" aria-hidden="true" />
              <span className="pulse-dash-customize-label">{item.label}</span>
              <span className="pulse-dash-customize-fixed">Fixed</span>
            </li>
          ))}
        </ul>
        <p className="pulse-dash-customize-kicker">Widgets</p>
        <ul className="pulse-dash-customize-list">
          {list.map((item) => (
            <li
              key={item.id}
              ref={(el) => {
                if (el) rowRefs.current.set(item.id, el)
                else rowRefs.current.delete(item.id)
              }}
              className={[
                'pulse-dash-customize-row',
                dragId === item.id ? 'is-dragging' : '',
                overId === item.id && dragId !== item.id ? 'is-drop-target' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button
                type="button"
                className="pulse-dash-customize-grip-btn"
                aria-label={`Reorder ${item.label}`}
                onPointerDown={(event) => startRowDrag(item.id, event)}
              >
                <HolderOutlined className="pulse-dash-customize-grip" aria-hidden="true" />
              </button>
              <span className="pulse-dash-customize-label">{item.label}</span>
              <Switch
                size="small"
                checked={prefs.enabled[item.id] !== false}
                onChange={(on) => toggle(item.id, on)}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function OvGrip({ label, onPointerDown, floating }) {
  return (
    <button
      type="button"
      className="pulse-dash-card-grip pulse-ov-grip"
      aria-label={`Drag ${label}`}
      onPointerDown={floating ? undefined : onPointerDown}
      tabIndex={floating ? -1 : 0}
    >
      <HolderOutlined />
    </button>
  )
}

function TodayCard({ name, hour, workWeek }) {
  return (
    <Card size="small">
      <div className="pulse-feed">
        <PulseGreetingBanner name={name} hour={hour} />
        <PulseWorkSchedule week={workWeek} />
      </div>
    </Card>
  )
}

function PortraitCard({ name, role, portraitSrc, user, initial, onPointerDown }) {
  return (
    <aside
      className="pulse-ov-portrait"
      aria-label={`${name}, ${role}`}
      onPointerDown={onPointerDown}
    >
      {portraitSrc ? (
        <img
          className="pulse-ov-portrait-face"
          src={portraitSrc}
          srcSet={`${hiResAvatarUrl(user.avatarUrl, 480)} 480w, ${hiResAvatarUrl(user.avatarUrl, 800)} 800w, ${hiResAvatarUrl(user.avatarUrl, 1200)} 1200w`}
          sizes="(min-width: 1100px) 32vw, 100vw"
          alt=""
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="pulse-ov-portrait-mono" aria-hidden="true">{initial}</div>
      )}
      <div className="pulse-ov-portrait-plate">
        <strong>{name}</strong>
        <span>{role}</span>
      </div>
    </aside>
  )
}

function checkInView(checkedInAt, elapsed) {
  if (checkedInAt) {
    return {
      mode: 'live',
      status: 'On the clock',
      action: 'Check out',
      busy: 'Checking out',
    }
  }
  if (elapsed > 0) {
    return {
      mode: 'paused',
      status: 'Paused',
      action: 'Resume',
      busy: 'Resuming',
    }
  }
  return {
    mode: 'idle',
    status: 'Not started',
    action: 'Check in',
    busy: 'Checking in',
  }
}

function ElapsedFace({ seconds, mode }) {
  const stamp = formatElapsed(seconds)
  const [hours, minutes, secs] = stamp.split(':')
  const spoken =
    mode === 'live'
      ? `On the clock, ${stamp} elapsed`
      : mode === 'paused'
        ? `Paused, ${stamp} worked so far`
        : `Not started, ${stamp}`
  return (
    <p
      className={`pulse-checkin-time is-${mode}`}
      role="timer"
      aria-live={mode === 'live' ? 'polite' : 'off'}
      aria-label={spoken}
    >
      {mode === 'live' ? <Circle className="pulse-checkin-beat" weight="fill" size={10} aria-hidden="true" /> : null}
      {mode === 'paused' ? <Pause className="pulse-checkin-pause" weight="fill" size={18} aria-hidden="true" /> : null}
      <span>{hours}</span>
      <span className="pulse-checkin-colon" aria-hidden="true">:</span>
      <span>{minutes}</span>
      <span className="pulse-checkin-colon" aria-hidden="true">:</span>
      <span>{secs}</span>
    </p>
  )
}

function CheckinCard({ name, initial, avatarUrl, hour, checkedInAt, elapsed, checkBusy, onCheckIn }) {
  const view = checkInView(checkedInAt, elapsed)
  const period = periodForHour(hour)
  return (
    <Card
      className={`pulse-checkin-card is-${view.mode} is-${period}`}
      size="small"
      aria-label={`${name}'s check-in`}
    >
      <PulseSkyWash hour={hour} />
      <PulseCheckinBuddy checkedIn={Boolean(checkedInAt)} />
      <div className="pulse-checkin-head">
        <Avatar
          size={40}
          src={avatarUrl || undefined}
          className="pulse-avatar pulse-checkin-face"
          referrerPolicy="no-referrer"
        >
          {initial}
        </Avatar>
        <div className="pulse-checkin-who">
          <strong>{name}</strong>
          <span className={`pulse-checkin-status is-${view.mode}`}>{view.status}</span>
        </div>
        <time className="pulse-checkin-date" dateTime={format(new Date(), 'yyyy-MM-dd')}>
          {format(new Date(), 'EEE d MMM')}
        </time>
      </div>
      <div className="pulse-checkin-main">
        <div className="pulse-checkin-clock">
          <ElapsedFace seconds={elapsed} mode={view.mode} />
        </div>
        <div className="pulse-checkin-cta-wrap">
          <Button
            type="primary"
            size="large"
            block
            loading={checkBusy}
            disabled={checkBusy}
            aria-busy={checkBusy}
            className={`pulse-checkin-cta${view.mode === 'live' ? ' is-checked-in' : ''}${view.mode === 'paused' ? ' is-resume' : ''}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onCheckIn()
            }}
          >
            {checkBusy ? view.busy : view.action}
          </Button>
        </div>
      </div>
    </Card>
  )
}

/** Overview: greeting, week, check-in. Cards reorder like Dashboard. */
export default function PulseOverviewHome({
  name,
  initial,
  hour,
  user,
  sample,
  workWeek,
  weekDays,
  checkedInAt,
  elapsed,
  checkBusy,
  onCheckIn,
  isPulseAdmin,
  onOpen,
  onSoon,
}) {
  const role = workWeek.profile?.designation || (isPulseAdmin ? 'HR Manager' : 'Member')
  const portraitSrc = hiResAvatarUrl(user?.avatarUrl, 800)
  const [prefs, setPrefs] = useState(readPrefs)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const [ghost, setGhost] = useState(null)
  const [intro, setIntro] = useState(true)
  const [toolsHost, setToolsHost] = useState(null)
  const [liveData, setLiveData] = useState(null)
  const cardRefs = useRef(new Map())
  const pinRef = useRef(null)
  const order = prefs.order
  const movableVisible = order.filter((id) => prefs.enabled[id] !== false)

  useLayoutEffect(() => {
    setToolsHost(document.getElementById('pulse-dash-sub-tools'))
  })

  useEffect(() => {
    setPrefs((prev) => {
      const next = {
        order: normalizeOrder(prev.order),
        enabled: { ...DEFAULT_ENABLED, ...(prev.enabled || {}) },
      }
      if (next.order.join() === prev.order.join() && JSON.stringify(next.enabled) === JSON.stringify(prev.enabled)) {
        return prev
      }
      writePrefs(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (sample) {
      setLiveData(null)
      return undefined
    }
    let cancelled = false
    api.get('/pulse-checkin/dashboard')
      .then((res) => {
        if (cancelled) return
        const payload = res.data?.data && typeof res.data.data === 'object' ? res.data.data : {}
        setLiveData(filterWidgetData({ ...EMPTY_DASH, ...payload }))
      })
      .catch(() => {
        if (!cancelled) setLiveData(EMPTY_DASH)
      })
    return () => {
      cancelled = true
    }
  }, [sample, tick])

  const dashData = useMemo(() => {
    if (sample) return filterWidgetData(DASH_WIDGET_DEMO)
    return liveData || EMPTY_DASH
  }, [sample, liveData])

  const openDashRow = useCallback((item) => {
    if (item?.to && typeof onOpen === 'function') {
      onOpen(item.to)
      return
    }
    if (typeof onSoon === 'function') onSoon(item?.to || item?.title || 'Overview')
  }, [onOpen, onSoon])

  useEffect(() => {
    const timer = window.setTimeout(() => setIntro(false), 800)
    return () => window.clearTimeout(timer)
  }, [])
  const dragRef = useRef(null)
  const ghostPosRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef(0)
  const orderRef = useRef(movableVisible)
  orderRef.current = movableVisible
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  const applyOrder = useCallback((fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return
    setPrefs((prev) => {
      const nextOrder = normalizeOrder(moveId(prev.order, fromId, toId))
      if (nextOrder.join() === prev.order.join()) return prev
      const next = { ...prev, order: nextOrder }
      writePrefs(next)
      return next
    })
  }, [])

  const paintGhost = useCallback(() => {
    rafRef.current = 0
    const session = dragRef.current
    if (!session?.active) return
    const { x, y } = ghostPosRef.current
    setGhost((prev) => (prev ? { ...prev, x, y, pending: false } : prev))
  }, [])

  useEffect(() => {
    if (!ghost?.id) return undefined

    const onMove = (event) => {
      const session = dragRef.current
      if (!session) return
      const dx = event.clientX - session.startX
      const dy = event.clientY - session.startY
      if (!session.active && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      if (!session.active) {
        session.active = true
        session.lockX = null
        session.lockY = null
        document.body.classList.add('pulse-dash-dragging')
      }
      ghostPosRef.current = {
        x: event.clientX - session.offsetX,
        y: event.clientY - session.offsetY,
      }
      if (!rafRef.current) rafRef.current = requestAnimationFrame(paintGhost)
      const pin = pinRef.current
      if (pin) {
        const bound = pin.getBoundingClientRect()
        const overPin =
          event.clientX >= bound.left &&
          event.clientX <= bound.right &&
          event.clientY >= bound.top &&
          event.clientY <= bound.bottom
        if (overPin) return
      }
      if (
        session.lockX != null &&
        Math.hypot(event.clientX - session.lockX, event.clientY - session.lockY) < SWAP_LOCK_PX
      ) {
        return
      }
      const hit = hitIdFromPoint(orderRef.current, cardRefs, event.clientX, event.clientY, session.fromId)
      if (!hit || hit === session.fromId || hit === session.lastHit) return
      if (!crossedSwapMid(orderRef.current, cardRefs, session.fromId, hit, event.clientX, event.clientY)) return
      session.lastHit = hit
      session.lockX = event.clientX
      session.lockY = event.clientY
      applyOrder(session.fromId, hit)
    }

    const onUp = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
      dragRef.current = null
      setGhost(null)
      writePrefs(prefsRef.current)
      document.body.classList.remove('pulse-dash-dragging')
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      document.body.classList.remove('pulse-dash-dragging')
    }
  }, [ghost?.id, applyOrder, paintGhost])

  const startCardDrag = (id, event) => {
    if (PINNED_IDS.includes(id)) return
    if (event.button != null && event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const card = cardRefs.current.get(id)
    if (!card) return
    const rect = card.getBoundingClientRect()
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      /* ignore */
    }
    dragRef.current = {
      fromId: id,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      active: false,
      lastHit: id,
      lockX: event.clientX,
      lockY: event.clientY,
    }
    document.body.classList.add('pulse-dash-dragging')
    setGhost({
      id,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      x: rect.left,
      y: rect.top,
      pending: true,
    })
  }

  const draggingId = ghost && !ghost.pending ? ghost.id : null
  const reordering = Boolean(ghost?.id)
  const labels = useMemo(() => Object.fromEntries(TILES.map((tile) => [tile.id, tile.label])), [])

  const renderBody = (id, floating = false) => {
    if (id === 'today') {
      return <TodayCard name={name} hour={hour} workWeek={workWeek} />
    }
    if (id === 'portrait') {
      return (
        <PortraitCard
          name={name}
          role={role}
          portraitSrc={portraitSrc}
          user={user}
          initial={initial}
          onPointerDown={floating ? undefined : (event) => startCardDrag('portrait', event)}
        />
      )
    }
    if (id === 'checkin') {
      return (
        <CheckinCard
          name={name}
          initial={initial}
          avatarUrl={user?.avatarUrl}
          hour={hour}
          checkedInAt={checkedInAt}
          elapsed={elapsed}
          checkBusy={checkBusy}
          onCheckIn={onCheckIn}
        />
      )
    }
    if (id === 'calendar') {
      return (
        <Card
          className="pulse-cal-widget-card"
          size="small"
          title="Calendar"
        >
          <PulseMySpaceCalendar compact sample={sample} weekDays={weekDays} checkedInAt={checkedInAt} />
        </Card>
      )
    }
    const dash = DASH_BY_ID[id]
    if (dash) {
      return (
        <DashListWidget
          title={dash.label}
          items={dashData[dash.dataKey] || []}
          empty={dash.empty}
          showAvatar={dash.showAvatar}
          scrollable
          tone={dash.tone}
          floating={floating}
          onRow={openDashRow}
          onGripPointerDown={floating ? undefined : (event) => startCardDrag(id, event)}
        />
      )
    }
    return null
  }

  const renderTile = (id, { floating = false } = {}) => {
    const isSlot = !floating && draggingId === id
    const pinned = PINNED_IDS.includes(id)
    const isDash = Boolean(DASH_BY_ID[id])
    return (
      <div
        key={floating ? `ghost-${id}` : id}
        ref={floating || pinned ? undefined : (el) => {
          if (el) cardRefs.current.set(id, el)
          else cardRefs.current.delete(id)
        }}
        className={`pulse-ov-tile is-${id}${isDash ? ' is-dash' : ''}${pinned ? ' is-pinned' : ''}${floating ? ' is-floating' : ''}${isSlot ? ' is-slot' : ''}`}
        style={isSlot && ghost ? { minHeight: ghost.height } : undefined}
        aria-hidden={isSlot || floating ? true : undefined}
      >
        {isSlot || pinned || isDash ? null : (
          <OvGrip label={labels[id]} floating={floating} onPointerDown={(event) => startCardDrag(id, event)} />
        )}
        <div className="pulse-ov-tile-inner">
          {renderBody(id, floating)}
        </div>
      </div>
    )
  }

  const chip = (
    <div className="pulse-dash-chip" role="toolbar" aria-label="Overview tools">
      <Button
        type="text"
        className="pulse-dash-chip-btn"
        icon={<ReloadOutlined />}
        aria-label="Refresh"
        onClick={() => setTick((n) => n + 1)}
      />
      <span className="pulse-dash-chip-divider" aria-hidden="true" />
      <Popover
        trigger="click"
        placement="bottomRight"
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        arrow={false}
        destroyTooltipOnHide
        getPopupContainer={() => document.body}
        overlayClassName="pulse-dash-customize-pop"
        content={
          <OverviewCustomizePanel
            prefs={prefs}
            setPrefs={setPrefs}
            onClose={() => setCustomizeOpen(false)}
          />
        }
      >
        <Button
          type="text"
          className={`pulse-dash-chip-btn${customizeOpen ? ' is-on' : ''}`}
          icon={<SlidersOutlined />}
          aria-label="Customize overview"
          aria-expanded={customizeOpen}
        />
      </Popover>
    </div>
  )

  return (
    <div className="pulse-strip-root" key={tick}>
      {toolsHost ? createPortal(chip, toolsHost) : null}
      <PulseStripBackdrop />
      <div className={`pulse-scroll pulse-scroll-surface pulse-ov-open is-${periodForHour(hour)}`} data-period={periodForHour(hour)}>
        <div className={`pulse-overview${intro ? '' : ' is-settled'}${reordering ? ' is-reordering' : ''}`}>
          <div className="pulse-ov-board">
            <div className="pulse-ov-pin" ref={pinRef}>
              {renderTile('today')}
              {renderTile('checkin')}
            </div>
            {movableVisible.length ? (
              <div className="pulse-ov-loose">
                {movableVisible.map((id) => renderTile(id))}
              </div>
            ) : null}
          </div>
        </div>
        {draggingId && typeof document !== 'undefined'
          ? createPortal(
              <div
                className="pulse-dash-ghost pulse-ov-ghost"
                style={{
                  width: ghost.width,
                  height: ghost.height,
                  transform: `translate3d(${ghost.x}px, ${ghost.y}px, 0)`,
                }}
              >
                {renderTile(draggingId, { floating: true })}
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  )
}
