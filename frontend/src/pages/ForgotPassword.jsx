import { useState } from 'react'
import { Loader2, ExternalLink, Inbox, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api'
import AuthShell from '../components/auth/AuthShell'
import { AuthLogoLoader, useAuthRedirect } from '../components/auth/AuthLogoLoader'
import { companyEmailRequiredMessage, isCompanyEmail, normalizeCompanyEmail } from '../utils/companyDomain'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [devResetLink, setDevResetLink] = useState(null)
  const [devEmailPreview, setDevEmailPreview] = useState(null)
  const { redirecting, onRedirectClick } = useAuthRedirect()

  const handleSubmit = async (e) => {
    e.preventDefault()
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
      const res = await api.post('/auth/forgot-password', { email: nextEmail })
      setSent(true)
      if (res?.data?.devResetLink) {
        setDevResetLink(res.data.devResetLink)
        toast.success('SMTP not configured - use the dev link below to reset your password.', { duration: 5000 })
      } else if (res?.data?.devEmailPreview) {
        setDevEmailPreview(res.data.devEmailPreview)
        toast.success('Reset link dispatched (Ethereal test SMTP).', { duration: 5000 })
      } else {
        toast.success('Reset link dispatched - check your inbox.')
      }
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
        title={sent ? 'Check your inbox' : 'Forgot Password?'}
        subtitle={
          sent
            ? `If ${email} is registered, you will receive a reset link shortly.`
            : 'Enter your email address and we will send you a reset link.'
        }
        footer={
          <a href="/login" className="auth-link" onClick={onRedirectClick('/login')}>
            Back to Sign in
          </a>
        }
      >
      {!sent ? (
        <form onSubmit={handleSubmit}>
          <label className="auth-label" htmlFor="forgot-email">
            Email address
          </label>
          <div className="auth-field">
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
            />
          </div>
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Sending…
              </>
            ) : (
              'Next'
            )}
          </button>
        </form>
      ) : (
        <div>
          <p style={{ fontSize: 13, color: '#666', margin: '0 0 18px', lineHeight: 1.5 }}>
            The link expires in <strong>1 hour</strong>. Check spam if you don&apos;t see it.
          </p>

          {devEmailPreview && !devResetLink && (
            <a
              href={devEmailPreview}
              target="_blank"
              rel="noopener noreferrer"
              className="auth-secondary"
              style={{ marginBottom: 12 }}
            >
              <Inbox size={15} /> View test email <ExternalLink size={14} />
            </a>
          )}

          {devResetLink && (
            <div style={{ marginBottom: 12 }}>
              <a href={devResetLink} className="auth-btn" style={{ textDecoration: 'none', marginBottom: 10 }}>
                <KeyRound size={15} /> Reset Password Now
              </a>
              <div style={{ fontSize: 11, color: '#8a8f98', wordBreak: 'break-all', marginTop: 10 }}>
                {devResetLink}
              </div>
            </div>
          )}
        </div>
      )}
      </AuthShell>
    </>
  )
}
