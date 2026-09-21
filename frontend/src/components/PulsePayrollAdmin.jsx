import { useEffect, useState } from 'react'
import { format, parse } from 'date-fns'
import { App, Button, DatePicker } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import api from '../api'
import { formatInr, monthKey } from '../utils/pulsePerformanceCalc'
import { personName } from '../utils/pulsePerson'
import './pulse-performance.css'

function monthLabel(month) {
  try {
    return format(parse(`${month}-01`, 'yyyy-MM-dd', new Date()), 'MMMM yyyy')
  } catch {
    return month
  }
}

function suggestedNet(row) {
  if (Number(row?.payslip?.netPay) > 0) return Number(row.payslip.netPay)
  if (Number(row?.standingNetPay) > 0) return Number(row.standingNetPay)
  if (Number(row?.netPay) > 0) return Number(row.netPay)
  return Math.max(0, Math.round((Number(row?.fixedPay) || 0) + (Number(row?.totalBonus) || 0)))
}

function statusLabel(row) {
  if (row.payslip?.status === 'paid') return 'Paid'
  if (row.hasPayslip) return 'Payslip'
  if (row.performanceLocked) return 'Locked'
  if (row.performanceState && row.performanceState !== 'none') return 'In review'
  return 'Open'
}

function statusChipClass(row) {
  if (row.payslip?.status === 'paid') return 'is-paid'
  if (row.hasPayslip) return 'is-slip'
  if (row.performanceLocked) return 'is-locked'
  if (row.performanceState && row.performanceState !== 'none') return 'is-review'
  return 'is-open'
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

export default function PulsePayrollAdmin() {
  const { message } = App.useApp()
  const [month, setMonth] = useState(() => monthKey())
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [downloadingUser, setDownloadingUser] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/pulse-payroll/admin/month', { params: { month } })
      setRows(res.data?.data || [])
    } catch (err) {
      setRows([])
      message.error(err?.response?.data?.message || 'Could not load payroll')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month])

  const generateAll = async () => {
    setBusy(true)
    try {
      const res = await api.post('/pulse-payroll/admin/generate', { month })
      message.success(`Generated ${res.data?.meta?.count || 0} payslip(s)`)
      await load()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not generate')
    } finally {
      setBusy(false)
    }
  }

  const generateOne = async (userId) => {
    setBusy(true)
    try {
      await api.post('/pulse-payroll/admin/generate', { month, userId })
      message.success('Payslip generated')
      await load()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not generate')
    } finally {
      setBusy(false)
    }
  }

  const markPaid = async (userId) => {
    setBusy(true)
    try {
      await api.post(`/pulse-payroll/admin/${userId}/paid`, { month })
      message.success('Marked paid')
      await load()
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not update')
    } finally {
      setBusy(false)
    }
  }

  const downloadPayslip = async (row) => {
    setDownloadingUser(row.user)
    try {
      const res = await api.get(`/pulse-payroll/admin/${row.user}/download`, {
        params: { month },
        responseType: 'blob',
      })
      const name = String(row.name || 'Employee').replace(/\s+/g, '_')
      downloadBlob(
        new Blob([res.data], { type: 'application/pdf' }),
        `Payslip_${name}_${month}.pdf`,
      )
    } catch (err) {
      message.error(err?.response?.data?.message || 'Could not download payslip')
    } finally {
      setDownloadingUser(null)
    }
  }

  const canGenerate = (row) =>
    Boolean(row.performanceLocked) || suggestedNet(row) > 0

  const pending = Math.max(
    0,
    rows.filter((r) => canGenerate(r) && !r.hasPayslip).length,
  )
  const displayRows = !loading ? rows : []
  const emptyTeam = !loading && !rows.length
  const peopleCount = displayRows.length

  return (
    <div className="pulse-att-page pulse-org-admin-att pulse-pay-admin-att">
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
              aria-label="Payroll month"
            />
          </div>
          <div className="pulse-org-admin-actions">
            <button
              type="button"
              className="pov-cta plive-top-cta plive-checkin"
              disabled={busy || !pending || emptyTeam}
              onClick={generateAll}
            >
              {busy ? 'Generating…' : `Generate${pending ? ` (${pending})` : ''}`}
            </button>
          </div>
        </header>

        <section className="pulse-att-panel" aria-label="Payroll team">
          <div className="pulse-att-panel-chrome">
            <header className="pulse-att-panel-head">
              <h4>Payroll · {monthLabel(month)}</h4>
              <span>
                {loading ? 'Loading…' : `${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}`}
              </span>
            </header>
            <div className="pulse-att-cols pulse-org-admin-cols pulse-pay-admin-cols" aria-hidden="true">
              <span className="pulse-att-cols-spacer" />
              <span>Person</span>
              <span>Score</span>
              <span>Variable</span>
              <span>Net</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
          </div>

          <div className="pulse-org-admin-body">
            {loading && !displayRows.length ? (
              <p className="pulse-org-admin-empty">Loading…</p>
            ) : emptyTeam ? (
              <p className="pulse-org-admin-empty">
                No team members yet. Invite people, then lock Performance to create payslips.
              </p>
            ) : (
              <ul className="pulse-att-list" aria-label="Payroll people">
                {displayRows.map((row) => {
                  const chip = statusChipClass(row)
                  const tone = chip.replace(/^is-/, '')
                  const tag = statusLabel(row)

                  return (
                    <li key={row.user} className={`pulse-att-row pulse-org-admin-row pulse-pay-admin-row is-${tone}`}>
                      <span className={`pulse-att-dot is-${tone}`} aria-hidden="true" />
                      <div className="pulse-att-day">
                        <strong>{personName(row)}</strong>
                        <span>{row.email || '-'}</span>
                      </div>
                      <div className="pulse-att-hours">{row.weightedScore ?? 0}</div>
                      <div className="pulse-pay-admin-var">{formatInr(row.totalBonus)}</div>
                      <div className="pulse-pay-admin-var">{formatInr(suggestedNet(row))}</div>
                      <span className={`pulse-att-status ${chip}`}>{tag}</span>
                      <div className="pulse-org-admin-actions-cell">
                        {!row.hasPayslip ? (
                          <Button
                            size="small"
                            loading={busy}
                            disabled={!canGenerate(row)}
                            onClick={() => generateOne(row.user)}
                          >
                            Generate
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="small"
                              icon={<DownloadOutlined />}
                              loading={downloadingUser === row.user}
                              onClick={() => downloadPayslip(row)}
                            >
                              Download
                            </Button>
                            {row.payslip?.status !== 'paid' ? (
                              <Button
                                size="small"
                                type="primary"
                                className="pulse-perf-cta"
                                loading={busy}
                                onClick={() => markPaid(row.user)}
                              >
                                Mark paid
                              </Button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
