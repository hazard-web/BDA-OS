import { useState } from 'react'
import toast from 'react-hot-toast'
import api from '../api'
import AuthShell from '../components/auth/AuthShell'
import AuthMorphButton from '../components/auth/AuthMorphButton'
import { AuthLogoLoader, useAuthRedirect } from '../components/auth/AuthLogoLoader'
import { companyEmailRequiredMessage, isCompanyEmail, normalizeCompanyEmail } from '../utils/companyDomain'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const { redirecting, onRedirectClick } = useAuthRedirect()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return
    const nextEmail = normalizeCompanyEmail(email)
    if (!nextEmail) {
      toast.error('Enter your email address')
      return
    }
    if (!isCompanyEmail(nextEmail)) {
      toast.error(companyEmailRequiredMessage())
      return
    }
    setEmail(nextEmail)
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email: nextEmail })
      setSent(true)
      toast.success('Reset link sent. Check your inbox.')
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <AuthLogoLoader show={redirecting} />
      <AuthShell
        title={sent ? 'Check your inbox' : 'Forgot password'}
        subtitle={
          sent
            ? `We sent a reset link to ${email}.`
            : 'to reset your BDA OS password'
        }
        footer={
          <a href="/login" className="auth-link" onClick={onRedirectClick('/login')}>
            Back to Sign in
          </a>
        }
      >
        {!sent ? (
          <form onSubmit={handleSubmit}>
            <input
              id="forgot-email"
              className="auth-input"
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@bda.co.in"
              autoComplete="username"
              disabled={loading}
            />
            <div className="auth-next-slot">
              <AuthMorphButton loading={loading}>Send reset link</AuthMorphButton>
            </div>
          </form>
        ) : (
          <div className="auth-forgot-done">
            <button
              type="button"
              className="auth-link auth-forgot-again"
              onClick={() => setSent(false)}
            >
              Use a different email
            </button>
          </div>
        )}
      </AuthShell>
    </>
  )
}
