import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import { AuthLogoLoader, useAuthRedirect } from '../components/auth/AuthLogoLoader'
import { PasswordlessIllustration } from '../components/auth/AuthIllustrations'
import { oauthStartUrl } from '../components/auth/oauthUrls'
import { getPostLoginPath } from '../utils/pulseEntry'
import '../components/auth/auth-shell.css'
import './oauth-create-account.css'

/** Google mark */
const GoogleLogo = () => (
  <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.227 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.047 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
    />
    <path
      fill="#FF3D00"
      d="M6.306 14.691l6.571 4.819C14.655 15.108 19.004 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.047 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 01-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
    />
  </svg>
)

const IndiaFlag = () => (
  <svg viewBox="0 0 30 20" width="22" height="15" aria-hidden="true" className="oca-flag">
    <rect width="30" height="20" fill="#fff" />
    <rect width="30" height="6.67" fill="#FF9933" />
    <rect y="13.33" width="30" height="6.67" fill="#138808" />
    <circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" strokeWidth="0.85" />
    <circle cx="15" cy="10" r="0.55" fill="#000080" />
  </svg>
)

function profileFromTicket(ticket) {
  if (!ticket) return null
  try {
    const part = ticket.split('.')[1]
    if (!part) return null
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    const data = JSON.parse(json)
    if (data.purpose !== 'oauth_signup') return null
    if (data.exp && data.exp * 1000 < Date.now()) return null
    return {
      provider: data.provider,
      providerLabel: data.provider === 'google' ? 'Google' : data.provider,
      email: data.email,
      name: data.name || '',
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      picture: data.picture || '',
      exp: data.exp || null,
    }
  } catch {
    return null
  }
}

function ticketExpiresAtMs(ticket) {
  try {
    const part = ticket?.split('.')[1]
    if (!part) return null
    const data = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    return data.exp ? data.exp * 1000 : null
  } catch {
    return null
  }
}

