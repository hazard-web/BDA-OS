import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import BdaGateLoader from './BdaGateLoader'
import { useAuth } from '../context/AuthContext'
import {
  SIGN_OUT_TOTAL_MS,
  closePulseAuxiliaryTab,
  subscribePulseLogout,
} from '../utils/pulseAuthSync'
import { isPulseAuxiliaryTab } from '../utils/pulseOpenPage'

/** When Overview signs out, other Pulse tabs play the same Signing out gate, then close. */
export default function PulseAuthSync() {
  const { logout, startExit } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const busy = useRef(false)
  const timerRef = useRef(0)
  const [gate, setGate] = useState(false)

  useEffect(() => {
    busy.current = false
    setGate(false)
  }, [location.pathname])

  useEffect(() => {
    return subscribePulseLogout(() => {
      if (busy.current) return
      busy.current = true
      if (isPulseAuxiliaryTab(window.location.pathname)) {
        startExit?.()
        setGate(true)
        window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => {
          logout()
          closePulseAuxiliaryTab()
        }, SIGN_OUT_TOTAL_MS)
        return
      }
      logout()
      if (window.location.pathname !== '/login') {
        navigate('/login', { replace: true })
      }
    })
  }, [logout, navigate, startExit])

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  return <BdaGateLoader show={gate} label="Signing out" />
}
