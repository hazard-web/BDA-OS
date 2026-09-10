import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import AuthShell from '../components/auth/AuthShell'
import { AuthLogoLoader, useAuthRedirect } from '../components/auth/AuthLogoLoader'
import { getPostLoginPath } from '../utils/pulseEntry'
import { pulseRoleLabel } from '../utils/pulseRoles'

export default function AcceptInvite() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { login } = useAuth()
  const { redirecting, redirectTo, onRedirectClick } = useAuthRedirect()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({ firstName: '', lastName: '', password: '', confirm: '' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get(`/invites/accept/${token}`)
        if (cancelled) return
        setInvite(res.data.data)
        setForm((f) => ({
          ...f,
          firstName: res.data.data.firstName || '',
          lastName: res.data.data.lastName || '',
        }))
      } catch (err) {
        if (cancelled) return
        setError(err.response?.data?.message || 'This invite is invalid or expired')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  const onSubmit = async (e) => {
    e.preventDefault()
    if (saving) return
    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (form.password !== form.confirm) {
      toast.error('Passwords do not match')
      return
    }
    setSaving(true)
    try {
      const res = await api.post('/invites/accept', {
        token,
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
      })
      login(res.data.token, res.data.user)
      toast.success('Welcome to BDA OS')
      redirectTo(getPostLoginPath(res.data.user), { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not accept invite')
      setSaving(false)
    }
  }

  if (loading) {
    return <AuthLogoLoader show label="Loading invite" />
  }

  if (error || !invite) {
    return (
      <>
        <AuthLogoLoader show={redirecting} />
        <AuthShell
          title="Invite unavailable"
          subtitle={error || 'This invite link cannot be used.'}
          footer={
            <a href="/login" className="auth-link" onClick={onRedirectClick('/login')}>
              Back to Sign in
            </a>
          }
        >
          <button type="button" className="auth-btn" onClick={() => navigate('/login')}>
            Go to Sign in
          </button>
        </AuthShell>
      </>
    )
  }

  return (
    <>
      <AuthLogoLoader show={redirecting || saving} label={saving ? 'Creating account' : 'Opening BDA OS'} />
      <AuthShell
        title="Accept invite"
        subtitle={
          invite.companyName
            ? `Join ${invite.companyName} as ${pulseRoleLabel(invite.role)}`
            : `Join as ${pulseRoleLabel(invite.role)}`
        }
        footer={
          <a href="/login" className="auth-link" onClick={onRedirectClick('/login')}>
            Already have an account? Sign in
          </a>
        }
      >
        <form onSubmit={onSubmit}>
          <div className="auth-email-chip">
            <span className="truncate">{invite.email}</span>
          </div>
          <div className="auth-field">
            <input
              className="auth-input"
              placeholder="First name"
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              autoComplete="given-name"
            />
          </div>
          <div className="auth-field">
            <input
              className="auth-input"
              placeholder="Last name"
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              autoComplete="family-name"
            />
          </div>
          <div className="auth-field">
            <input
              className="auth-input has-toggle"
              type={showPassword ? 'text' : 'password'}
              required
              placeholder="Create password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
              minLength={6}
            />
            <button
              type="button"
              className="auth-eye"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div className="auth-field">
            <input
              className="auth-input"
              type={showPassword ? 'text' : 'password'}
              required
              placeholder="Confirm password"
              value={form.confirm}
              onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
              autoComplete="new-password"
              minLength={6}
            />
          </div>
          <button type="submit" className="auth-btn" disabled={saving}>
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Creating…
              </>
            ) : (
              'Set password & continue'
            )}
          </button>
        </form>
      </AuthShell>
    </>
  )
}
