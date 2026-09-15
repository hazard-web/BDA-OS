import { useEffect, useMemo, useState } from 'react'
import { format, parse } from 'date-fns'
import {
  App,
  Button,
  DatePicker,
  Empty,
  Input,
  InputNumber,
  Modal,
  Select,
  Switch,
  Slider,
} from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api'
import {
  AREA_KEYS,
  AREA_SHORT,
  PROJECT_TIER_OPTIONS,
  formatInr,
  monthKey,
  previewCompensation,
  statusTone,
} from '../utils/pulsePerformanceCalc'
import './pulse-performance.css'

function monthLabel(month) {
  try {
    return format(parse(`${month}-01`, 'yyyy-MM-dd', new Date()), 'MMMM yyyy')
  } catch {
    return month
  }
}

function personName(row) {
  return row.name || String(row.email || '').split('@')[0] || 'Employee'
}

function personInitial(row) {
  return personName(row).trim().charAt(0).toUpperCase() || 'E'
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
      scores: { ...emptyScores(), ...(row.scores || {}) },
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
        scores: draft.scores,
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
        scores: { ...emptyScores(), ...(next.scores || {}) },
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
      message.success('Locked · payslip ready')
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not lock')
    } finally {
      setSaving(false)
    }
  }

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0)),
    [rows],
  )

  const locked = draft?.status === 'locked' || selected?.status === 'locked'
  const preview = draft ? previewCompensation(draft) : null

  return (
    <div className="pulse-ts-admin pulse-perf-admin">
      <header className="pulse-ts-admin-head">
        <h2>{monthLabel(month)}</h2>
        <div className="pulse-ts-admin-filter">
          <DatePicker
            picker="month"
            value={dayjs(`${month}-01`)}
            allowClear={false}
            format="MMM YYYY"
            className="pulse-ts-admin-date"
            classNames={{ popup: { root: 'pulse-att-range-dropdown' } }}
            disabledDate={(value) => value && value.isAfter(dayjs(), 'month')}
            onChange={(next) => {
              if (next) setMonth(next.format('YYYY-MM'))
            }}
          />
          <Button type="text" icon={<ReloadOutlined />} onClick={load} loading={loading} aria-label="Refresh" />
        </div>
      </header>

      {loading && !rows.length ? <p className="pulse-ts-admin-empty">Loading…</p> : null}

      {!loading && !rows.length ? (
        <div className="pov-glass pulse-ts-person">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No employees yet" />
        </div>
      ) : null}

      <div className="pulse-ts-admin-grid">
        {sorted.map((row) => (
          <button
            key={String(row.user || row.email)}
            type="button"
            className="pov-glass pulse-ts-person is-clickable pulse-perf-card"
            onClick={() => openEdit(row)}
          >
            <header className="pulse-ts-person-head">
              {row.avatarUrl ? (
                <img className="pulse-ts-person-avatar" src={row.avatarUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="pulse-ts-person-avatar is-fallback" aria-hidden="true">{personInitial(row)}</span>
              )}
              <div>
                <h3>{personName(row)}</h3>
                <p>{row.email || '—'}</p>
              </div>
              <span className={`pulse-ts-person-tag${row.status === 'locked' || row.correctionRequested ? ' is-on' : ''}`}>
                {row.status === 'locked' ? 'Locked' : row.correctionRequested ? 'Correction' : row.performanceStatus || '—'}
              </span>
            </header>

            <div className="pulse-ts-person-metrics">
              <div>
                <p>Score</p>
                <strong>{row.weightedScore ?? 0}</strong>
              </div>
              <div>
                <p>Variable</p>
                <strong>{formatInr(row.totalBonus)}</strong>
              </div>
            </div>
          </button>
        ))}
      </div>

      <Modal
        title={selected ? personName(selected) : 'Performance'}
        open={Boolean(selected && draft)}
        onCancel={() => {
          setSelected(null)
          setDraft(null)
        }}
        width={520}
        footer={[
          <Button
            key="close"
            onClick={() => {
              setSelected(null)
              setDraft(null)
            }}
          >
            Close
          </Button>,
          <Button key="lock" danger disabled={locked || saving} onClick={lockMonth}>
            Lock
          </Button>,
          <Button key="save" type="primary" className="pulse-perf-cta" loading={saving} disabled={locked} onClick={save}>
            Save
          </Button>,
        ]}
        destroyOnClose
      >
        {draft ? (
          <div className="pulse-perf-edit">
            <div className="pulse-perf-edit-head">
              <strong>{preview?.weightedScore ?? 0}</strong>
              <span className={`pulse-perf-status ${statusTone(preview?.performanceStatus)}`}>
                {preview?.performanceStatus}
              </span>
              <em>{formatInr(preview?.totalBonus)}</em>
            </div>

            <div className="pulse-perf-sliders">
              {AREA_KEYS.map((key) => (
                <label key={key} className="pulse-perf-slider">
                  <span>
                    {AREA_SHORT[key]}
                    <em>{draft.scores[key] ?? 0}</em>
                  </span>
                  <Slider
                    min={0}
                    max={100}
                    disabled={locked}
                    value={draft.scores[key] ?? 0}
                    onChange={(value) =>
                      setDraft((prev) => ({
                        ...prev,
                        scores: { ...prev.scores, [key]: value },
                      }))
                    }
                  />
                </label>
              ))}
            </div>

            <div className="pulse-perf-edit-row">
              <InputNumber
                min={0}
                disabled={locked}
                value={draft.fixedPay}
                onChange={(value) => setDraft((prev) => ({ ...prev, fixedPay: Number(value) || 0 }))}
                className="pulse-perf-input"
                placeholder="Fixed pay"
              />
              <Select
                value={draft.projectTier}
                disabled={locked}
                options={PROJECT_TIER_OPTIONS}
                onChange={(value) => setDraft((prev) => ({ ...prev, projectTier: value }))}
                className="pulse-perf-select"
                classNames={{ popup: { root: 'pulse-att-select-dropdown' } }}
                aria-label="Project tier"
              />
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
            </div>

            <div className="pulse-perf-toggles">
              <label>
                <span>Project</span>
                <Switch
                  size="small"
                  checked={draft.projectApproved}
                  disabled={locked}
                  onChange={(checked) => setDraft((prev) => ({ ...prev, projectApproved: checked }))}
                />
              </label>
              <label>
                <span>Learning</span>
                <Switch
                  size="small"
                  checked={draft.learningApproved}
                  disabled={locked}
                  onChange={(checked) => setDraft((prev) => ({ ...prev, learningApproved: checked }))}
                />
              </label>
              <label>
                <span>Innovation</span>
                <Switch
                  size="small"
                  checked={draft.innovationApproved}
                  disabled={locked}
                  onChange={(checked) => setDraft((prev) => ({ ...prev, innovationApproved: checked }))}
                />
              </label>
              {selected?.correctionRequested ? (
                <label>
                  <span>Resolve</span>
                  <Switch
                    size="small"
                    checked={draft.resolveCorrection}
                    disabled={locked}
                    onChange={(checked) => setDraft((prev) => ({ ...prev, resolveCorrection: checked }))}
                  />
                </label>
              ) : null}
            </div>

            <Input.TextArea
              rows={2}
              maxLength={2000}
              disabled={locked}
              value={draft.managerNote}
              onChange={(e) => setDraft((prev) => ({ ...prev, managerNote: e.target.value }))}
              placeholder="Note"
            />

            {selected?.correctionNote ? (
              <p className="pulse-perf-note">{selected.correctionNote}</p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
