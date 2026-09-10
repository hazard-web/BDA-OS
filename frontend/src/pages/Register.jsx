import { useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api'
import AuthShell from '../components/auth/AuthShell'
import { AuthLogoLoader, useAuthRedirect } from '../components/auth/AuthLogoLoader'
import { companyEmailRequiredMessage, isCompanyEmail, normalizeCompanyEmail } from '../utils/companyDomain'

/**
 * Bootstrap only: creates the first Pulse admin when the database has zero users.
 * After that, registration is invite-only.
 */
export default function Register() {
  const { redirecting, redirectTo, onRedirectClick } = useAuthRedirect()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', companyName: '' })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters.')
      return
    }
    const email = normalizeCompanyEmail(form.email)
    if (!email) {
      toast.error('Enter your email address')
      return
    }
    if (!isCompanyEmail(email)) {
      toast.error(companyEmailRequiredMessage())
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/register', {
        email,
        password: form.password,
        companyName: form.companyName.trim(),
      })
      toast.success('Admin account created. Sign in to continue.')
      redirectTo('/login')
    } catch (err) {
      const code = err.response?.data?.code
      const msg = err.response?.data?.message || err.message || 'Registration failed'
      if (code === 'INVITE_ONLY') {
        toast.error(msg)
        redirectTo('/login')
        return
      }
      toast.error(msg)
      setLoading(false)
    }
  }

  return (
    <>
      <AuthLogoLoader show={redirecting} />
      <AuthShell
        title="Create admin"
        subtitle="First-time setup only for @bda.co.in. After this, people join by invite."
        footer={
          <a href="/login" className="auth-link" onClick={onRedirectClick('/login')}>
            Already invited? Sign in
          </a>
        }
      >
        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <input
              className="auth-input"
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              autoFocus
              autoComplete="username"
              placeholder="you@bda.co.in"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="auth-field">
            <input
              className="auth-input"
              placeholder="Company name (optional)"
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
            />
          </div>
          <div className="auth-field">
            <input
              className="auth-input has-toggle"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
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
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Creating…
              </>
            ) : (
              'Create admin account'
            )}
          </button>
        </form>
      </AuthShell>
    </>
  )
}
