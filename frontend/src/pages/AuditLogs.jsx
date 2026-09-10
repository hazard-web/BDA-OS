import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, ChevronRight, Activity, UserPlus, UserMinus, UserCheck, Key, Ban, FileText, Send, Download, LogOut, Clock, AlertTriangle, Zap, CheckCircle2, UserCog, Loader2 } from 'lucide-react'
import api from '../api'
import PageShell, { PageHeader } from '../components/PageShell'
import { formatDistanceToNow } from 'date-fns'

const RecentRow = React.memo(({ log, navigate }) => {
  const getActionConfig = (action) => {
    switch (action) {
      case 'PAYSLIP_GENERATED': return { icon: FileText, color: 'var(--primary)', label: 'Payslip' }
      case 'EMAIL_SENT': return { icon: Send, color: 'var(--primary)', label: 'Email' }
      case 'BULK_EMAIL': return { icon: Zap, color: 'var(--primary)', label: 'Bulk Email' }
      case 'STAFF_CREATED': return { icon: UserPlus, color: 'var(--primary)', label: 'Team' }
      case 'STAFF_UPDATED': return { icon: UserCog, color: 'var(--primary)', label: 'Update' }
      case 'STAFF_DELETED': return { icon: UserMinus, color: 'var(--primary)', label: 'Deletion' }
      case 'PORTAL_ACCESS_GRANTED': return { icon: Key, color: 'var(--primary)', label: 'Access' }
      case 'PORTAL_ACCESS_REVOKED': return { icon: Ban, color: 'var(--primary)', label: 'Revoke' }
      case 'PUNCH_OUT': return { icon: Clock, color: 'var(--primary)', label: 'Attendance' }
      case 'ATTENDANCE_RESOLVED': return { icon: CheckCircle2, color: 'var(--primary)', label: 'Resolved' }
      case 'FORCE_PUNCH_OUT': return { icon: LogOut, color: 'var(--primary)', label: 'Admin Fix' }
      case 'PULSE_CHECK_IN': return { icon: Clock, color: 'var(--primary)', label: 'Pulse check-in' }
      case 'PULSE_CHECK_OUT': return { icon: LogOut, color: 'var(--primary)', label: 'Pulse check-out' }
      case 'PULSE_RESUME': return { icon: Clock, color: 'var(--primary)', label: 'Pulse resume' }
      case 'PULSE_TIMESHEET_DAY': return { icon: FileText, color: 'var(--primary)', label: 'Timesheet day' }
      case 'PULSE_TIMESHEET_SUBMIT': return { icon: FileText, color: 'var(--primary)', label: 'Timesheet submit' }
      case 'PULSE_TARGET_REACHED': return { icon: CheckCircle2, color: 'var(--primary)', label: '9h target' }
      default: return { icon: Activity, color: 'var(--primary)', label: 'System' }
    }
  }

  const config = getActionConfig(log.action)
  const Icon = config.icon

  return (
    <div
      onClick={() => {
        if (log.metadata?.payslipId) navigate(`/payslips/${log.metadata.payslipId}`)
        else if (log.metadata?.staffId) navigate(`/staff/${log.metadata.staffId}`)
      }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        borderRadius: 8,
        cursor: (log.metadata?.payslipId || log.metadata?.staffId) ? 'pointer' : 'default',
        transition: 'all 0.2s',
        marginBottom: 8,
        background: 'var(--surface)',
        border: '1px solid var(--border)'
      }}
      className="btn-hover"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 32, height: 32,
          borderRadius: 8,
          background: 'var(--bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: config.color, flexShrink: 0
        }}>
          <Icon size={14} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)', marginBottom: 2 }}>{log.details}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
             <span style={{ color: config.color, fontWeight: 700, textTransform: 'uppercase', fontSize: 9 }}>{config.label}</span>
             <span>•</span>
             {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
          </div>
        </div>
      </div>
      {(log.metadata?.payslipId || log.metadata?.staffId) && (
        <ChevronRight size={14} color="var(--text-light)" />
      )}
    </div>
  )
});

const PAGE_LIMIT = 20

export default function AuditLogs({ isSettings }) {
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef(null)
  const observerRef = useRef(null)

  const fetchPage = useCallback(async (pageNum) => {
    if (pageNum === 1) setLoading(true)
    else setLoadingMore(true)
    try {
      const res = await api.get(`/activities?page=${pageNum}&limit=${PAGE_LIMIT}`)
      const newLogs = res.data?.data || []
      const pagination = res.data?.pagination || {}
      setLogs(prev => pageNum === 1 ? newLogs : [...prev, ...newLogs])
      setHasMore(pageNum < (pagination.totalPages || 1))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchPage(1)
  }, [fetchPage])

  // IntersectionObserver - fires when sentinel enters viewport
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          setPage(prev => {
            const next = prev + 1
            fetchPage(next)
            return next
          })
        }
      },
      { threshold: 0.1 }
    )
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current)
    return () => observerRef.current?.disconnect()
  }, [hasMore, loadingMore, loading, fetchPage])

  const content = (
    <>
      {!isSettings && (
        <PageHeader
          title="Activity Logs"
          subtitle="Recent workspace activities and generated slips."
        />
      )}

      <div className="fade-in glass" style={{ animationDelay: '100ms', overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)'
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Comprehensive Activity Timeline</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Tracking every workspace action and system event</div>
          </div>
        </div>

        <div style={{ padding: '24px' }}>
          {loading ? (
            [...Array(6)].map((_, i) => (
              <div key={i} style={{ height: 76, marginBottom: 12, borderRadius: 12, background: 'var(--border)', animation: 'pulse 1.5s infinite' }} />
            ))
          ) : logs.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <Building2 size={48} color="var(--border)" style={{ margin: '0 auto 20px' }} />
              <div style={{ color: 'var(--primary)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No recent activity</div>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>Start by generating your first statutory compliance document.</p>
              <button
                onClick={() => navigate('/payslips/generate')}
                style={{
                  background: 'var(--primary)', color: 'white',
                  border: 'none', borderRadius: 12, padding: '12px 24px',
                  fontWeight: 700, fontSize: 14, cursor: 'pointer',
                }}
              >
                Create First Slip
              </button>
            </div>
          ) : (
            <>
              {logs.map((log) => <RecentRow key={log._id} log={log} navigate={navigate} />)}

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} style={{ height: 1 }} />

              {loadingMore && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: 13, gap: 8, alignItems: 'center' }}>
                  <Loader2 size={16} className="animate-spin" />
                  Loading more…
                </div>
              )}

              {!hasMore && logs.length > 0 && (
                <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                  All {logs.length} activities loaded
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )

  return isSettings ? content : <PageShell>{content}</PageShell>
}