export default function OAuthCreateAccount() {
  const [params] = useSearchParams()
  const ticket = params.get('ticket') || ''
  const navigate = useNavigate()
  const { login } = useAuth()
  const { redirecting, redirectTo } = useAuthRedirect()

  const bootProfile = useMemo(() => profileFromTicket(ticket), [ticket])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [linking, setLinking] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [expired, setExpired] = useState(() => !ticket || !bootProfile)
  const [profile, setProfile] = useState(bootProfile)
  const [agreed, setAgreed] = useState(false)
  const [password, setPassword] = useState('')
  const [focus, setFocus] = useState('')
  const [form, setForm] = useState(() => ({
    firstName: bootProfile?.firstName || '',
    lastName: bootProfile?.lastName || '',
    phone: '',
  }))

  useEffect(() => {
    let alive = true

    if (!ticket) {
      setExpired(true)
      setProfile(null)
      setLoading(false)
      return undefined
    }

    const local = profileFromTicket(ticket)
    if (!local) {
      setExpired(true)
      setProfile(null)
      setLoading(false)
      return undefined
    }

    // Paint form immediately from ticket - don't block on API
    setExpired(false)
    setProfile(local)
    setForm({
      firstName: local.firstName || '',
      lastName: local.lastName || '',
      phone: '',
    })
    setLoading(false)

    const failSafe = window.setTimeout(() => {
      if (alive) setLoading(false)
    }, 4000)

    // Flip to expired UI the moment the JWT expires (no reload needed)
    const expMs = ticketExpiresAtMs(ticket)
    let expireTimer
    let expirePoll
    const markExpired = () => {
      if (!alive) return
      setExpired(true)
      setProfile(null)
    }
    if (expMs) {
      const wait = expMs - Date.now()
      if (wait <= 0) {
        markExpired()
      } else {
        expireTimer = window.setTimeout(markExpired, wait)
        expirePoll = window.setInterval(() => {
          if (Date.now() >= expMs) markExpired()
        }, 1000)
      }
    }

    ;(async () => {
      try {
        const res = await api.get('/auth/oauth/signup-session', {
          params: { ticket },
          __skipCache: true,
          timeout: 8000,
        })
        if (!alive) return
        if (!profileFromTicket(ticket)) {
          setExpired(true)
          setProfile(null)
          return
        }
        const p = res.data.profile
        setProfile(p)
        setForm((prev) => ({
          firstName: p.firstName || prev.firstName || '',
          lastName: p.lastName || prev.lastName || '',
          phone: prev.phone || '',
        }))
        setExpired(false)
      } catch {
        // Ticket still decodes locally - keep form. Only hard-expire if JWT is bad.
        if (!alive) return
        if (!profileFromTicket(ticket)) {
          setExpired(true)
          setProfile(null)
        }
      } finally {
        if (alive) setLoading(false)
      }
    })()

    return () => {
      alive = false
      window.clearTimeout(failSafe)
      if (expireTimer) window.clearTimeout(expireTimer)
      if (expirePoll) window.clearInterval(expirePoll)
    }
  }, [ticket])

  const displayName = useMemo(() => {
    if (!profile) return ''
    const n = [form.firstName, form.lastName].filter(Boolean).join(' ')
    return n || profile.name || 'there'
  }, [profile, form.firstName, form.lastName])

  const finishLogin = (token, user) => {
    login(token, user)
    toast.success('Welcome to BDA OS!')
    navigate(getPostLoginPath(user), { replace: true })
  }

  const onCreate = async (e) => {
    e.preventDefault()
    if (saving) return
    if (!agreed) {
      toast.error('Please agree to the Terms of Service and Privacy Policy.')
      return
    }
    if (form.phone.replace(/\D/g, '').length < 10) {
      toast.error('Enter a valid mobile number.')
      return
    }
    if (!form.firstName.trim()) {
      toast.error('Enter your first name.')
      return
    }
    setSaving(true)
    try {
      const res = await api.post(
        '/auth/oauth/complete',
        {
          ticket,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone,
          agreed: true,
        },
        { timeout: 20000 },
      )
      finishLogin(res.data.token, res.data.user)
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Could not create account'
      toast.error(msg)
      if (err.response?.data?.code === 'OAUTH_SESSION_EXPIRED' || /expired|invalid ticket/i.test(msg)) {
        setExpired(true)
      }
      setSaving(false)
    }
  }

  const onLink = async (e) => {
    e.preventDefault()
    if (linking) return
    if (!password) {
      toast.error('Enter your BDA OS password to link accounts.')
      return
    }
    setLinking(true)
    try {
      const res = await api.post('/auth/oauth/link', { ticket, password }, { timeout: 20000 })
      finishLogin(res.data.token, res.data.user)
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Could not link accounts')
      setLinking(false)
    }
  }

  if (loading) return <AuthLogoLoader show label="Loading account setup" />

  if (expired || !profile) {
    return (
      <div className="oca-expired">
        <AuthLogoLoader show={redirecting} label="Going to BDA OS" />
        <div className="oca-expired-visual" aria-hidden="true">
          <img className="oca-expired-bg" src="/auth-bg.svg" alt="" />
          <div className="oca-expired-art">
            <PasswordlessIllustration />
          </div>
          <div className="oca-expired-brandmark">
            <span className="oca-people-mark" aria-hidden="true">
              <i style={{ background: '#e42527' }} />
              <i style={{ background: '#f5c400' }} />
              <i style={{ background: '#21a05a' }} />
              <i style={{ background: '#2b8aed' }} />
            </span>
            <strong>BDA OS</strong>
          </div>
        </div>

        <div className="oca-expired-panel">
          <div className="oca-expired-inner">
            <p className="oca-expired-eyebrow">BDA OS</p>
            <h1 className="oca-expired-title">
              Sign-in session <span>expired</span>
            </h1>
            <p className="oca-expired-lead">
              This page is no longer valid. Please sign in again to continue.
            </p>

            <a className="oca-expired-cta" href={oauthStartUrl('google')}>
              <GoogleLogo />
              <span>Sign in with Google</span>
            </a>
            <button
              type="button"
              className="oca-expired-back"
              onClick={() => redirectTo('/')}
              disabled={redirecting}
            >
              Back to BDA OS Homepage
            </button>
          </div>

          <footer className="oca-expired-foot">
            © {new Date().getFullYear()}, BDA Technologies Private Limited. All Rights Reserved.
          </footer>
        </div>
      </div>
    )
  }

  const fieldClass = (key, value) =>
    `oca-box${focus === key || value ? ' is-active' : ''}${focus === key ? ' is-focus' : ''}`

  return (
    <div className="oca-page">
      <AuthLogoLoader show={saving || linking} label={saving ? 'Creating account' : 'Linking account'} />

      <div className="oca-shell">
        <div className="oca-hello">
          {profile.picture ? (
            <img src={profile.picture} alt="" className="oca-pic" referrerPolicy="no-referrer" />
          ) : (
            <span className="oca-pic oca-pic--fallback">{(displayName || 'P').charAt(0)}</span>
          )}
          <div>
            <h1>Welcome {displayName}!</h1>
            <p>
              A new BDA OS account will be created for the email address <b>{profile.email}</b>.
            </p>
          </div>
        </div>

        <form onSubmit={onCreate} noValidate>
          <div className="oca-names">
            <div className={fieldClass('firstName', form.firstName)}>
              <label htmlFor="oca-first">First Name</label>
              <input
                id="oca-first"
                value={form.firstName}
                onFocus={() => setFocus('firstName')}
                onBlur={() => setFocus('')}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                autoComplete="given-name"
                required
              />
            </div>
            <div className={fieldClass('lastName', form.lastName)}>
              <label htmlFor="oca-last">Last Name</label>
              <input
                id="oca-last"
                value={form.lastName}
                onFocus={() => setFocus('lastName')}
                onBlur={() => setFocus('')}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className={`oca-box oca-mobile is-active${focus === 'phone' ? ' is-focus' : ''}`}>
            <label htmlFor="oca-phone">Mobile Number</label>
            <div className="oca-mobile-row">
              <div className="oca-dial" aria-hidden="true">
                <IndiaFlag />
                <svg viewBox="0 0 10 6" width="9" height="6">
                  <path d="M1 1l4 4 4-4" fill="none" stroke="#555" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <span>+91</span>
              </div>
              <input
                id="oca-phone"
                type="tel"
                inputMode="numeric"
                value={form.phone}
                onFocus={() => setFocus('phone')}
                onBlur={() => setFocus('')}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))
                }
                autoComplete="tel-national"
                required
              />
            </div>
          </div>

          <p className="oca-dc">
            As your IP address indicates you&apos;re in <b>India</b>, your account will be stored in
            the <b>INDIA</b> data center.
          </p>

          <label className="oca-tos">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              I agree to the{' '}
              <Link to="/coming-soon" target="_blank" rel="noreferrer">
                Terms of service
              </Link>{' '}
              and{' '}
              <Link to="/coming-soon" target="_blank" rel="noreferrer">
                Privacy policies
              </Link>{' '}
              of BDA Technologies Private Limited.
            </span>
          </label>

          <button type="submit" className="oca-go" disabled={saving || linking}>
            {saving ? 'Creating…' : 'Create Account'}
          </button>
        </form>

        <div className="oca-split">
          <i />
          <span>Or</span>
          <i />
        </div>

        <div className="oca-linkrow">
          <div>
            <h2>Link existing accounts</h2>
            <p>
              If you have a BDA OS account, you can link your <b>Google account</b> with it.
            </p>
          </div>
          {!showLink ? (
            <button type="button" className="oca-link" onClick={() => setShowLink(true)}>
              Link Accounts
            </button>
          ) : (
            <form className="oca-linkform" onSubmit={onLink}>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button type="submit" disabled={linking || saving}>
                {linking ? '…' : 'Link'}
              </button>
            </form>
          )}
        </div>
      </div>

      <footer className="auth-footer">
        © {new Date().getFullYear()}, BDA Technologies Private Limited. All Rights Reserved.
      </footer>
    </div>
  )
}
