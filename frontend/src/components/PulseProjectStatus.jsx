import { useCallback, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { format } from 'date-fns'
import { App, Alert, Button, DatePicker, Empty, Input, Segmented, Select, Switch, Table, Tag } from 'antd'
import { CheckCircle2, Minus, RefreshCw, Send, XCircle } from 'lucide-react'
import api from '../api'
import { hoursLabel } from '../utils/pulseCalendar'

const SLOTS = [
  { key: 'morning', label: 'Morning plan' },
  { key: 'afternoon', label: 'Afternoon check' },
  { key: 'evening', label: 'Evening timesheet' },
  { key: 'reminder', label: 'Reminder' },
  { key: 'summary', label: 'Manager summary' },
]

function Stat({ label, value, hint }) {
  return (
    <div className="pulse-bms-stat">
      <span className="pulse-bms-stat-label">{label}</span>
      <strong>{value}</strong>
      {hint ? <span className="pulse-bms-stat-hint">{hint}</span> : null}
    </div>
  )
}

function BotSettings() {
  const { message } = App.useApp()
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState('')
  const [reportDate, setReportDate] = useState(dayjs())

  const load = useCallback(() => {
    api.get('/chat-bot/settings')
      .then((res) => setSettings(res.data?.data || null))
      .catch((err) => message.error(err?.response?.data?.message || 'Could not load bot settings'))
  }, [message])

  useEffect(() => {
    load()
  }, [load])

  if (!settings) return <p className="pulse-bms-note">Loading bot settings…</p>

  const set = (patch) => setSettings((prev) => ({ ...prev, ...patch }))

  const save = async () => {
    setSaving(true)
    try {
      const body = {
        enabled: settings.enabled,
        teamSpace: settings.teamSpace,
        managerSpace: settings.managerSpace,
        summaryEmails: settings.summaryEmails,
        excludedUsers: settings.members.filter((m) => !m.included).map((m) => m._id),
      }
      SLOTS.forEach((slot) => { body[`${slot.key}Time`] = settings[`${slot.key}Time`] })
      const res = await api.put('/chat-bot/settings', body)
      message.success(res.data?.message || 'Saved')
      load()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const sendNow = async (slot) => {
    setSending(slot)
    try {
      const body = slot === 'summary' ? { slot, date: reportDate.format('YYYY-MM-DD') } : { slot }
      const res = await api.post('/chat-bot/send', body)
      message.success(res.data?.message || 'Posted')
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not post')
    } finally {
      setSending('')
      load()
    }
  }

  return (
    <div className="pulse-ps-settings">
      {!settings.chatConfigured ? (
        <Alert
          type="warning"
          showIcon
          message="Google Chat is not connected"
          description={settings.chatConfigError || 'Set GOOGLE_CHAT_SA_EMAIL, GOOGLE_CHAT_SA_PRIVATE_KEY and GOOGLE_CHAT_PROJECT_NUMBER on the backend.'}
        />
      ) : null}
      {!settings.schedulerOn ? (
        <Alert
          type="info"
          showIcon
          message="Scheduler is off on this server"
          description="Scheduled posts only run where GOOGLE_CHAT_SCHEDULER=true. Use “Post now” to send manually."
        />
      ) : null}

      <p className="pulse-ps-conn">
        Endpoint <code>{settings.endpointUrl || 'not set'}</code> · {settings.addonMode ? 'Workspace add-on' : 'classic'} format ·{' '}
        {settings.lastEvent
          ? `last Chat event ${format(new Date(settings.lastEvent.at), 'd MMM, h:mm:ss a')} — ${settings.lastEvent.type} from ${settings.lastEvent.email || 'unknown'} (${settings.lastEvent.format}, ${settings.lastEvent.verified ? 'signature OK' : `signature rejected: ${settings.lastEvent.reason || 'unknown reason'}`})`
          : 'no Chat events received since the server started'}
      </p>

      <div className="pulse-ps-settings-grid">
        <label className="pulse-ps-field is-switch">
          <span>Daily posts</span>
          <Switch checked={settings.enabled} onChange={(enabled) => set({ enabled })} />
        </label>
        <label className="pulse-ps-field">
          <span>Team space</span>
          <Input value={settings.teamSpace} placeholder="spaces/AAAA1234" onChange={(e) => set({ teamSpace: e.target.value })} />
        </label>
        <label className="pulse-ps-field">
          <span>Manager space</span>
          <Input value={settings.managerSpace} placeholder="spaces/BBBB5678" onChange={(e) => set({ managerSpace: e.target.value })} />
        </label>
      </div>

      <label className="pulse-ps-field">
        <span>End-of-day report emails (sent with the manager summary)</span>
        <Select
          mode="tags"
          value={settings.summaryEmails}
          placeholder="Type an email and press Enter"
          tokenSeparators={[',', ' ']}
          open={false}
          suffixIcon={null}
          onChange={(summaryEmails) => set({ summaryEmails })}
        />
      </label>

      <div className="pulse-ps-field">
        <span>
          Who gets the daily updates ·
          {' '}
          {settings.members.filter((m) => m.included).length} of {settings.members.length}
          {' '}
          (switched-off people are never asked, reminded or counted)
        </span>
        <ul className="pulse-ps-members">
          {settings.members.map((m) => (
            <li key={m._id}>
              <div className="pulse-bms-person">
                <strong>{m.name}</strong>
                <span>{m.email}</span>
              </div>
              <Switch
                size="small"
                checked={m.included}
                onChange={(included) => set({
                  members: settings.members.map((x) => (x._id === m._id ? { ...x, included } : x)),
                })}
              />
            </li>
          ))}
        </ul>
      </div>

      <ul className="pulse-ps-slots">
        {SLOTS.map((slot) => (
          <li key={slot.key} className={slot.key === 'summary' ? 'has-date' : undefined}>
            <div className="pulse-ps-slot-name">
              <strong>{slot.label}</strong>
              {settings.lastResult?.[slot.key] ? (
                <span className={settings.lastResult[slot.key].ok ? 'is-ok' : 'is-bad'}>
                  Last run {format(new Date(settings.lastResult[slot.key].at), 'd MMM, h:mm a')} · {settings.lastResult[slot.key].message}
                </span>
              ) : (
                <span>No run recorded yet</span>
              )}
            </div>
            <Input
              type="time"
              className="pulse-ps-time"
              value={settings[`${slot.key}Time`]}
              onChange={(e) => set({ [`${slot.key}Time`]: e.target.value })}
            />
            {slot.key === 'summary' ? (
              <DatePicker
                value={reportDate}
                allowClear={false}
                format="DD MMM YYYY"
                aria-label="Report date"
                disabledDate={(value) => value && value.isAfter(dayjs(), 'day')}
                onChange={(next) => next && setReportDate(next)}
              />
            ) : null}
            <Button
              icon={<Send size={14} />}
              loading={sending === slot.key}
              disabled={Boolean(sending) || (!settings.chatConfigured && slot.key !== 'summary')}
              onClick={() => sendNow(slot.key)}
            >
              {slot.key === 'summary' ? (reportDate.isSame(dayjs(), 'day') ? 'Send now' : 'Send report') : 'Post now'}
            </Button>
          </li>
        ))}
      </ul>

      <div className="pulse-ps-settings-actions">
        <button type="button" className="pov-cta plive-top-cta plive-checkin" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save bot settings'}
        </button>
      </div>
    </div>
  )
}

const timeOf = (value) => (value ? format(new Date(value), 'h:mm a') : '')

function SlotCell({ state, text, at }) {
  const Icon = state === 'ok' ? CheckCircle2 : state === 'bad' ? XCircle : Minus
  return (
    <span className={`pulse-ps-slot is-${state}`}>
      <Icon size={16} strokeWidth={2} aria-hidden="true" />
      <span>{text}</span>
      {at ? <em>{at}</em> : null}
    </span>
  )
}

function morningCell(p) {
  const n = p.targets.length
  if (n) return { state: 'ok', text: `${n} item${n === 1 ? '' : 's'} planned`, at: timeOf(p.slots.morning.answeredAt) }
  if (p.slots.morning.sentAt) return { state: 'bad', text: 'No plan' }
  return { state: 'idle', text: 'Not asked yet' }
}

function afternoonCell(p) {
  if (p.slots.afternoon.answeredAt) {
    const count = (status) => p.targets.filter((t) => t.status === status).length
    const parts = [
      count('done') && `${count('done')} done`,
      count('on_track') && `${count('on_track')} on track`,
      count('blocked') && `${count('blocked')} blocked`,
    ].filter(Boolean)
    return { state: count('blocked') ? 'bad' : 'ok', text: parts.join(' · ') || 'Updated', at: timeOf(p.slots.afternoon.answeredAt) }
  }
  if (p.slots.afternoon.sentAt && p.targets.length) return { state: 'bad', text: 'No update' }
  return { state: 'idle', text: 'Not asked yet' }
}

function eveningCell(p) {
  if (p.timesheet.submitted) return { state: 'ok', text: `${hoursLabel(p.timesheet.hours)} logged`, at: timeOf(p.slots.evening.answeredAt) }
  if (p.slots.evening.sentAt) return { state: 'bad', text: 'Not submitted' }
  return { state: 'idle', text: 'Not asked yet' }
}

const PROGRESS_TEXT = { on_track: 'On track', blocked: 'Blocked', done: 'Done', planned: 'No answer' }

function StepCard({ icon, title, when, children }) {
  return (
    <section className="pulse-ps-step">
      <header>
        <span aria-hidden="true">{icon}</span>
        <strong>{title}</strong>
        {when ? <em>{when}</em> : null}
      </header>
      {children}
    </section>
  )
}

/** One person's day as three steps: what they planned, their afternoon progress, what they logged. */
function PersonDetail({ person: p, onMove, moving }) {
  const planned = p.targets.length > 0
  const updated = Boolean(p.slots.afternoon.answeredAt)
  const submitted = p.timesheet.submitted
  return (
    <div className="pulse-ps-steps">
      <StepCard icon="☀️" title="Morning · planned" when={planned ? timeOf(p.slots.morning.answeredAt) : ''}>
        {planned ? (
          <ol className="pulse-ps-step-list">
            {p.targets.map((t) => (
              <li key={t.id}>
                <strong>{t.title}</strong>
                <span>{t.projectName || 'General'}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="pulse-ps-step-empty">{p.slots.morning.sentAt ? 'Did not plan anything' : 'Not asked yet'}</p>
        )}
      </StepCard>

      <StepCard icon="🌤" title="Afternoon · progress" when={updated ? timeOf(p.slots.afternoon.answeredAt) : ''}>
        {updated && planned ? (
          <ol className="pulse-ps-step-list">
            {p.targets.map((t) => (
              <li key={t.id}>
                <strong>{t.title}</strong>
                <span className={`pulse-ps-progress is-${t.status}`}>{PROGRESS_TEXT[t.status] || t.status}</span>
                {t.note ? <em>“{t.note}”</em> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="pulse-ps-step-empty">
            {!planned ? 'Nothing planned to update' : p.slots.afternoon.sentAt ? 'No update given' : 'Not asked yet'}
          </p>
        )}
      </StepCard>

      <StepCard
        icon="🌙"
        title="Evening · logged"
        when={submitted ? `${timeOf(p.slots.evening.answeredAt)} · ${hoursLabel(p.timesheet.hours)} total` : ''}
      >
        {submitted ? (
          <ol className="pulse-ps-step-list">
            {p.targets.map((t) => (
              <li key={t.id} className={t.loggedMinutes ? undefined : 'is-zero'}>
                <strong>{t.title}</strong>
                <span className="pulse-ps-hours">{t.loggedMinutes ? hoursLabel(t.loggedMinutes / 60) : '0h'}</span>
              </li>
            ))}
            {p.unplanned.map((u) => (
              <li key={u.id} className="is-extra">
                <strong>{u.title}</strong>
                <span className="pulse-ps-hours">{hoursLabel(u.minutes / 60)}</span>
                <em>Extra work (not in plan)</em>
                {u.movable && planned ? (
                  <Select
                    size="small"
                    className="pulse-ps-move"
                    placeholder="Move to plan item"
                    loading={moving === u.id}
                    disabled={Boolean(moving)}
                    popupMatchSelectWidth={false}
                    options={p.targets.map((t) => ({ value: t.id, label: t.title }))}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(targetId) => onMove(p, u, targetId)}
                  />
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="pulse-ps-step-empty">{p.slots.evening.sentAt ? 'Timesheet not submitted' : 'Not asked yet'}</p>
        )}
      </StepCard>

      <p className="pulse-ps-steps-meta">
        {p.checkIn.at ? `Checked in ${timeOf(p.checkIn.at)} · ${hoursLabel(p.checkIn.activeHours)} active on the timer` : 'No check-in today'}
      </p>
    </div>
  )
}

/** Project Status — plan vs update vs timesheet vs check-in, fed by the Google Chat update bot. */
export default function PulseProjectStatus() {
  const { message } = App.useApp()
  const [date, setDate] = useState(dayjs())
  const [view, setView] = useState('people')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({ people: [], projects: [] })
  const [showEveryone, setShowEveryone] = useState(false)
  const [moving, setMoving] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/chat-bot/status', { params: { date: date.format('YYYY-MM-DD') } })
      setData(res.data?.data || { people: [], projects: [] })
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not load project status')
    } finally {
      setLoading(false)
    }
  }, [date, message])

  const moveHours = async (person, row, targetId) => {
    setMoving(row.id)
    try {
      const res = await api.post('/chat-bot/reassign', {
        userId: person.user,
        date: date.format('YYYY-MM-DD'),
        entryId: row.id,
        targetId,
      })
      message.success(res.data?.message || 'Hours moved')
      await load()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not move the hours')
    } finally {
      setMoving('')
    }
  }

  useEffect(() => {
    load()
  }, [load])

  // Missed or blocked first, then people who reported, then those not asked yet
  const rank = (p) => {
    const states = [morningCell(p), afternoonCell(p), eveningCell(p)].map((c) => c.state)
    return states.includes('bad') ? 0 : states.includes('ok') ? 1 : 2
  }
  const people = (data.people || [])
    .filter((p) => showEveryone || p.participant)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  const planned = people.filter((p) => p.targets.length).length
  const updated = people.filter((p) => p.slots.afternoon.answeredAt).length
  const submitted = people.filter((p) => p.timesheet.submitted).length
  const blocked = people.reduce((sum, p) => sum + p.targets.filter((t) => t.status === 'blocked').length, 0)

  const peopleColumns = [
    {
      title: 'Person',
      key: 'person',
      width: 200,
      render: (_, p) => (
        <span className="pulse-ps-name">
          {p.name}
          {!p.participant ? <Tag className="pulse-ps-off">Not in updates</Tag> : null}
        </span>
      ),
    },
    {
      title: '☀️ Morning plan',
      key: 'morning',
      render: (_, p) => <SlotCell {...morningCell(p)} />,
    },
    {
      title: '🌤 Afternoon update',
      key: 'afternoon',
      render: (_, p) => <SlotCell {...afternoonCell(p)} />,
    },
    {
      title: '🌙 Evening timesheet',
      key: 'evening',
      render: (_, p) => <SlotCell {...eveningCell(p)} />,
    },
  ]

  const projectColumns = [
    { title: 'Project', dataIndex: 'name' },
    { title: 'People', dataIndex: 'people', width: 100 },
    { title: 'Planned items', dataIndex: 'targets', width: 130 },
    { title: 'Blocked', dataIndex: 'blocked', width: 100, render: (v) => (v ? <Tag color="red">{v}</Tag> : 0) },
    { title: 'Done', dataIndex: 'done', width: 90 },
    { title: 'Hours logged', dataIndex: 'loggedMinutes', width: 140, render: (v) => hoursLabel(v / 60) },
  ]

  return (
    <div className="pulse-att-page pulse-apps-att pulse-bms">
      <div className="pulse-att-board">
        <section className="pulse-att-panel" aria-label="Project Status">
          <div className="pulse-att-panel-chrome">
            <header className="pulse-att-panel-head">
              <h4>Project Status</h4>
              <span>From the Google Chat update bot</span>
            </header>
          </div>

          <div className="pulse-apps-att-body">
            <div className="pulse-apps-assign-well pulse-bms-well">
              <div className="pulse-ps-toolbar">
                <DatePicker
                  value={date}
                  allowClear={false}
                  format="ddd, DD MMM YYYY"
                  disabledDate={(value) => value && value.isAfter(dayjs(), 'day')}
                  onChange={(next) => next && setDate(next)}
                />
                <Button icon={<RefreshCw size={14} />} onClick={load} loading={loading}>
                  Refresh
                </Button>
                <label className="pulse-ps-everyone">
                  <Switch size="small" checked={showEveryone} onChange={setShowEveryone} />
                  Show everyone
                </label>
              </div>
              <div className="pulse-bms-stats">
                <Stat label="Planned" value={`${planned} / ${people.length}`} hint="picked today’s work" />
                <Stat label="Updates" value={`${updated} / ${planned || 0}`} hint="answered the afternoon check" />
                <Stat label="Timesheets" value={`${submitted} / ${people.length}`} hint="submitted" />
                <Stat label="Blocked" value={blocked} hint={blocked ? 'needs attention' : 'nothing blocked'} />
              </div>
            </div>

            <div className="pulse-bms-tabs">
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: 'people', label: `People (${people.length})` },
                  { value: 'projects', label: `Projects (${(data.projects || []).length})` },
                  { value: 'bot', label: 'Bot settings' },
                ]}
              />
            </div>

            <div className="pulse-apps-table-wrap">
              {view === 'people' ? (
                <Table
                  size="middle"
                  rowKey="user"
                  loading={loading}
                  pagination={false}
                  columns={peopleColumns}
                  dataSource={people}
                  className="pulse-ps-people"
                  expandable={{
                    expandedRowRender: (p) => <PersonDetail person={p} onMove={moveHours} moving={moving} />,
                    expandRowByClick: true,
                  }}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No one in this organization yet." /> }}
                />
              ) : view === 'projects' ? (
                <Table
                  size="middle"
                  rowKey="name"
                  loading={loading}
                  pagination={false}
                  columns={projectColumns}
                  dataSource={data.projects || []}
                  locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No plans or timesheets for this day." /> }}
                />
              ) : (
                <BotSettings />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
