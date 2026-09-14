import { useEffect, useMemo, useState } from 'react'
import { format, parse } from 'date-fns'
import { App, Button, DatePicker, Empty, Input, Modal, Progress, Slider } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api'
import {
  AREA_KEYS,
  AREA_LABELS,
  AREA_WEIGHTS,
  PERFORMANCE_TIERS,
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

  const scoreBars = useMemo(() => {
    const scores = row?.scores || {}
    return AREA_KEYS.map((key) => ({
      key,
      label: AREA_LABELS[key],
      weight: AREA_WEIGHTS[key],
      value: Number(scores[key]) || 0,
    }))
  }, [row])

  const submitCorrection = async () => {
    const note = correctionNote.trim()
    if (!note) {
      message.warning('Add evidence for your correction request')
      return
    }
    setSaving(true)
    try {
      const res = await api.post('/pulse-performance/me/correction', { month, note })
      setRow(res.data?.data || null)
      setCorrectionOpen(false)
      setCorrectionNote('')
      message.success('Correction requested')
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not submit correction')
    } finally {
      setSaving(false)
    }
  }

  const locked = row?.status === 'locked'
  const canCorrect = row && !locked && !row.correctionRequested

  return (
    <div className="pulse-perf-page">
      <header className="pulse-ts-admin-head">
        <div>
          <p className="pov-kicker">My performance</p>
          <h2>{monthLabel(month)}</h2>
        </div>
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

      {loading && !row ? <p className="pulse-ts-admin-empty">Loading your score…</p> : null}

      {!loading && !row ? (
        <div className="pov-glass pulse-ts-person">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No performance data yet" />
        </div>
      ) : null}

      {row ? (
        <>
          <section className="pulse-perf-hero">
            <article className="pov-glass pulse-perf-score-card">
              <p className="pov-kicker">Weighted score</p>
              <strong className="pulse-perf-score">{row.weightedScore ?? 0}</strong>
              <span className={`pulse-perf-status ${statusTone(row.performanceStatus)}`}>
                {row.performanceStatus || 'Needs improvement'}
              </span>
              <Progress
                percent={Math.min(100, Number(row.weightedScore) || 0)}
                showInfo={false}
                strokeColor="#1A5F4A"
                trailColor="rgba(26, 95, 74, 0.12)"
              />
              {row.promotionEligible ? (
                <p className="pulse-perf-promo">Promotion-ready band (80%+)</p>
              ) : (
                <p className="pulse-perf-promo is-muted">Promotion normally needs ~80% average</p>
              )}
            </article>

            <article className="pov-glass pulse-perf-bonus-card">
              <p className="pov-kicker">This month</p>
              <ul className="pulse-perf-bonus-list">
                <li>
                  <span>Performance bonus</span>
                  <em>{formatInr(row.performanceBonus)}</em>
                </li>
                <li>
                  <span>Project ({row.projectTier}{row.projectApproved ? '' : ' · pending'})</span>
                  <em>{formatInr(row.projectBonus)}</em>
                </li>
                <li>
                  <span>Learning</span>
                  <em>{formatInr(row.learningBonus)}</em>
                </li>
                <li>
                  <span>Innovation</span>
                  <em>{formatInr(row.innovationBonus)}</em>
                </li>
                <li className="is-total">
                  <span>Total variable</span>
                  <em>{formatInr(row.totalBonus)}</em>
                </li>
                {Number(row.fixedPay) > 0 ? (
                  <li className="is-total">
                    <span>Total compensation</span>
                    <em>{formatInr(row.totalCompensation)}</em>
                  </li>
                ) : null}
              </ul>
              <p className="pulse-perf-cap">Monthly variable cap ₹10,000 · Status: {row.status}</p>
            </article>
          </section>

          <section className="pov-glass pulse-perf-areas">
            <header className="pulse-perf-section-head">
              <h3>Score breakdown</h3>
              <p>Weights from the BDA Career Growth Guide</p>
            </header>
            <div className="pulse-perf-area-grid">
              {scoreBars.map((area) => (
                <div key={area.key} className="pulse-perf-area">
                  <div className="pulse-perf-area-top">
                    <span>{area.label}</span>
                    <em>{area.value}</em>
                  </div>
                  <Slider value={area.value} disabled min={0} max={100} />
                  <p>Weight {(area.weight * 100).toFixed(0)}%</p>
                </div>
              ))}
            </div>
          </section>

          <section className="pov-glass pulse-perf-rules">
            <header className="pulse-perf-section-head">
              <h3>Payout tiers</h3>
              <p>Fixed by score — not negotiable after the month ends</p>
            </header>
            <div className="pulse-perf-tiers">
              {PERFORMANCE_TIERS.map((tier) => (
                <div
                  key={tier.status}
                  className={`pulse-perf-tier${row.performanceStatus === tier.status ? ' is-on' : ''}`}
                >
                  <strong>{tier.status}</strong>
                  <span>{tier.min}–{tier.max}</span>
                  <em>{formatInr(tier.bonus)}</em>
                </div>
              ))}
            </div>
          </section>

          {(row.managerNote || row.correctionRequested) ? (
            <section className="pov-glass pulse-perf-notes">
              {row.managerNote ? (
                <div>
                  <p className="pov-kicker">Manager note</p>
                  <p>{row.managerNote}</p>
                </div>
              ) : null}
              {row.correctionRequested ? (
                <div>
                  <p className="pov-kicker">Your correction request</p>
                  <p>{row.correctionNote || 'Submitted'}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          <footer className="pulse-perf-actions">
            <Button
              type="primary"
              className="pulse-perf-cta"
              disabled={!canCorrect}
              onClick={() => setCorrectionOpen(true)}
            >
              {locked
                ? 'Payroll locked'
                : row.correctionRequested
                  ? 'Correction already requested'
                  : 'Request score correction'}
            </Button>
            <p>One evidence-based correction before payroll lock (Review Process).</p>
          </footer>
        </>
      ) : null}

      <Modal
        title="Request score correction"
        open={correctionOpen}
        onCancel={() => setCorrectionOpen(false)}
        onOk={submitCorrection}
        okText="Submit"
        confirmLoading={saving}
        destroyOnClose
      >
        <p className="pulse-perf-modal-hint">
          Share evidence for outcomes, quality, deadlines, ownership, or BMS. This is a correction request, not a negotiation.
        </p>
        <Input.TextArea
          rows={5}
          maxLength={2000}
          value={correctionNote}
          onChange={(e) => setCorrectionNote(e.target.value)}
          placeholder="What should change, and what evidence supports it?"
        />
      </Modal>
    </div>
  )
}
