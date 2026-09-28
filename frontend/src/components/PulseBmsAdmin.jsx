import { useCallback, useEffect, useMemo, useState } from 'react'
import { App, Alert, Button, Checkbox, Empty, Input, Modal, Segmented, Select, Switch, Table, Tag, Tooltip } from 'antd'
import { formatDistanceToNow } from 'date-fns'
import { FolderKanban, PlugZap, RefreshCw, Ticket, Users } from 'lucide-react'
import api from '../api'

const STATUS_TAG = {
  auto: { color: 'green', label: 'Auto · email' },
  manual: { color: 'blue', label: 'Manual' },
  unlinked: { color: 'default', label: 'Not linked' },
  missing: { color: 'red', label: 'Missing in BMS' },
}

function ago(value) {
  if (!value) return 'never'
  return `${formatDistanceToNow(new Date(value))} ago`
}

function Stat({ label, value, hint }) {
  return (
    <div className="pulse-bms-stat">
      <span className="pulse-bms-stat-label">{label}</span>
      <strong>{value}</strong>
      {hint ? <span className="pulse-bms-stat-hint">{hint}</span> : null}
    </div>
  )
}

const SOURCE_LABEL = { agile: 'Agile', task: 'Projects' }

function projectLabel(p) {
  return `${p.name || `#${p.flowluId}`} (${SOURCE_LABEL[p.source]})`
}

