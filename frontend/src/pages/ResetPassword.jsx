import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api'
import AuthShell from '../components/auth/AuthShell'
import AuthMorphButton from '../components/auth/AuthMorphButton'
import { AuthLogoLoader, useAuthRedirect } from '../components/auth/AuthLogoLoader'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { redirecting, redirectTo, onRedirectClick } = useAuthRedirect()

  const [form, setForm] = useState({ password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token) toast.error('Invalid or missing reset link.')
  }, [token])

  const passwordsMatch = form.password === form.confirm
  const passwordValid = form.password.length >= 6

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading || redirecting) return
    if (!passwordValid) {
      toast.error('Password must be at least 6 characters.')
      return
    }
    if (!passwordsMatch) {
      toast.error('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password: form.password })
      setSuccess(true)
      toast.success('Password updated. You can sign in now.')
      setTimeout(() => redirectTo('/login'), 2200)
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Reset failed. The link may have expired.')
      setLoading(false)
    }
  }

  return (
    <>
      <AuthLogoLoader show={redirecting} />
      <AuthShell
        title={success ? 'Password updated' : !token ? 'Invalid link' : 'Set new password'}
        subtitle={
          success
            ? 'Taking you back to sign in…'
            : !token
              ? 'This reset link is missing or broken.'
              : 'to access BDA OS'
        }
        footer={
          <a href="/login" className="auth-link" onClick={onRedirectClick('/login')}>
            Back to Sign in
          </a>
        }
      >
        {success ? (
          <div className="auth-forgot-done">
            <p className="auth-forgot-note">
              Your BDA OS password was reset successfully.
            </p>
            <a href="/login" className="auth-btn" onClick={onRedirectClick('/login')}>
              <span className="auth-btn-label">Go to Sign in</span>
            </a>
          </div>
        ) : !token ? (
          <div className="auth-forgot-done">
            <p className="auth-forgot-note">
              Request a fresh link from the forgot password screen.
            </p>
            <a href="/forgot" className="auth-btn" onClick={onRedirectClick('/forgot')}>
              <span className="auth-btn-label">Request new link</span>
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <input
                id="reset-password"
                className="auth-input has-toggle"
                type={showPassword ? 'text' : 'password'}
                required
                autoFocus
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="New password"
              />
              <button
                type="button"
                className="auth-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {form.password && !passwordValid ? (
              <p className="auth-field-hint is-error">Minimum 6 characters.</p>
            ) : null}

            <div className="auth-field">
              <input
                id="reset-password-confirm"
                className="auth-input has-toggle"
                type={showConfirm ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={form.confirm}
                onChange={(e) => setForm((prev) => ({ ...prev, confirm: e.target.value }))}
                placeholder="Confirm password"
              />
              <button
                type="button"
                className="auth-eye"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {form.confirm && !passwordsMatch ? (
              <p className="auth-field-hint is-error">Passwords do not match.</p>
            ) : null}
            {form.confirm && passwordsMatch && passwordValid ? (
              <p className="auth-field-hint is-ok">Passwords match.</p>
            ) : null}

            <div className="auth-next-slot">
              <AuthMorphButton loading={loading || redirecting}>Reset password</AuthMorphButton>
            </div>
          </form>
        )}
      </AuthShell>
    </>
  )
}
