import { useEffect, useMemo, useState } from 'react'
import { format, parse } from 'date-fns'
import {
  App,
  Button,
  DatePicker,
  Drawer,
  Input,
  InputNumber,
  Modal,
  Select,
} from 'antd'
import PulseSlideClose from './PulseSlideClose'
import dayjs from 'dayjs'
import api from '../api'
import {
  AREA_KEYS,
  AREA_SHORT,
  PROJECT_TIER_OPTIONS,
  formatInr,
  monthKey,
  previewCompensation,
  snapScore,
  snapScores,
  statusTone,
} from '../utils/pulsePerformanceCalc'
import PulseFileTypeIcon from './PulseFileTypeIcon'
import PulseRangeSlider from './PulseRangeSlider'
import PulseSwitch from './PulseSwitch'
import { pulseToast } from '../utils/pulseToast'
import { namesMatch, personName } from '../utils/pulsePerson'
import './pulse-performance.css'

function monthLabel(month) {
  try {
    return format(parse(`${month}-01`, 'yyyy-MM-dd', new Date()), 'MMMM yyyy')
  } catch {
    return month
  }
}

function rowStatusLabel(row) {
  if (row.status === 'locked') return 'Locked'
  if (row.correctionRequested) return 'Correction'
  return row.performanceStatus || '-'
}

function statusChipClass(row) {
  if (row.status === 'locked') return 'is-locked'
  if (row.correctionRequested) return 'is-leave'
  return statusTone(row.performanceStatus)
}

const emptyScores = () =>
  AREA_KEYS.reduce((acc, key) => {
    acc[key] = 0
    return acc
  }, {})

