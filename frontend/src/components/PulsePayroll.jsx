import { useEffect, useState } from 'react'
import { format, parse } from 'date-fns'
import { App, Button, DatePicker, Empty } from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api'
import { formatInr, monthKey } from '../utils/pulsePerformanceCalc'
import './pulse-performance.css'

function monthLabel(month) {
  try {
    return format(parse(`${month}-01`, 'yyyy-MM-dd', new Date()), 'MMMM yyyy')
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
              {row ? (
                <Button
                  type="primary"
                  className="pulse-perf-cta"
                  icon={<DownloadOutlined />}
                  loading={downloading}
                  onClick={downloadPayslip}
                >
                  Download
                </Button>
              ) : null}
            </div>
          </header>

          {loading ? <p className="pulse-ts-admin-empty">Loading…</p> : null}

          {!loading && !row ? (
            <div className="pov-glass pov-tasks">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Payslip appears after performance is locked"
              />
            </div>
          ) : null}

          {row ? (
            <>
              <div className="plive-metrics pulse-perf-metrics pulse-pay-metrics">
                <article className="pov-glass plive-metric">
                  <p>Net pay</p>
                  <strong>{formatInr(row.netPay)}</strong>
                  <span>{row.status === 'paid' ? 'Paid' : 'Generated'}</span>
                </article>
                <article className="pov-glass plive-metric">
                  <p>Fixed</p>
                  <strong>{formatInr(row.fixedPay)}</strong>
                  <span>Base</span>
                </article>
                <article className="pov-glass plive-metric">
                  <p>Variable</p>
                  <strong>{formatInr(row.totalBonus)}</strong>
                  <span>Bonuses</span>
                </article>
                <article className="pov-glass plive-metric">
                  <p>Score</p>
                  <strong>{row.weightedScore ?? 0}</strong>
                  <span>{row.performanceStatus || '—'}</span>
                </article>
              </div>

              <section className="pov-glass pov-tasks pulse-perf-board">
                <div className="pov-group-head">
                  <h4>Payslip</h4>
                  <span>{monthLabel(row.month)}</span>
                </div>
                <ul className="pulse-perf-lines">
                  <li><span>Fixed pay</span><em>{formatInr(row.fixedPay)}</em></li>
                  <li><span>Performance bonus</span><em>{formatInr(row.performanceBonus)}</em></li>
                  <li><span>Project bonus</span><em>{formatInr(row.projectBonus)}</em></li>
                  <li><span>Learning bonus</span><em>{formatInr(row.learningBonus)}</em></li>
                  <li><span>Innovation bonus</span><em>{formatInr(row.innovationBonus)}</em></li>
                  <li className="is-total"><span>Net pay</span><em>{formatInr(row.netPay)}</em></li>
                </ul>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
