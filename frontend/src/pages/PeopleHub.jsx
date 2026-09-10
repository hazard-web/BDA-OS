import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import PulseLoading from '../components/PulseLoading'
import {
  APP_BASE,
  getPostLoginPath,
  hasPulseAccount,
  markPulseAccountCreated,
  PULSE_HOME,
  suggestedPulseSetupPayload,
} from '../utils/pulseEntry'
import './pulse-antd.css'

/**
 * /bda-os entry — auto-completes Pulse setup when needed, then opens You.
 * Marketing welcome landing removed.
 */
export default function PeopleHub() {
  const { user, loading, updateProfile } = useAuth()
  const navigate = useNavigate()
  const ran = useRef(false)
  const [profileChecked, setProfileChecked] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get('/auth/profile', { __skipCache: true })
        if (!cancelled && res?.data?.user) updateProfile?.(res.data.user)
      } catch {
        /* keep session user */
      } finally {
        if (!cancelled) setProfileChecked(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [updateProfile])

  useEffect(() => {
    if (loading || !user || !profileChecked || ran.current) return
    ran.current = true

    let cancelled = false
    ;(async () => {
      let nextUser = user

      if (!hasPulseAccount(user)) {
        const payload = suggestedPulseSetupPayload(user)
        try {
          const res = await api.post('/auth/pulse-setup', payload)
          const portalId = payload.portalId
          markPulseAccountCreated(portalId)
          nextUser = {
            ...res.data.user,
            pulseSetupCompleted: true,
            pulsePortalId: portalId,
          }
          if (!cancelled) updateProfile?.(nextUser)
        } catch (err) {
          if (err.response?.data?.code === 'PORTAL_EXISTS') {
            const retry = { ...payload, portalId: `${payload.portalId}hq`.slice(0, 50) }
            try {
              const res = await api.post('/auth/pulse-setup', retry)
              markPulseAccountCreated(retry.portalId)
              nextUser = {
                ...res.data.user,
                pulseSetupCompleted: true,
                pulsePortalId: retry.portalId,
              }
              if (!cancelled) updateProfile?.(nextUser)
            } catch {
              markPulseAccountCreated(payload.portalId)
            }
          } else {
            markPulseAccountCreated(payload.portalId)
          }
        }
      }

      if (cancelled) return
      const next = getPostLoginPath(nextUser) || PULSE_HOME
      navigate(next === APP_BASE ? PULSE_HOME : next, { replace: true })
    })()

    return () => {
      cancelled = true
    }
  }, [user, loading, profileChecked, navigate, updateProfile])

  return <PulseLoading />
}