export default function PulsePerformanceAdmin() {
  const { message } = App.useApp()
  const [month, setMonth] = useState(() => monthKey())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [unlockName, setUnlockName] = useState('')

  const closeDrawer = () => {
    setSelected(null)
    setDraft(null)
    setUnlockOpen(false)
    setUnlockName('')
  }

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/pulse-performance/admin/month', { params: { month } })
      setRows(res.data?.data || [])
    } catch (err) {
      setRows([])
      const status = err?.response?.status
      message.error(
        status === 403
          ? 'Admin access required'
          : err?.response?.data?.message || 'Could not load team',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  const openEdit = (row) => {
    setSelected(row)
    setDraft({
      scores: snapScores({ ...emptyScores(), ...(row.scores || {}) }),
      fixedPay: Number(row.fixedPay) || 0,
      projectTier: row.projectTier || 'Core',
      projectApproved: Boolean(row.projectApproved),
      learningApproved: Boolean(row.learningApproved),
      innovationApproved: Boolean(row.innovationApproved),
      managerNote: row.managerNote || '',
      status: row.status === 'locked' ? 'locked' : row.status || 'draft',
      resolveCorrection: false,
    })
  }

  const save = async () => {
    if (!selected || !draft || draft.status === 'locked') return
    setSaving(true)
    try {
      const res = await api.put(`/pulse-performance/admin/${selected.user}`, {
        month,
        scores: snapScores(draft.scores),
        fixedPay: draft.fixedPay,
        projectTier: draft.projectTier,
        projectApproved: draft.projectApproved,
        learningApproved: draft.learningApproved,
        innovationApproved: draft.innovationApproved,
        managerNote: draft.managerNote,
        status: draft.status === 'locked' ? 'confirmed' : draft.status,
        resolveCorrection: draft.resolveCorrection,
      })
      const next = res.data?.data
      setRows((prev) => prev.map((row) => (row.user === next.user ? next : row)))
      setSelected(next)
      setDraft({
        scores: snapScores({ ...emptyScores(), ...(next.scores || {}) }),
        fixedPay: Number(next.fixedPay) || 0,
        projectTier: next.projectTier || 'Core',
        projectApproved: Boolean(next.projectApproved),
        learningApproved: Boolean(next.learningApproved),
        innovationApproved: Boolean(next.innovationApproved),
        managerNote: next.managerNote || '',
        status: next.status === 'locked' ? 'locked' : next.status || 'draft',
        resolveCorrection: false,
      })
      message.success('Saved')
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const lockMonth = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const res = await api.post(`/pulse-performance/admin/${selected.user}/lock`, { month })
      const next = res.data?.data
      setRows((prev) => prev.map((row) => (row.user === next.user ? next : row)))
      setSelected(next)
      setDraft((prev) => (prev ? { ...prev, status: 'locked' } : prev))
      pulseToast.success('Locked', 'Payslip ready')
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not lock')
    } finally {
      setSaving(false)
    }
  }

  const applyUnlocked = (next) => {
    if (!next) return
    setRows((prev) => prev.map((row) => (String(row.user) === String(next.user) ? { ...row, ...next } : row)))
    setSelected((prev) => (prev && String(prev.user) === String(next.user) ? { ...prev, ...next } : prev))
    setDraft((prev) => (prev ? { ...prev, status: 'confirmed' } : prev))
  }

  const unlockMonth = async () => {
    if (!selected || !namesMatch(unlockName, selected)) return
    setSaving(true)
    try {
      const res = await api.post(`/pulse-performance/admin/${selected.user}/unlock`, {
        month,
        confirmName: unlockName.trim(),
      })
      applyUnlocked(res.data?.data)
      setUnlockOpen(false)
      setUnlockName('')
      pulseToast.success('Unlocked', 'You can edit scores again')
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not unlock')
    } finally {
      setSaving(false)
    }
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0))
  }, [rows])

  const locked = draft?.status === 'locked' || selected?.status === 'locked'
  const preview = draft ? previewCompensation(draft) : null
  const peopleCount = sorted.length
  const unlockExpected = selected ? personName(selected) : ''
  const unlockMatches = Boolean(selected && namesMatch(unlockName, selected))

  return (
    <div className="pulse-att-page pulse-org-admin-att pulse-perf-admin-att">
      <div className="pulse-att-board">
        <header className="pulse-att-toolbar">
          <div className="pulse-att-period">
            <DatePicker
              picker="month"
              value={dayjs(`${month}-01`)}
              allowClear={false}
              format="MMM YYYY"
              className="pulse-att-range"
              classNames={{ popup: { root: 'pulse-att-range-dropdown' } }}
              disabledDate={(value) => value && value.isAfter(dayjs(), 'month')}
              onChange={(next) => {
                if (next) setMonth(next.format('YYYY-MM'))
              }}
              aria-label="Performance month"
            />
          </div>
          <div className="pulse-org-admin-actions" />
        </header>

        <section className="pulse-att-panel" aria-label="Performance team">
          <div className="pulse-att-panel-chrome">
            <header className="pulse-att-panel-head">
              <h4>Performance · {monthLabel(month)}</h4>
              <span>
                {loading ? 'Loading…' : `${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}`}
              </span>
            </header>
            <div className="pulse-att-cols pulse-org-admin-cols pulse-perf-admin-cols" aria-hidden="true">
              <span className="pulse-att-cols-spacer" />
              <span>Person</span>
              <span>Score</span>
              <span>Variable</span>
              <span>Status</span>
            </div>
          </div>

          <div className="pulse-org-admin-body">
            {loading && !sorted.length ? (
              <p className="pulse-org-admin-empty">Loading…</p>
            ) : !sorted.length ? (
              <p className="pulse-org-admin-empty">
                No team members yet. Invite people, then enter and lock Performance scores.
              </p>
            ) : (
              <ul className="pulse-att-list" aria-label="Performance people">
                {sorted.map((row) => {
                  const chip = statusChipClass(row)
                  const tone = chip.replace(/^is-/, '')
                  const label = rowStatusLabel(row)
                  return (
                    <li
                      key={String(row.user || row.email)}
                      className={`pulse-att-row pulse-org-admin-row pulse-perf-admin-row is-clickable is-${tone}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEdit(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openEdit(row)
                        }
                      }}
                    >
                      <span className={`pulse-att-dot is-${tone}`} aria-hidden="true" />
                      <div className="pulse-att-day">
                        <strong>{personName(row)}</strong>
                        <span>{row.email || '-'}</span>
                      </div>
                      <div className="pulse-att-hours">{row.weightedScore ?? 0}</div>
                      <div className="pulse-perf-admin-var">{formatInr(row.totalBonus)}</div>
                      <span className={`pulse-att-status ${chip}`}>{label}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <Drawer
        title={selected ? personName(selected) : 'Performance'}
        placement="right"
        width={720}
        open={Boolean(selected && draft)}
        onClose={closeDrawer}
        destroyOnHidden
        rootClassName="pulse-perf-edit-drawer"
        zIndex={1195}
        closable={false}
        styles={{
          mask: { boxShadow: 'none' },
          wrapper: { boxShadow: 'none' },
          content: { boxShadow: 'none' },
        }}
        footer={
          <div className="pulse-perf-drawer-footer">
            <Button type="primary" className="pulse-perf-cta" loading={saving} disabled={locked} onClick={save}>
              Save
            </Button>
            {locked ? (
              <Button
                type="primary"
                className="pulse-perf-cta"
                disabled={saving}
                onClick={() => {
                  setUnlockName('')
                  setUnlockOpen(true)
                }}
              >
                Unlock
              </Button>
            ) : (
              <Button danger disabled={saving} onClick={lockMonth}>
                Lock
              </Button>
            )}
          </div>
        }
      >
        {draft ? (
          <div className="pulse-perf-edit">
            <div className="pulse-perf-edit-head">
              <strong>{preview?.weightedScore ?? 0}</strong>
              <span className={`pulse-perf-status ${locked ? 'is-locked' : statusTone(preview?.performanceStatus)}`}>
                {locked ? 'Locked' : preview?.performanceStatus}
              </span>
              <em>{formatInr(preview?.totalBonus)}</em>
            </div>

            <div className="pulse-perf-sliders">
              {AREA_KEYS.map((key) => (
                <div key={key} className="pulse-perf-slider">
                  <span>
                    {AREA_SHORT[key]}
                    <em>{draft.scores[key] ?? 0}</em>
                  </span>
                  <PulseRangeSlider
                    min={0}
                    max={100}
                    step={25}
                    showTicks
                    disabled={locked}
                    value={snapScore(draft.scores[key] ?? 0)}
                    aria-label={AREA_SHORT[key]}
                    onValueChange={(value) =>
                      setDraft((prev) => ({
                        ...prev,
                        scores: { ...prev.scores, [key]: snapScore(value) },
                      }))
                    }
                  />
                </div>
              ))}
            </div>

            <div className="pulse-perf-edit-row">
              <label className="pulse-perf-field">
                <span className="pulse-perf-field-label">Fixed pay</span>
                <InputNumber
                  min={0}
                  disabled={locked}
                  value={draft.fixedPay}
                  onChange={(value) => setDraft((prev) => ({ ...prev, fixedPay: Number(value) || 0 }))}
                  className="pulse-perf-input"
                  placeholder="0"
                />
              </label>
              <label className="pulse-perf-field">
                <span className="pulse-perf-field-label">Project tier</span>
                <Select
                  value={draft.projectTier}
                  disabled={locked}
                  options={PROJECT_TIER_OPTIONS}
                  onChange={(value) => setDraft((prev) => ({ ...prev, projectTier: value }))}
                  className="pulse-perf-select"
                  classNames={{ popup: { root: 'pulse-att-select-dropdown' } }}
                  aria-label="Project tier"
                />
              </label>
              <label className="pulse-perf-field">
                <span className="pulse-perf-field-label">Status</span>
                <Select
                  value={locked ? 'locked' : draft.status}
                  disabled={locked}
                  options={[
                    { value: 'draft', label: 'Draft' },
                    { value: 'review', label: 'Review' },
                    { value: 'confirmed', label: 'Confirmed' },
                    { value: 'locked', label: 'Locked', disabled: true },
                  ]}
                  onChange={(value) => setDraft((prev) => ({ ...prev, status: value }))}
                  className="pulse-perf-select"
                  classNames={{ popup: { root: 'pulse-att-select-dropdown' } }}
                  aria-label="Status"
                />
              </label>
            </div>

            <div className="pulse-perf-toggles">
              <PulseSwitch
                label="Project"
                checked={draft.projectApproved}
                disabled={locked}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, projectApproved: checked }))}
              />
              <PulseSwitch
                label="Learning"
                checked={draft.learningApproved}
                disabled={locked}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, learningApproved: checked }))}
              />
              <PulseSwitch
                label="Innovation"
                checked={draft.innovationApproved}
                disabled={locked}
                onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, innovationApproved: checked }))}
              />
              {selected?.correctionRequested ? (
                <PulseSwitch
                  label="Resolve"
                  checked={draft.resolveCorrection}
                  disabled={locked}
                  onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, resolveCorrection: checked }))}
                />
              ) : null}
            </div>

            <Input.TextArea
              rows={2}
              maxLength={2000}
              disabled={locked}
              value={draft.managerNote}
              onChange={(e) => setDraft((prev) => ({ ...prev, managerNote: e.target.value }))}
              placeholder="Note"
              className="pulse-perf-note-input"
            />

            {selected?.correctionNote || selected?.correctionAttachment?.name ? (
              <div className="pulse-perf-correction-read">
                {selected.correctionNote ? (
                  <p className="pulse-perf-note">{selected.correctionNote}</p>
                ) : null}
                {selected.correctionAttachment?.name ? (
                  selected.correctionAttachment.url ? (
                    <a
                      className="pulse-perf-correction-file"
                      href={selected.correctionAttachment.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <PulseFileTypeIcon row={selected.correctionAttachment} size={20} />
                      <span>{selected.correctionAttachment.name}</span>
                    </a>
                  ) : (
                    <span className="pulse-perf-correction-file">
                      <PulseFileTypeIcon row={selected.correctionAttachment} size={20} />
                      <span>{selected.correctionAttachment.name}</span>
                    </span>
                  )
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
      <PulseSlideClose open={Boolean(selected && draft)} onClose={closeDrawer} width={720} top={76} />

      <Modal
        title={null}
        open={unlockOpen}
        onCancel={() => {
          if (saving) return
          setUnlockOpen(false)
          setUnlockName('')
        }}
        footer={null}
        destroyOnHidden
        centered
        width={420}
        zIndex={1200}
        className="pulse-people-confirm pulse-perf-unlock-confirm"
        styles={{ body: { padding: 0 } }}
      >
        <div className="pulse-people-confirm-body">
          <header className="pulse-people-confirm-head">
            <div>
              <p className="pulse-people-confirm-kicker">Unlock performance</p>
              <h3 className="pulse-people-confirm-name">{unlockExpected || 'Employee'}</h3>
            </div>
            <button
              type="button"
              className="pulse-people-confirm-close"
              aria-label="Close"
              disabled={saving}
              onClick={() => {
                setUnlockOpen(false)
                setUnlockName('')
              }}
            >
              ×
            </button>
          </header>

          <div className="pulse-people-confirm-shift" aria-label="From Locked to Unlocked">
            <div className="pulse-people-confirm-role is-from">
              <span>From</span>
              <strong>Locked</strong>
            </div>
            <span className="pulse-people-confirm-arrow" aria-hidden="true">
              →
            </span>
            <div className="pulse-people-confirm-role is-to is-member">
              <span>To</span>
              <strong>Unlocked</strong>
            </div>
          </div>

          <label className="pulse-people-confirm-label" htmlFor="pulse-perf-unlock-input">
            Type <b>{unlockExpected}</b> to unlock
          </label>
          <Input
            id="pulse-perf-unlock-input"
            autoFocus
            size="large"
            value={unlockName}
            status={unlockName && !unlockMatches ? 'error' : undefined}
            placeholder={unlockExpected}
            className={`pulse-people-confirm-input${unlockMatches ? ' is-ready' : ''}`}
            onChange={(e) => setUnlockName(e.target.value)}
            onPressEnter={() => {
              if (unlockMatches) unlockMonth()
            }}
          />
          {unlockName && !unlockMatches ? (
            <p className="pulse-people-confirm-hint is-error">Name doesn’t match yet</p>
          ) : unlockMatches ? (
            <p className="pulse-people-confirm-hint is-ok">Ready to unlock</p>
          ) : null}

          <footer className="pulse-people-confirm-actions">
            <Button
              disabled={saving}
              onClick={() => {
                setUnlockOpen(false)
                setUnlockName('')
              }}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              className="pulse-perf-cta"
              loading={saving}
              disabled={!unlockMatches}
              onClick={unlockMonth}
            >
              Unlock
            </Button>
          </footer>
        </div>
      </Modal>
    </div>
  )
}
