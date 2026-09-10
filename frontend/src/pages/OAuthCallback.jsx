import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import { AuthLogoLoader } from '../components/auth/AuthLogoLoader'
import { getPostLoginPath } from '../utils/pulseEntry'

export default function OAuthCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAuth()
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const error = params.get('error') || params.get('oauth_error')
      const token = params.get('token')
      const provider = params.get('provider') || 'google'

      if (error) {
        // Keep recovery inside BDA OS login (never a dead error page)
        navigate(`/login?oauth_error=${encodeURIComponent(error)}&provider=${encodeURIComponent(provider)}`, {
          replace: true,
        })
        return
      }
      if (!token) {
        navigate(
          `/login?oauth_error=${encodeURIComponent('Sign-in failed. Please try Google again.')}&provider=google`,
          { replace: true },
        )
        return
      }
      try {
        localStorage.setItem('token', token)
        const res = await api.get('/auth/profile', { __skipCache: true })
        if (cancelled) return
        login(token, res.data.user)
        const next = params.get('next')
        const section = params.get('section')
        if (next && next.startsWith('/') && !next.startsWith('//')) {
          navigate(section ? `${next}?section=${encodeURIComponent(section)}` : next, { replace: true })
        } else {
          navigate(getPostLoginPath(res.data.user), { replace: true })
        }
      } catch (err) {
        localStorage.removeItem('token')
        const msg = err.response?.data?.message || err.message || 'Sign-in failed'
        navigate(`/login?oauth_error=${encodeURIComponent(msg)}&provider=google`, { replace: true })
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [params, login, navigate])

  return <AuthLogoLoader show={busy} />
}
