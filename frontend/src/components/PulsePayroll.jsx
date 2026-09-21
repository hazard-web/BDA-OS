import { useEffect, useState } from 'react'
import { format, parse } from 'date-fns'
import { App, DatePicker, Tooltip } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api'
import { formatInr, monthKey, statusFullLabel, statusShortLabel } from '../utils/pulsePerformanceCalc'
import './pulse-performance.css'

function monthLabel(month) {
  try {
    return format(parse(`${month}-01`, 'yyyy-MM-dd', new Date()), 'MMMM yyyy')
  } catch {
    return month
  }
}

function shortMonth(month) {
  try {
    return format(parse(`${month}-01`, 'yyyy-MM-dd', new Date()), 'MMM yyyy')
  } catch {
    return month
  }
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

const LINE_ITEMS = [
  { key: 'fixedPay', label: 'Fixed pay', hint: 'Base salary' },
  { key: 'performanceBonus', label: 'Performance bonus', hint: 'Score linked' },
  { key: 'projectBonus', label: 'Project bonus', hint: 'Project tier' },
  { key: 'learningBonus', label: 'Learning bonus', hint: 'Approved learning' },
  { key: 'innovationBonus', label: 'Innovation bonus', hint: 'Approved innovation' },
]

export default function PulsePayroll() {
  const { message } = App.useApp()
  const [month, setMonth] = useState(() => monthKey())
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/pulse-payroll/me', { params: { month } })
      setRow(res.data?.data || null)
    } catch (err) {
      setRow(null)
      message.error(err?.response?.data?.message || 'Could not load payslip')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  const downloadPayslip = async () => {
    if (!row) return
    setDownloading(true)
    try {
      const res = await api.get('/pulse-payroll/me/download', {
        params: { month: row.month || month },
        responseType: 'blob',
      })
      const name = String(row.name || 'Employee').replace(/\s+/g, '_')
      downloadBlob(
        new Blob([res.data], { type: 'application/pdf' }),
        `Payslip_${name}_${row.month || month}.pdf`,
      )
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not download payslip')
    } finally {
      setDownloading(false)
    }
  }

  const display = !loading ? row : null
  const dash = loading ? '…' : '—'

  return (
    <div className="pulse-att-page pulse-pay-att">
      <div className="pulse-att-board">
        <header className="pulse-att-toolbar">
          <div className="pulse-att-period">
            <DatePicker
              picker="month"
              value={dayjs(`${month}-01`)}
              allowClear={false}
              format="MMM YYYY"
              className="pulse-att-range pulse-pay-month-picker"
              classNames={{ popup: { root: 'pulse-att-range-dropdown' } }}
              disabledDate={(value) => value && value.isAfter(dayjs(), 'month')}
              onChange={(next) => {
                if (next) setMonth(next.format('YYYY-MM'))
              }}
              aria-label="Payroll month"
            />
          </div>
          {row ? (
            <button
              type="button"
              className="pov-cta plive-top-cta plive-checkin"
              onClick={downloadPayslip}
              disabled={downloading}
            >
              <DownloadOutlined />
              {downloading ? 'Downloading…' : 'Download'}
            </button>
          ) : null}
        </header>

        <div className="plive-metrics">
          <article className="plive-metric plive-metric--split">
            <p>Net pay</p>
            <div className="plive-metric-split">
              <div>
                <strong>{display ? formatInr(display.netPay) : dash}</strong>
                <span>Take home</span>
              </div>
              <div>
                <strong>
                  {display
                    ? (display.status === 'paid' ? 'Paid' : 'Generated')
                    : dash}
                </strong>
                <span>Status</span>
              </div>
            </div>
          </article>
          <article className="plive-metric plive-metric--split">
            <p>Fixed</p>
            <div className="plive-metric-split">
              <div>
                <strong>{display ? formatInr(display.fixedPay) : dash}</strong>
                <span>Base</span>
              </div>
              <div>
                <strong>{display ? formatInr(display.totalBonus) : dash}</strong>
                <span>Variable</span>
              </div>
            </div>
          </article>
          <article className="plive-metric plive-metric--split">
            <p>Score</p>
            <div className="plive-metric-split">
              <div>
                <strong>{display ? (display.weightedScore ?? 0) : dash}</strong>
                <span>Weighted</span>
              </div>
              <div>
                {display?.performanceStatus ? (
                  <Tooltip title={statusFullLabel(display.performanceStatus)}>
                    <strong className="is-short">{statusShortLabel(display.performanceStatus)}</strong>
                  </Tooltip>
                ) : (
                  <strong>{dash}</strong>
                )}
                <span>Level</span>
              </div>
            </div>
          </article>
          <article className="plive-metric plive-metric--split">
            <p>Period</p>
            <div className="plive-metric-split">
              <div>
                <strong>{shortMonth(display?.month || month)}</strong>
                <span>Payslip month</span>
              </div>
              <div>
                <strong>{display ? 'Final' : dash}</strong>
                <span>{display ? 'Ready to download' : 'No payslip yet'}</span>
              </div>
            </div>
          </article>
        </div>

        <section className="pulse-att-panel" aria-label="Payslip breakdown">
          <div className="pulse-att-panel-chrome">
            <header className="pulse-att-panel-head">
              <h4>Payslip</h4>
              <span>{loading ? 'Loading…' : monthLabel(display?.month || month)}</span>
            </header>
            <div className="pulse-att-cols pulse-pay-att-cols" aria-hidden="true">
              <span>Component</span>
              <span>Amount</span>
              <span>Type</span>
            </div>
          </div>

          {loading ? (
            <p className="pulse-att-empty">Loading…</p>
          ) : !display ? (
            <p className="pulse-att-empty">
              No payslip for this month yet. It appears after Performance is locked and payroll is generated.
            </p>
          ) : (
            <ul className="pulse-att-list pulse-pay-att-list" aria-label="Payslip lines">
              {LINE_ITEMS.map((item) => {
                const amount = Number(display?.[item.key]) || 0
                const tone = amount > 0 ? 'ok' : 'open'
                return (
                  <li key={item.key} className={`pulse-att-row pulse-pay-att-row is-${tone}`}>
                    <span className={`pulse-att-dot is-${tone}`} aria-hidden="true" />
                    <div className="pulse-att-day">
                      <strong>{item.label}</strong>
                      <span>{item.hint}</span>
                    </div>
                    <div className="pulse-att-hours">{formatInr(amount)}</div>
                    <span className={`pulse-att-status is-${tone}`}>
                      {item.key === 'fixedPay' ? 'Fixed' : 'Bonus'}
                    </span>
                  </li>
                )
              })}
              <li className="pulse-att-row pulse-pay-att-row is-ok pulse-pay-att-total">
                <span className="pulse-att-dot is-ok" aria-hidden="true" />
                <div className="pulse-att-day">
                  <strong>Net pay</strong>
                  <span>Take home</span>
                </div>
                <div className="pulse-att-hours">{formatInr(display?.netPay)}</div>
                <span className="pulse-att-status is-ok">Total</span>
              </li>
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
