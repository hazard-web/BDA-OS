import { useEffect, useState } from 'react'
import { format, parse } from 'date-fns'
import { App, Button, DatePicker, Empty, Input, Modal } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api'
import {
  AREA_KEYS,
  AREA_SHORT,
  formatInr,
  monthKey,
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

export default function PulsePerformance() {
  const { message } = App.useApp()
  const [month, setMonth] = useState(() => monthKey())
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [correctionNote, setCorrectionNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/pulse-performance/me', { params: { month } })
      setRow(res.data?.data || null)
    } catch (err) {
      setRow(null)
      message.error(err?.response?.data?.message || 'Could not load performance')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  const submitCorrection = async () => {
    const note = correctionNote.trim()
    if (!note) {
      message.warning('Add evidence')
      return
    }
    setSaving(true)
    try {
      const res = await api.post('/pulse-performance/me/correction', { month, note })
      setRow(res.data?.data || null)
      setCorrectionOpen(false)
      setCorrectionNote('')
      message.success('Requested')
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not submit')
    } finally {
      setSaving(false)
    }
  }

  const locked = row?.status === 'locked'
  const canCorrect = row && !locked && !row.correctionRequested
  const scores = row?.scores || {}

  return (
    <div className="pulse-perf-page pulse-ts-page">
      <div className="pov-app pov-app-bare">
        <div className="pov-app-body">
          <header className="pov-top pulse-perf-topbar">
            <h2 className="pulse-perf-month">{monthLabel(month)}</h2>
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
              {canCorrect ? (
                <button
                  type="button"
                  className="pov-cta plive-top-cta plive-checkin"
                  onClick={() => setCorrectionOpen(true)}
                >
                  Correction
                </button>
              ) : null}
            </div>
          </header>

          {loading && !row ? <p className="pulse-ts-admin-empty">Loading…</p> : null}

          {!loading && !row ? (
            <div className="pov-glass pov-tasks">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing here yet" />
            </div>
          ) : null}

          {row ? (
            <>
              <div className="plive-metrics pulse-perf-metrics">
                <article className="pov-glass plive-metric pulse-perf-score-tile">
                  <p>Score</p>
                  <strong>{row.weightedScore ?? 0}</strong>
                  <span className={`pulse-perf-status ${statusTone(row.performanceStatus)}`}>
                    {row.performanceStatus || '—'}
                  </span>
                </article>
                <article className="pov-glass plive-metric">
                  <p>Performance</p>
                  <strong>{formatInr(row.performanceBonus)}</strong>
                  <span>Bonus</span>
                </article>
                <article className="pov-glass plive-metric">
                  <p>Project</p>
                  <strong>{formatInr(row.projectBonus)}</strong>
                  <span>{row.projectTier || 'Core'}</span>
                </article>
                <article className="pov-glass plive-metric">
                  <p>Extras</p>
                  <strong>{formatInr((row.learningBonus || 0) + (row.innovationBonus || 0))}</strong>
                  <span>Learn + innovate</span>
                </article>
                <article className="pov-glass plive-metric">
                  <p>Total</p>
                  <strong>{formatInr(row.totalBonus)}</strong>
                  <span>Variable</span>
                </article>
              </div>

              <section className="pov-glass pov-tasks pulse-perf-board">
                <div className="pov-group-head">
                  <h4>Areas</h4>
                  <span>{row.status === 'locked' ? 'Locked' : 'This month'}</span>
                </div>
                <ul className="pulse-perf-areas">
                  {AREA_KEYS.map((key) => {
                    const value = Number(scores[key]) || 0
                    return (
                      <li key={key}>
                        <span className="pulse-perf-area-name">{AREA_SHORT[key]}</span>
                        <span className="pulse-perf-bar" aria-hidden="true">
                          <i style={{ width: `${Math.min(100, value)}%` }} />
                        </span>
                        <em>{value}</em>
                      </li>
                    )
                  })}
                </ul>
                {row.managerNote ? <p className="pulse-perf-note">{row.managerNote}</p> : null}
              </section>
            </>
          ) : null}
        </div>
      </div>

      <Modal
        title="Correction"
        open={correctionOpen}
        onCancel={() => setCorrectionOpen(false)}
        onOk={submitCorrection}
        okText="Submit"
        confirmLoading={saving}
        destroyOnClose
      >
        <Input.TextArea
          rows={4}
          maxLength={2000}
          value={correctionNote}
          onChange={(e) => setCorrectionNote(e.target.value)}
          placeholder="Evidence"
        />
      </Modal>
    </div>
  )
}
