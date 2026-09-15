import { useEffect, useState } from 'react'
import { format, parse } from 'date-fns'
import { App, Button, DatePicker, Empty } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
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

function personInitial(row) {
  return String(row.name || row.email || 'E').trim().charAt(0).toUpperCase() || 'E'
}

export default function PulsePayrollAdmin() {
  const { message } = App.useApp()
  const [month, setMonth] = useState(() => monthKey())
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ locked: 0, generated: 0 })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/pulse-payroll/admin/month', { params: { month } })
      setRows(res.data?.data || [])
      setMeta(res.data?.meta || { locked: 0, generated: 0 })
    } catch (err) {
      setRows([])
      setMeta({ locked: 0, generated: 0 })
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

  const pending = Math.max(0, (meta.locked || 0) - (meta.generated || 0))

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
          <Button
            type="primary"
            className="pulse-perf-cta"
            loading={busy}
            disabled={!pending}
            onClick={generateAll}
          >
            Generate {pending ? `(${pending})` : ''}
          </Button>
        </div>
      </header>

      {loading && !rows.length ? <p className="pulse-ts-admin-empty">Loading…</p> : null}

      {!loading && !rows.length ? (
        <div className="pov-glass pulse-ts-person">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Lock performance first to run payroll"
          />
        </div>
      ) : null}

      <div className="pulse-ts-admin-grid">
        {rows.map((row) => (
          <article key={row.user} className="pov-glass pulse-ts-person">
            <header className="pulse-ts-person-head">
              {row.avatarUrl ? (
                <img className="pulse-ts-person-avatar" src={row.avatarUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="pulse-ts-person-avatar is-fallback" aria-hidden="true">{personInitial(row)}</span>
              )}
              <div>
                <h3>{row.name}</h3>
                <p>{row.email || '—'}</p>
              </div>
              <span className={`pulse-ts-person-tag${row.hasPayslip ? ' is-on' : ''}`}>
                {row.payslip?.status === 'paid' ? 'Paid' : row.hasPayslip ? 'Payslip' : 'Ready'}
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
              <div>
                <p>Net</p>
                <strong>{formatInr(row.payslip?.netPay ?? (row.fixedPay || 0) + (row.totalBonus || 0))}</strong>
              </div>
            </div>

            <div className="pulse-pay-actions">
              {!row.hasPayslip ? (
                <Button size="small" loading={busy} onClick={() => generateOne(row.user)}>
                  Generate payslip
                </Button>
              ) : row.payslip?.status !== 'paid' ? (
                <Button size="small" type="primary" className="pulse-perf-cta" loading={busy} onClick={() => markPaid(row.user)}>
                  Mark paid
                </Button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
