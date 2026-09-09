import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import AuthShell from '../components/auth/AuthShell'
import AuthSocialRow from '../components/auth/AuthSocialRow'
import AuthMorphButton from '../components/auth/AuthMorphButton'
import { AuthLogoLoader, useAuthRedirect } from '../components/auth/AuthLogoLoader'
import { oauthStartUrl } from '../components/auth/oauthUrls'
import { getPostLoginPath } from '../utils/pulseEntry'
import { clearPulseLogoutOrigin } from '../utils/pulseAuthSync'
import { companyEmailRequiredMessage, isCompanyEmail, normalizeCompanyEmail } from '../utils/companyDomain'

export default function Login() {
  const { login, endExit } = useAuth()
  const { redirecting, redirectTo, onRedirectClick } = useAuthRedirect()
  const [searchParams, setSearchParams] = useSearchParams()
  const [step, setStep] = useState(1)
  const [checkingEmail, setCheckingEmail] = useState(false)
  const [loading, setLoading] = useState(false)
  const [oauthError, setOauthError] = useState('')
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const oauthToastShown = useRef(false)

  useEffect(() => {
    clearPulseLogoutOrigin()
    endExit?.()
  }, [endExit])

  useEffect(() => {
    const err = searchParams.get('oauth_error')
    if (!err) return
    setOauthError(err)
    if (!oauthToastShown.current) {
      oauthToastShown.current = true
      toast.error(err)
    }
    const next = new URLSearchParams(searchParams)
    next.delete('oauth_error')
    next.delete('provider')
    next.delete('error')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const goNext = async (e) => {
    e.preventDefault()
    if (checkingEmail) return
    const email = normalizeCompanyEmail(form.email)
    if (!email) {
      toast.error('Enter your email address')
      return
    }
    if (!isCompanyEmail(email)) {
      toast.error(companyEmailRequiredMessage())
      return
    }
    setForm((prev) => ({ ...prev, email }))
    // Keep same button mounted so width can morph while loading
    flushSync(() => setCheckingEmail(true))
    const started = Date.now()
    try {
      await api.post('/auth/check-email', { email })
      const wait = Math.max(0, 900 - (Date.now() - started))
      if (wait) await new Promise((r) => setTimeout(r, wait))
      setStep(2)
    } catch (err) {
      // Hold spinner briefly, then expand button back (remove is-loading)
      const wait = Math.max(0, 600 - (Date.now() - started))
      if (wait) await new Promise((r) => setTimeout(r, wait))
      toast.error(
        err.response?.data?.message || err.message || 'No account found with this email address',
      )
    } finally {
      setCheckingEmail(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading || redirecting) return
    flushSync(() => setLoading(true))
    try {
      const payload = {
        email: normalizeCompanyEmail(form.email),
        password: form.password,
      }
      const res = await api.post('/auth/login', payload)
      login(res.data.token, res.data.user)
      redirectTo(getPostLoginPath(res.data.user), { replace: true })
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Invalid email or password.')
      setLoading(false)
    }
  }

  return (
    <>
      <AuthLogoLoader show={redirecting} />
      {/* Try smart sign-in — keep in codebase, hidden from the sign-in screen
      <a href="/smart-signin" className="auth-smart" onClick={onRedirectClick('/smart-signin')}>
        <ScanLine size={15} strokeWidth={2.4} />
        Try smart sign-in
        <span className="auth-sparks" aria-hidden="true">
          <svg className="auth-spark auth-spark--lg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C12 6.627 17.373 12 24 12 17.373 12 12 17.373 12 24 12 17.373 6.627 12 0 12 6.627 12 12 6.627 12 0Z" />
          </svg>
          <svg className="auth-spark auth-spark--sm" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C12 6.627 17.373 12 24 12 17.373 12 12 17.373 12 24 12 17.373 6.627 12 0 12 6.627 12 12 6.627 12 0Z" />
          </svg>
        </span>
      </a>
      */}
      <AuthShell
        title="Sign in"
        subtitle="to access People OS"
      >
        {/* {step === 'more' ? (
          <AuthSocialGrid onBack={() => setStep(1)} />
        ) :  */}
        {step === 1 ? (
          <form onSubmit={goNext}>
            {oauthError ? (
              <div className="auth-oauth-banner" role="alert">
                <p>{oauthError}</p>
                <a href={oauthStartUrl('google')}>Try Google again</a>
              </div>
            ) : null}
            <input
              id="admin-email"
              className="auth-input"
              type="text"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              autoFocus
              autoComplete="username"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="you@bda.co.in"
              disabled={checkingEmail}
            />
            <div className="auth-next-slot">
              <AuthMorphButton loading={checkingEmail}>Next</AuthMorphButton>
            </div>

            <AuthSocialRow />
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="auth-email-chip">
              <span className="truncate">{form.email}</span>
              <button type="button" className="auth-change" onClick={() => setStep(1)}>
                Change
              </button>
            </div>
            <div className="auth-field">
              <input
                id="admin-password"
                className="auth-input has-toggle"
                type={showPassword ? 'text' : 'password'}
                required
                autoFocus
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Enter password"
              />
              <button
                type="button"
                className="auth-eye"
                onClick={() => setShowPassword((p) => !p)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <div className="auth-next-slot">
              <AuthMorphButton loading={loading || redirecting}>Sign in</AuthMorphButton>
            </div>
            <div className="mt-4">
              <a href="/forgot" className="auth-link" onClick={onRedirectClick('/forgot')}>
                Forgot Password?
              </a>
            </div>
          </form>
        )}
      </AuthShell>
    </>
  )
}
