import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import api from '../api'
import { broadcastPulseLogout, clearPulseLogoutOrigin } from '../utils/pulseAuthSync'
import { clearWelcomeCurtainSeen } from '../utils/pulseWelcomeCurtain'
import { endCheckInOnLogout } from '../utils/pulseCheckIn'
import { closeCheckInPip } from '../utils/pulseCheckInPip'
import { acknowledgePulseLogin, consumePulseUnloadExit, forcePulseExit } from '../utils/pulseForceExit'

const AuthContext = createContext()

export const useAuth = () => useContext(AuthContext)

function bootAfterTabClose() {
  if (typeof window === 'undefined') return false
  if (!consumePulseUnloadExit()) return false
  forcePulseExit({ reason: 'tab-close' })
  return true
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [exitBusy, setExitBusy] = useState(false)
  const [loading, setLoading] = useState(() => {
    if (typeof window === 'undefined') return false
    // Close tab → Ctrl+T / new visit must sign out before profile loads.
    if (bootAfterTabClose()) return false
    return !!localStorage.getItem('token')
  })
  const userRef = useRef(null)
  userRef.current = user

  // useCallback keeps these function identities stable across renders
  // so consumers that depend on them (useEffect deps, etc.) don't re-fire.
  const startExit = useCallback(() => {
    setExitBusy(true)
  }, [])

  const endExit = useCallback(() => {
    setExitBusy(false)
  }, [])

  const logout = useCallback(() => {
    const email = userRef.current?.email
    try {
      endCheckInOnLogout(email)
      closeCheckInPip()
    } catch {
      /* keep logout resilient */
    }
    localStorage.removeItem('token')
    try {
      localStorage.removeItem('pulsePendingForceExit')
      localStorage.removeItem('pulseSessionAliveAt')
      sessionStorage.removeItem('pulseAuthTabSession')
    } catch {
      /* ignore */
    }
    api.invalidateCache?.('/auth/')
    clearWelcomeCurtainSeen()
    setUser(null)
    broadcastPulseLogout()
  }, [])

  const fetchProfile = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLoading(false)
      return
    }

    let payload = null
    try {
      payload = JSON.parse(atob(token.split('.')[1]))
    } catch {
      payload = null
    }
    if (!payload?.id || (payload.exp && payload.exp * 1000 < Date.now())) {
      logout()
      setLoading(false)
      return
    }

    // Keep the BDA "Opening" gate up while profile loads (Coolify can be slow).
    setLoading(true)

    // Coolify / Atlas cold starts often exceed 5s — that used to force logout
    // and look like a session timeout / onboarding reload loop.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    try {
      const res = await api.get('/auth/profile', { signal: controller.signal, __skipCache: true })
      setUser(res.data.user)
      setLoading(false)
    } catch (err) {
      const status = err?.response?.status
      if (status === 401 || status === 403) {
        logout()
        setLoading(false)
        return
      }
      if (userRef.current) {
        // Keep the in-memory session if profile refresh failed transiently.
        setLoading(false)
        return
      }
      // No profile yet: retry once while the BDA gate stays visible.
      try {
        const retry = await api.get('/auth/profile', { __skipCache: true, timeout: 20000 })
        setUser(retry.data.user)
      } catch (retryErr) {
        const retryStatus = retryErr?.response?.status
        if (retryStatus === 401 || retryStatus === 403) {
          logout()
        }
      } finally {
        setLoading(false)
      }
    } finally {
      clearTimeout(timer)
    }
  }, [logout])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      fetchProfile()
    } else {
      setLoading(false)
    }
  }, [fetchProfile])

  const login = useCallback((token, userData) => {
    localStorage.setItem('token', token)
    api.invalidateCache?.('/auth/')
    clearPulseLogoutOrigin()
    acknowledgePulseLogin()
    try {
      sessionStorage.removeItem('pulseSessionContinue')
    } catch {
      /* ignore */
    }
    setExitBusy(false)
    setUser(userData)
  }, [])

  const updateProfile = useCallback((updatedUser) => {
    setUser(updatedUser)
  }, [])

  // Memoize the context value so children that don't depend on the
  // changing parts of the value don't re-render on every parent update.
  const value = useMemo(
    () => ({ user, loading, exitBusy, startExit, endExit, login, logout, updateProfile }),
    [user, loading, exitBusy, startExit, endExit, login, logout, updateProfile]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