function ProjectPicker({ open, onClose, onSaved }) {
  const { message } = App.useApp()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [projects, setProjects] = useState([])
  const [picked, setPicked] = useState(new Set())
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setQuery('')
    api.get('/flowlu/projects')
      .then((res) => {
        const rows = res.data?.data?.projects || []
        setProjects(rows)
        setPicked(new Set(rows.filter((p) => p.selected).map((p) => `${p.source}:${p.flowluId}`)))
      })
      .catch((err) => message.error(err?.response?.data?.message || 'Could not load BMS projects'))
      .finally(() => setLoading(false))
  }, [open, message])

  const toggle = (p, on) => {
    setPicked((prev) => {
      const next = new Set(prev)
      const key = `${p.source}:${p.flowluId}`
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      const chosen = projects.filter((p) => picked.has(`${p.source}:${p.flowluId}`))
      const res = await api.put('/flowlu/projects', {
        projects: chosen.map(({ source, flowluId, name }) => ({ source, flowluId, name })),
      })
      message.success(res.data?.message || 'Projects saved')
      onSaved(chosen.length)
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not save projects')
    } finally {
      setSaving(false)
    }
  }

  const q = query.trim().toLowerCase()
  const visible = projects.filter((p) =>
    (showArchived || !p.archived || picked.has(`${p.source}:${p.flowluId}`)) &&
    (!q || p.name.toLowerCase().includes(q)))

  const group = (source, title) => {
    const rows = visible.filter((p) => p.source === source)
    return (
      <section className="pulse-bms-pick-group">
        <header>
          <strong>{title}</strong>
          <span>{rows.length}</span>
        </header>
        {rows.length ? (
          <ul>
            {rows.map((p) => {
              const box = (
                <Checkbox
                  checked={picked.has(`${p.source}:${p.flowluId}`)}
                  disabled={!p.allowed}
                  onChange={(e) => toggle(p, e.target.checked)}
                >
                  {p.name}
                  {p.archived ? <Tag className="pulse-bms-pick-tag">Archived</Tag> : null}
                </Checkbox>
              )
              return (
                <li key={`${p.source}:${p.flowluId}`}>
                  {p.allowed ? box : <Tooltip title="Not allowed on this server">{box}</Tooltip>}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="pulse-bms-pick-empty">No projects match.</p>
        )}
      </section>
    )
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Projects to sync"
      width={760}
      okText="Save & sync tickets"
      onOk={save}
      confirmLoading={saving}
      okButtonProps={{ disabled: loading }}
      destroyOnHidden
    >
      <div className="pulse-bms-pick-tools">
        <Input.Search allowClear placeholder="Search projects" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="pulse-bms-pick-archived">
          <Switch size="small" checked={showArchived} onChange={setShowArchived} /> Show archived
        </label>
        <span className="pulse-bms-pick-count">{picked.size} selected</span>
      </div>
      {loading ? (
        <p className="pulse-bms-pick-empty">Loading projects from BMS…</p>
      ) : (
        <div className="pulse-bms-pick-groups">
          {group('agile', 'Agile projects · sprints & issues')}
          {group('task', 'Projects · tasks')}
        </div>
      )}
    </Modal>
  )
}

/** BMS (Flowlu) — connection, people mapping, and sync operations. */
export default function PulseBmsAdmin() {
  const { message } = App.useApp()
  const [view, setView] = useState('people')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [savingId, setSavingId] = useState('')
  const [status, setStatus] = useState(null)
  const [members, setMembers] = useState([])
  const [flowluUsers, setFlowluUsers] = useState([])
  const [tickets, setTickets] = useState([])
  const [pickerOpen, setPickerOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [statusRes, mapRes, ticketRes] = await Promise.all([
        api.get('/flowlu/status'),
        api.get('/flowlu/mapping'),
        api.get('/flowlu/tickets'),
      ])
      setStatus(statusRes.data?.data || null)
      setMembers(mapRes.data?.data?.members || [])
      setFlowluUsers(mapRes.data?.data?.flowluUsers || [])
      setTickets(ticketRes.data?.data || [])
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not load BMS')
    } finally {
      setLoading(false)
    }
  }, [message])

  useEffect(() => {
    load()
  }, [load])

  const run = async (key, requests) => {
    setBusy(key)
    try {
      for (const [path, label] of requests) {
        const res = await api.post(path)
        message.success(res.data?.message || `${label} done`)
      }
    } catch (err) {
      message.error(err?.response?.data?.message || 'BMS request failed')
    } finally {
      setBusy('')
      await load()
    }
  }

  const runRetry = async () => {
    setBusy('retry')
    try {
      const res = await api.post('/flowlu/retry-logs', { scope: 'all' })
      message.success(res.data?.message || 'Retried')
    } catch (err) {
      message.error(err?.response?.data?.message || 'Retry failed')
    } finally {
      setBusy('')
      await load()
    }
  }

  const moveTicket = async (ticket, stageId) => {
    setSavingId(ticket.id)
    try {
      const res = await api.put(`/flowlu/tickets/${ticket.source}/${ticket.flowluId}/stage`, { stageId })
      message.success(res.data?.message || 'Stage updated')
      await load()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not move the ticket')
    } finally {
      setSavingId('')
    }
  }

  const saveMapping = async (member, body) => {
    setSavingId(String(member._id))
    try {
      const res = await api.put(`/flowlu/mapping/${member._id}`, body)
      message.success(res.data?.message || 'Saved')
      await load()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not save mapping')
    } finally {
      setSavingId('')
    }
  }

  const linkedTo = useMemo(() => {
    const map = new Map()
    members.forEach((m) => {
      if (m.flowluUserId != null) map.set(m.flowluUserId, m)
    })
    return map
  }, [members])

  const unmappedFlowlu = useMemo(
    () => flowluUsers.filter((u) => !linkedTo.has(u.flowluId)),
    [flowluUsers, linkedTo],
  )

  const optionsFor = (member) => [
    { value: 'none', label: 'Not linked' },
    ...flowluUsers.map((u) => {
      const owner = linkedTo.get(u.flowluId)
      const takenByOther = owner && String(owner._id) !== String(member._id)
      return {
        value: u.flowluId,
        label: `${u.name || 'Unnamed'} · ${u.email || 'no login email'}${takenByOther ? ` (linked to ${owner.name})` : ''}`,
        disabled: Boolean(takenByOther),
      }
    }),
  ]

  const memberColumns = [
    {
      title: 'BDA OS person',
      key: 'person',
      render: (_, m) => (
        <div className="pulse-bms-person">
          <strong>{m.name}</strong>
          <span>{m.email}</span>
        </div>
      ),
    },
    {
      title: 'BMS user',
      key: 'flowlu',
      width: '44%',
      render: (_, m) => (
        <Select
          className="pulse-bms-select"
          showSearch
          optionFilterProp="label"
          placeholder="Pick BMS user"
          value={m.flowluUserId ?? (m.linkSource === 'manual' ? 'none' : undefined)}
          options={optionsFor(m)}
          loading={savingId === String(m._id)}
          disabled={!flowluUsers.length || savingId === String(m._id)}
          onChange={(value) => saveMapping(m, { flowluUserId: value === 'none' ? null : value })}
        />
      ),
    },
    {
      title: 'Match',
      key: 'status',
      width: 150,
      render: (_, m) => {
        const tag = STATUS_TAG[m.status] || STATUS_TAG.unlinked
        return <Tag color={tag.color}>{tag.label}</Tag>
      },
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      align: 'right',
      render: (_, m) => (m.linkSource === 'manual' ? (
        <Tooltip title="Drop the manual link and match by email again">
          <Button type="link" size="small" onClick={() => saveMapping(m, { auto: true })}>
            Use email match
          </Button>
        </Tooltip>
      ) : null),
    },
  ]

  const ticketColumns = [
    { title: 'Key', dataIndex: 'key', width: 90, render: (key, t) => <Tag color={t.source === 'agile' ? 'purple' : 'cyan'}>{key}</Tag> },
    { title: 'Title', dataIndex: 'name', ellipsis: true },
    { title: 'Project', dataIndex: 'projectName', ellipsis: true, width: 170 },
    { title: 'Sprint', dataIndex: 'sprintName', width: 150, render: (v) => v || '—' },
    {
      title: 'Stage',
      dataIndex: 'stageName',
      width: 190,
      render: (v, t) => (t.stageOptions?.length ? (
        <Select
          size="small"
          className="pulse-bms-stage"
          value={t.stageId || undefined}
          placeholder={v || 'Stage'}
          loading={savingId === t.id}
          disabled={Boolean(savingId)}
          popupMatchSelectWidth={false}
          options={t.stageOptions.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(stageId) => moveTicket(t, stageId)}
        />
      ) : v || '—'),
    },
    {
      title: 'Assignee',
      key: 'assignee',
      width: 190,
      render: (_, t) => {
        if (!t.assignee) return '—'
        if (t.assignee.memberName) return t.assignee.memberName
        return (
          <span className="pulse-bms-unlinked">
            {t.assignee.flowluName} <Tag>not linked</Tag>
          </span>
        )
      },
    },
  ]

  const s = status || {}
  const ticketTotal = (s.tickets?.agile || 0) + (s.tickets?.task || 0)
  const selectedProjects = s.selectedProjects || []

  return (
    <div className="pulse-att-page pulse-apps-att pulse-bms">
      <div className="pulse-att-board">
        <section className="pulse-att-panel" aria-label="BMS">
          <div className="pulse-att-panel-chrome">
            <header className="pulse-att-panel-head">
              <h4>BMS</h4>
              <span>{s.host ? `Flowlu · ${s.host}` : 'Flowlu sync'}</span>
            </header>
          </div>

          <div className="pulse-apps-att-body">
            <div className="pulse-apps-assign-well pulse-bms-well">
              {status && !s.configured ? (
                <Alert
                  type="warning"
                  showIcon
                  message="BMS is not configured"
                  description="Set FLOWLU_DOMAIN and FLOWLU_API_KEY in the backend environment."
                />
              ) : null}
              {s.lastError ? (
                <Alert
                  type="error"
                  showIcon
                  className="pulse-bms-error"
                  message={`Last sync error ${ago(s.lastErrorAt)}`}
                  description={s.lastError}
                />
              ) : null}

              <div className="pulse-bms-stats">
                <Stat label="People linked" value={`${s.linkedCount || 0} / ${s.memberCount || 0}`} hint={`${unmappedFlowlu.length} BMS users unlinked`} />
                <Stat label="BMS users" value={s.flowluUserCount || 0} hint={`synced ${ago(s.usersSyncedAt)}`} />
                <Stat label="Tickets" value={ticketTotal} hint={`${s.tickets?.agile || 0} issues · ${s.tickets?.task || 0} tasks`} />
                <Stat label="Projects" value={selectedProjects.length} hint={`synced ${ago(s.ticketsSyncedAt)}`} />
              </div>

              <div className="pulse-bms-actions">
                <Button icon={<PlugZap size={15} />} loading={busy === 'test'} disabled={Boolean(busy)} onClick={() => run('test', [['/flowlu/test', 'Connection test']])}>
                  Test connection
                </Button>
                <Button icon={<Users size={15} />} loading={busy === 'users'} disabled={Boolean(busy)} onClick={() => run('users', [['/flowlu/sync/users', 'User sync']])}>
                  Sync users &amp; auto-match
                </Button>
                <Button icon={<Ticket size={15} />} loading={busy === 'tickets'} disabled={Boolean(busy)} onClick={() => run('tickets', [['/flowlu/sync/tickets', 'Ticket sync']])}>
                  Sync tickets
                </Button>
                {s.pendingLogs ? (
                  <Button danger loading={busy === 'retry'} disabled={Boolean(busy)} onClick={() => runRetry()}>
                    Retry failed logs ({s.pendingLogs})
                  </Button>
                ) : null}
                <button
                  type="button"
                  className="pov-cta plive-top-cta plive-checkin"
                  disabled={Boolean(busy)}
                  onClick={() => run('all', [['/flowlu/sync/users', 'User sync'], ['/flowlu/sync/tickets', 'Ticket sync']])}
                >
                  <RefreshCw size={15} className={busy === 'all' ? 'pulse-bms-spin' : undefined} />
                  {busy === 'all' ? 'Syncing…' : 'Sync all'}
                </button>
              </div>
              <div className="pulse-bms-projects">
                <span>
                  {selectedProjects.length
                    ? `Syncing: ${selectedProjects.map(projectLabel).join(' · ')}`
                    : 'No projects selected yet.'}
                </span>
                <Button size="small" icon={<FolderKanban size={14} />} disabled={Boolean(busy)} onClick={() => setPickerOpen(true)}>
                  Choose projects
                </Button>
              </div>
              <ProjectPicker
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onSaved={(count) => {
                  setPickerOpen(false)
                  if (count) run('tickets', [['/flowlu/sync/tickets', 'Ticket sync']])
                  else load()
                }}
              />
            </div>

            <div className="pulse-bms-tabs">
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: 'people', label: `People mapping (${members.length})` },
                  { value: 'tickets', label: `Tickets (${tickets.length})` },
                ]}
              />
            </div>

            <div className="pulse-apps-table-wrap">
              {view === 'people' ? (
                <>
                  <Table
                    size="middle"
                    rowKey="_id"
                    loading={loading}
                    pagination={false}
                    columns={memberColumns}
                    dataSource={members}
                    locale={{
                      emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No people in this organization yet." />,
                    }}
                  />
                  {!flowluUsers.length && !loading ? (
                    <p className="pulse-bms-note">Run “Sync users &amp; auto-match” to load BMS users for the dropdowns.</p>
                  ) : null}
                  {unmappedFlowlu.length ? (
                    <div className="pulse-bms-leftover">
                      <span>BMS users not linked to anyone:</span>
                      {unmappedFlowlu.map((u) => (
                        <Tag key={u.flowluId}>{u.name || u.email}</Tag>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <Table
                  size="middle"
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 25, hideOnSinglePage: true }}
                  columns={ticketColumns}
                  dataSource={tickets}
                  locale={{
                    emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tickets yet. Run “Sync tickets”." />,
                  }}
                />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
