import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { startCheckInHeartbeat } from '../utils/pulseCheckIn'
import { pingPulseOnline } from '../utils/pulseCheckInApi'

const ONLINE_PING_MS = 45_000

/** Keeps check-in heartbeats + online presence alive app-wide. Sleep / shutdown checks out. */
export default function PulseCheckInHeartbeat() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user?.email) return undefined
    const stopCheckIn = startCheckInHeartbeat(() => user.email)

    const ping = () => {
      void pingPulseOnline()
    }
    ping()
    const pingTimer = window.setInterval(ping, ONLINE_PING_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') ping()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopCheckIn()
      window.clearInterval(pingTimer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user?.email])

  return null
}
