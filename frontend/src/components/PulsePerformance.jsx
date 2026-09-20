import { useEffect, useMemo, useState } from 'react'
import { format, parse } from 'date-fns'
import { App, Button, DatePicker, Drawer, Input, Upload } from 'antd'
import {
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  MinusOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api'
import {
  AREA_KEYS,
  AREA_SHORT,
  AREA_WEIGHTS,
  formatInr,
  monthKey,
  statusTone,
} from '../utils/pulsePerformanceCalc'
import { buildPerfDemo, hasScoredAreas } from '../utils/pulsePerformanceDemo'
import PulseFileTypeIcon from './PulseFileTypeIcon'
import PulsePerformanceReveal from './PulsePerformanceReveal'
import PulseSlideClose from './PulseSlideClose'
import './pulse-performance.css'

const CORRECTION_ATTACH_MAX = 5 * 1024 * 1024

function readCorrectionFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > CORRECTION_ATTACH_MAX) {
      reject(new Error('Max. size is 5 MB'))
      return
    }
    const mime = String(file.type || '').toLowerCase()
    const ok = mime.startsWith('image/') || mime === 'application/pdf' || mime.includes('word')
    if (!ok) {
      reject(new Error('Use PDF, Word, or an image'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      resolve({
        name: file.name,
        mime: file.type,
        size: file.size,
        data: reader.result,
      })
    }
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

function CorrectionAttach({ value, onChange, disabled }) {
  const { message } = App.useApp()
  const pick = async (file) => {
    try {
      onChange(await readCorrectionFile(file))
    } catch (err) {
      message.error(err.message || 'Could not attach file')
    }
    return false
  }

  return (
    <div className="pulse-leave-attach pulse-perf-correction-attach">
      {value?.name ? (
        <div className="pulse-leave-attach-file">
          <PulseFileTypeIcon row={value} size={20} />
          <span>{value.name}</span>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            aria-label="Remove attachment"
            disabled={disabled}
            onClick={() => onChange(null)}
          />
        </div>
      ) : (
        <Upload
          accept="image/*,.pdf,.doc,.docx,application/pdf"
          maxCount={1}
          showUploadList={false}
          beforeUpload={pick}
          disabled={disabled}
        >
          <Button icon={<UploadOutlined />} disabled={disabled}>
            Attach file
          </Button>
        </Upload>
      )}
      <p className="pulse-leave-attach-hint">PDF, Word, or image · Max 5 MB</p>
    </div>
  )
}

function monthLabel(month) {
  try {
    return format(parse(`${month}-01`, 'yyyy-MM-dd', new Date()), 'MMMM yyyy')
  } catch {
    return month
  }
}

function areaTone(value) {
  const n = Number(value) || 0
  if (n >= 80) return 'ok'
  if (n >= 70) return 'open'
  if (n >= 60) return 'leave'
  return 'bad'
}

const DUMMY_PERF = buildPerfDemo()

const AREA_ICONS = {
  outcomes: CheckOutlined,
  quality: CheckOutlined,
  deadline: ClockCircleOutlined,
  ownership: MinusOutlined,
  bms: StopOutlined,
}

function toneForScore(value) {
  const n = Number(value) || 0
  if (n >= 80) return 'pass'
  if (n >= 70) return 'progress'
  if (n >= 60) return 'pending'
  if (n >= 50) return 'blocked'
  return 'fail'
}

function iconForTone(tone) {
  if (tone === 'pass') return CheckOutlined
  if (tone === 'fail') return CloseOutlined
  if (tone === 'progress') return ClockCircleOutlined
  if (tone === 'pending') return MinusOutlined
  return StopOutlined
}

function levelForScore(value) {
  const n = Number(value) || 0
  if (n >= 80) return 'Strong'
  if (n >= 60) return 'Good'
  if (n >= 50) return 'Fair'
  return 'Low'
}

function areaCardsFromScores(scores = {}) {
  return AREA_KEYS.map((key) => {
    const value = Math.max(0, Math.min(100, Number(scores[key]) || 0))
    const tone = toneForScore(value)
    const Icon = AREA_ICONS[key] || iconForTone(tone)
    const weightPct = Math.round((AREA_WEIGHTS[key] || 0) * 100)
    return {
      key,
      label: AREA_SHORT[key],
      value,
      share: Math.round(value),
      weightPct,
      level: levelForScore(value),
      tone,
      Icon,
    }
  })
}

export default function PulsePerformance() {
  const { message } = App.useApp()
  const [month, setMonth] = useState(() => monthKey())
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [correctionNote, setCorrectionNote] = useState('')
  const [correctionFile, setCorrectionFile] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/pulse-performance/me', { params: { month } })
      setRow(res.data?.data || null)
    } catch {
      setRow(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  const closeCorrection = () => {
    if (saving) return
    setCorrectionOpen(false)
  }

  const submitCorrection = async () => {
    const note = correctionNote.trim()
    if (!note) {
      message.warning('Add evidence')
      return
    }
    setSaving(true)
    try {
      const res = await api.post('/pulse-performance/me/correction', {
        month,
        note,
        attachment: correctionFile || null,
      })
      setRow(res.data?.data || null)
      setCorrectionOpen(false)
      setCorrectionNote('')
      setCorrectionFile(null)
      message.success('Requested')
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not submit')
    } finally {
      setSaving(false)
    }
  }

  const display = useMemo(() => {
    // Empty / locked-with-zeros rows from API → showcase dummy (unlocked).
    if (!row || !hasScoredAreas(row)) return DUMMY_PERF
    return {
      ...DUMMY_PERF,
      ...row,
      scores: {
        ...DUMMY_PERF.scores,
        ...(row.scores || {}),
      },
    }
  }, [row])

  const canCorrect = Boolean(row) && row.status !== 'locked' && !row.correctionRequested && hasScoredAreas(row)
  const scores = display.scores || {}
  const cards = useMemo(() => areaCardsFromScores(scores), [scores])
  const totalShare = cards.reduce((sum, card) => sum + card.share, 0) || 1

  return (
    <div className="pulse-att-page pulse-perf-att">
      <PulsePerformanceReveal
        status={display.performanceStatus}
        month={month}
        ready={!loading && Boolean(display.performanceStatus)}
      />
      <div className="pulse-att-board">
        <header className="pulse-att-toolbar">
          <div className="pulse-att-period">
            <DatePicker
              picker="month"
              value={dayjs(`${month}-01`)}
              allowClear={false}
              format="MMM YYYY"
              className="pulse-att-range pulse-perf-month-picker"
              classNames={{ popup: { root: 'pulse-att-range-dropdown' } }}
              disabledDate={(value) => value && value.isAfter(dayjs(), 'month')}
              onChange={(next) => {
                if (next) setMonth(next.format('YYYY-MM'))
              }}
              aria-label="Performance month"
            />
          </div>
          {canCorrect ? (
            <button
              type="button"
              className="pov-cta plive-top-cta plive-checkin"
              onClick={() => setCorrectionOpen(true)}
            >
              Correction
            </button>
          ) : null}
        </header>

        <section className="pulse-perf-cases" aria-label="Performance overview">
          <div className="pulse-perf-cases-summary">
            <p>Performance</p>
            <strong>{display.weightedScore ?? '—'}</strong>
            <span className={`pulse-perf-status-pill ${statusTone(display.performanceStatus)}`}>
              {display.performanceStatus || '—'}
            </span>
          </div>

          <div className="pulse-perf-cases-body">
            <div className="pulse-perf-cases-bar" aria-hidden="true">
              {cards.map((card) => (
                <i
                  key={card.key}
                  className={`is-${card.tone}`}
                  style={{ width: `${(card.share / totalShare) * 100}%` }}
                />
              ))}
            </div>

            <div className="pulse-perf-cases-grid">
              {cards.map((card) => {
                const Icon = card.Icon
                return (
                  <article key={card.key} className={`pulse-perf-case-card is-${card.tone}`}>
                    <header>
                      <span className="pulse-perf-case-ico" aria-hidden="true">
                        <Icon />
                      </span>
                      <span>{card.label}</span>
                    </header>
                    <strong>{card.value}</strong>
                    <em>{card.weightPct}% weight</em>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <div className="plive-metrics pulse-perf-bonus-metrics">
          <article className="plive-metric plive-metric--split">
            <p>Bonus</p>
            <div className="plive-metric-split">
              <div>
                <strong>{formatInr(display.performanceBonus)}</strong>
                <span>Performance</span>
              </div>
              <div>
                <strong>{formatInr(display.projectBonus)}</strong>
                <span>Project</span>
              </div>
            </div>
          </article>
          <article className="plive-metric plive-metric--split">
            <p>Extras</p>
            <div className="plive-metric-split">
              <div>
                <strong>{formatInr(display.learningBonus)}</strong>
                <span>Learning</span>
              </div>
              <div>
                <strong>{formatInr(display.innovationBonus)}</strong>
                <span>Innovation</span>
              </div>
            </div>
          </article>
          <article className="plive-metric plive-metric--split">
            <p>Total</p>
            <div className="plive-metric-split">
              <div>
                <strong>{formatInr(display.totalBonus)}</strong>
                <span>Variable</span>
              </div>
              <div>
                <strong>{display.projectTier || '—'}</strong>
                <span>Project tier</span>
              </div>
            </div>
          </article>
          <article className="plive-metric plive-metric--split">
            <p>Review</p>
            <div className="plive-metric-split">
              <div>
                <strong>{display.status === 'locked' ? 'Locked' : 'Unlocked'}</strong>
                <span>{display.status === 'locked' ? 'Final for payroll' : 'Still editable'}</span>
              </div>
              <div>
                <strong>{format(parse(`${month}-01`, 'yyyy-MM-dd', new Date()), 'MMM yyyy')}</strong>
                <span>Period</span>
              </div>
            </div>
          </article>
        </div>

        <section className="pulse-att-panel" aria-label="Performance areas">
          <div className="pulse-att-panel-chrome">
            <header className="pulse-att-panel-head">
              <h4>Areas</h4>
              <span>{loading ? 'Loading…' : monthLabel(month)}</span>
            </header>
            <div className="pulse-att-cols pulse-perf-att-cols" aria-hidden="true">
              <span>Area</span>
              <span>Score</span>
              <span>Level</span>
            </div>
          </div>

          <ul className="pulse-att-list pulse-perf-att-list" aria-label="Performance areas">
            {AREA_KEYS.map((key) => {
              const value = Number(scores[key]) || 0
              const tone = areaTone(value)
              const level = value >= 80
                ? 'Strong'
                : value >= 60
                  ? 'Good'
                  : value >= 50
                    ? 'Fair'
                    : 'Low'
              return (
                <li key={key} className={`pulse-att-row pulse-perf-att-row is-${tone}`}>
                  <span className={`pulse-att-dot is-${tone}`} aria-hidden="true" />
                  <div className="pulse-att-day">
                    <strong>{AREA_SHORT[key]}</strong>
                    <span className="pulse-perf-att-bar" aria-hidden="true">
                      <i style={{ width: `${Math.min(100, value)}%` }} />
                    </span>
                  </div>
                  <div className="pulse-att-hours">{value}</div>
                  <span className={`pulse-att-status is-${tone}`}>{level}</span>
                </li>
              )
            })}
          </ul>

          {row?.correctionRequested ? (
            <p className="pulse-perf-att-note">
              Correction requested for this month
              {row.correctionAttachment?.name ? ` · ${row.correctionAttachment.name}` : ''}.
            </p>
          ) : null}
        </section>
      </div>

      <Drawer
        title="Correction"
        placement="right"
        width={560}
        open={correctionOpen}
        onClose={closeCorrection}
        destroyOnHidden
        rootClassName="pulse-perf-edit-drawer"
        zIndex={1195}
        closable={false}
        styles={{
          mask: { boxShadow: 'none' },
          wrapper: { boxShadow: 'none' },
          content: { boxShadow: 'none' },
        }}
        footer={(
          <div className="pulse-perf-drawer-footer">
            <Button type="primary" className="pulse-perf-cta" loading={saving} onClick={submitCorrection}>
              Submit
            </Button>
          </div>
        )}
      >
        <div className="pulse-perf-correction">
          <p className="pulse-perf-correction-hint">
            One request this month. Add the score and evidence a manager can check.
          </p>
          <label className="pulse-perf-field">
            <span className="pulse-perf-field-label">Evidence</span>
            <Input.TextArea
              rows={8}
              maxLength={2000}
              value={correctionNote}
              disabled={saving}
              onChange={(e) => setCorrectionNote(e.target.value)}
              placeholder="Which score, and why"
              className="pulse-perf-note-input"
            />
          </label>
          <div className="pulse-perf-field">
            <span className="pulse-perf-field-label">Attachment</span>
            <CorrectionAttach value={correctionFile} onChange={setCorrectionFile} disabled={saving} />
          </div>
        </div>
      </Drawer>
      <PulseSlideClose open={correctionOpen} onClose={closeCorrection} width={560} top={76} />
    </div>
  )
}
