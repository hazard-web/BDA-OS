import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { HolderOutlined } from '@ant-design/icons'
import { Circle, Pause } from '@phosphor-icons/react'
import { Avatar, Button, Card } from 'antd'
import PulseGreetingBanner, { periodForHour, PulseSkyWash } from './PulseGreetingBanner'
import PulseWorkSchedule from './PulseWorkSchedule'
import PulseMySpaceCalendar from './PulseMySpaceCalendar'
import PulseDeskGames from './PulseDeskGames'
import PulseCheckinBuddy from './PulseCheckinBuddy'
import { formatElapsed } from '../utils/pulseCheckIn'
import { hiResAvatarUrl } from '../utils/hiResAvatar'
import { DRAG_THRESHOLD, SWAP_LOCK_PX, crossedSwapMid, hitIdFromPoint, moveId } from '../utils/pulseWidgetDrag'

const STORAGE_KEY = 'pulseOverviewCards.v2'

function PulseStripBackdrop() {
  return (
    <div className="pulse-strip-scene" aria-hidden="true">
      <img className="pulse-strip-photo" src="/pulse-overview-peak.jpg" alt="" />
      <div className="pulse-strip-shade" />
      <div className="pulse-aura-sheen" />
    </div>
  )
}
const LEGACY_STORAGE_KEY = 'pulseOverviewCards.v1'
const TILES = [
  { id: 'today', label: 'Today' },
  { id: 'portrait', label: 'Profile' },
  { id: 'checkin', label: 'Check-in' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'games', label: 'Desk games' },
]
const DEFAULT_ORDER = TILES.map((tile) => tile.id)

function normalizeOrder(list) {
  const next = (Array.isArray(list) ? list : []).filter((id) => DEFAULT_ORDER.includes(id))
  if (!next.includes('portrait')) {
    const todayAt = next.indexOf('today')
    next.splice(todayAt >= 0 ? todayAt + 1 : 0, 0, 'portrait')
  }
  DEFAULT_ORDER.forEach((id) => {
    if (!next.includes(id)) next.push(id)
  })
  return next.length === DEFAULT_ORDER.length ? next : DEFAULT_ORDER
}

function readOrder() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEY)
    return normalizeOrder(JSON.parse(raw || '[]'))
  } catch {
    return DEFAULT_ORDER
  }
}

function writeOrder(order) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
  } catch {
    /* ignore */
  }
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
}) {
  const role = workWeek.profile?.designation || (isPulseAdmin ? 'HR Manager' : 'Member')
  const portraitSrc = hiResAvatarUrl(user?.avatarUrl, 800)
  const [order, setOrder] = useState(readOrder)
  const [ghost, setGhost] = useState(null)
  const [intro, setIntro] = useState(true)
  const cardRefs = useRef(new Map())

  useEffect(() => {
    setOrder((prev) => {
      const next = normalizeOrder(prev)
      if (next.join() === prev.join()) return prev
      writeOrder(next)
      return next
    })
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setIntro(false), 800)
    return () => window.clearTimeout(timer)
  }, [])
  const dragRef = useRef(null)
  const ghostPosRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef(0)
  const orderRef = useRef(order)
  orderRef.current = order

  const applyOrder = useCallback((fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return
    setOrder((prev) => {
      const next = normalizeOrder(moveId(prev, fromId, toId))
      if (next.join() === prev.join()) return prev
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
      writeOrder(orderRef.current)
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
    return (
      <div className="pulse-games-card">
        <PulseDeskGames name={name} />
      </div>
    )
  }

  const renderTile = (id, { floating = false } = {}) => {
    const isSlot = !floating && draggingId === id
    return (
      <div
        key={floating ? `ghost-${id}` : id}
        ref={floating ? undefined : (el) => {
          if (el) cardRefs.current.set(id, el)
          else cardRefs.current.delete(id)
        }}
        className={`pulse-ov-tile is-${id}${floating ? ' is-floating' : ''}${isSlot ? ' is-slot' : ''}`}
        style={isSlot && ghost ? { minHeight: ghost.height } : undefined}
        aria-hidden={isSlot || floating ? true : undefined}
      >
        {isSlot ? null : (
          <OvGrip label={labels[id]} floating={floating} onPointerDown={(event) => startCardDrag(id, event)} />
        )}
        <div className="pulse-ov-tile-inner">
          {renderBody(id, floating)}
        </div>
      </div>
    )
  }

  return (
    <div className="pulse-strip-root">
      <PulseStripBackdrop />
      <div className={`pulse-scroll pulse-scroll-surface pulse-ov-open is-${periodForHour(hour)}`} data-period={periodForHour(hour)}>
        <div className={`pulse-overview${intro ? '' : ' is-settled'}${reordering ? ' is-reordering' : ''}`}>
          <div className="pulse-ov-board">
            {order.map((id) => renderTile(id))}
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
