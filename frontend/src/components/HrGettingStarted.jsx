import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, CalendarDays, Clock, FileText, CheckCircle2, Circle } from 'lucide-react'
import api from '../api'
import './hr-getting-started.css'

const STEPS = [
  {
    id: 'employees',
    title: 'Add employees',
    body: 'Create your team and invite them to the portal.',
    to: '/staff',
    icon: Users,
  },
  {
    id: 'leave',
    title: 'Configure leave policy',
    body: 'Set casual / sick leave rules for the year.',
    to: '/leave?tab=policy',
    icon: CalendarDays,
  },
  {
    id: 'attendance',
    title: 'Review attendance',
    body: 'Track punch-in and working days for your team.',
    to: '/attendance',
    icon: Clock,
  },
  {
    id: 'payroll',
    title: 'Run payroll',
    body: 'Generate payslips and push them to employee portal.',
    to: '/payslips/generate',
    icon: FileText,
  },
]

export default function HrGettingStarted({ companyName }) {
  const [done, setDone] = useState({
    employees: false,
    leave: false,
    attendance: false,
    payroll: false,
  })
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('pos_hr_checklist_dismissed') === '1'
    } catch {
      return false
    }
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [staffRes, leavesRes, payslipRes] = await Promise.allSettled([
          api.get('/staff', { params: { limit: 1, page: 1 }, __skipCache: true }),
          api.get('/leaves', { params: { limit: 1 }, __skipCache: true }),
          api.get('/payslips', { params: { limit: 1 }, __skipCache: true }),
        ])
        if (!alive) return
        const staffList =
          staffRes.status === 'fulfilled'
            ? staffRes.value.data?.data || staffRes.value.data?.staff || []
            : []
        const leaveList =
          leavesRes.status === 'fulfilled'
            ? leavesRes.value.data?.data || leavesRes.value.data?.leaves || []
            : []
        const payslipList =
          payslipRes.status === 'fulfilled'
            ? payslipRes.value.data?.data || payslipRes.value.data?.payslips || []
            : []

        setDone({
          employees: staffList.length > 0,
          leave: leaveList.length > 0 || localStorage.getItem('pos_hr_leave_touched') === '1',
          attendance: localStorage.getItem('pos_hr_attendance_touched') === '1',
          payroll: payslipList.length > 0,
        })
      } catch {
        /* checklist is best-effort */
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  if (dismissed || loading) return null

  const completedCount = Object.values(done).filter(Boolean).length
  if (completedCount >= STEPS.length) return null

  const dismiss = () => {
    try {
      localStorage.setItem('pos_hr_checklist_dismissed', '1')
    } catch {
      /* ignore */
    }
    setDismissed(true)
  }

  return (
    <section className="hrgs" aria-label="Getting started with HR">
      <div className="hrgs-head">
        <div>
          <p className="hrgs-eyebrow">Getting started</p>
          <h2>
            Set up HR for {companyName || 'your organization'}
          </h2>
          <p className="hrgs-sub">
            Follow this BDA OS flow: Employees → Leave → Attendance → Payroll.
          </p>
        </div>
        <button type="button" className="hrgs-dismiss" onClick={dismiss}>
          Dismiss
        </button>
      </div>

      <ol className="hrgs-list">
        {STEPS.map((step, index) => {
          const Icon = step.icon
          const isDone = done[step.id]
          return (
            <li key={step.id} className={isDone ? 'is-done' : ''}>
              <span className="hrgs-status" aria-hidden="true">
                {isDone ? <CheckCircle2 size={18} /> : <Circle size={18} />}
              </span>
              <div className="hrgs-copy">
                <span className="hrgs-num">{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </div>
              <Link to={step.to} className="hrgs-link">
                <Icon size={15} />
                {isDone ? 'Open' : 'Start'}
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
