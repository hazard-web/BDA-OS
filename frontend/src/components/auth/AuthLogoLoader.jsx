import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import './auth-loader.css'

const DEFAULT_MS = 900

export function AuthLogoLoader({ show = false, label = 'Loading' }) {
  if (!show) return null
  return (
    <div className="auth-logo-load" role="status" aria-live="polite" aria-label={label}>
      <span className="auth-logo-load-mark" aria-hidden="true">
        <i style={{ background: '#e42527' }} />
        <i style={{ background: '#f5c400' }} />
        <i style={{ background: '#21a05a' }} />
        <i style={{ background: '#408dfb' }} />
      </span>
    </div>
  )
}

/** Shows People OS logo loader, then navigates. */
export function useAuthRedirect(delayMs = DEFAULT_MS) {
  const navigate = useNavigate()
  const [redirecting, setRedirecting] = useState(false)
  const [target, setTarget] = useState(null)

  useEffect(() => {
    if (!redirecting || !target) return undefined
    const t = window.setTimeout(() => {
      navigate(target.to, target.options || { replace: true })
    }, delayMs)
    return () => window.clearTimeout(t)
  }, [redirecting, target, navigate, delayMs])

  const redirectTo = useCallback((to, options = { replace: true }) => {
    if (redirecting) return
    setTarget({ to, options })
    setRedirecting(true)
  }, [redirecting])

  const onRedirectClick = useCallback(
    (to, options = { replace: true }) =>
      (e) => {
        e.preventDefault()
        redirectTo(to, options)
      },
    [redirectTo],
  )

  return { redirecting, redirectTo, onRedirectClick }
}

/** Accounts + Pulse: button loads, then People OS mark, then login. */
export function useAccountSignOut({ onClosePanel, blocked = false } = {}) {
  const navigate = useNavigate()
  const { logout, startExit } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [signOutLogo, setSignOutLogo] = useState(false)
  const closeRef = useRef(onClosePanel)
  const timersRef = useRef([])
  closeRef.current = onClosePanel

  const beginSignOut = useCallback(() => {
    if (signingOut || signOutLogo || blocked) return
    startExit?.()
    setSigningOut(true)
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current = [
      window.setTimeout(() => {
        closeRef.current?.()
        setSignOutLogo(true)
      }, 650),
      window.setTimeout(() => {
        logout()
        navigate('/login', { replace: true })
      }, 650 + 950),
    ]
  }, [signingOut, signOutLogo, blocked, logout, navigate, startExit])

  useEffect(() => () => {
    timersRef.current.forEach((id) => window.clearTimeout(id))
  }, [])

  return { signingOut, signOutLogo, beginSignOut }
}
