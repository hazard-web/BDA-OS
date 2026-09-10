import BdaGateLoader from '../BdaGateLoader'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  SIGN_OUT_BUTTON_MS,
  SIGN_OUT_GATE_MS,
  broadcastPulseLogout,
  goToLoginOrCloseTab,
} from '../../utils/pulseAuthSync'

const DEFAULT_MS = 900

export function AuthLogoLoader({ show = false, label = 'Loading' }) {
  return <BdaGateLoader show={show} label={label} />
}

/** Shows BDA 3D loader, then navigates. */
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

/** Accounts + Pulse: button loads, then BDA OS mark, then login. */
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
    broadcastPulseLogout()
    setSigningOut(true)
    timersRef.current.forEach((id) => window.clearTimeout(id))
    timersRef.current = [
      window.setTimeout(() => {
        closeRef.current?.()
        setSignOutLogo(true)
      }, SIGN_OUT_BUTTON_MS),
      window.setTimeout(() => {
        logout()
        goToLoginOrCloseTab(navigate)
      }, SIGN_OUT_BUTTON_MS + SIGN_OUT_GATE_MS),
    ]
  }, [signingOut, signOutLogo, blocked, logout, navigate, startExit])

  useEffect(() => () => {
    timersRef.current.forEach((id) => window.clearTimeout(id))
  }, [])

  return { signingOut, signOutLogo, beginSignOut }
}
