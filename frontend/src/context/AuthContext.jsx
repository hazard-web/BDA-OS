import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import api from '../api'
import { broadcastPulseLogout, clearPulseLogoutOrigin } from '../utils/pulseAuthSync'
import { clearWelcomeCurtainSeen } from '../utils/pulseWelcomeCurtain'
import { endCheckInOnLogout } from '../utils/pulseCheckIn'
import { closeCheckInPip } from '../utils/pulseCheckInPip'

const AuthContext = createContext()

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [exitBusy, setExitBusy] = useState(false)
  const [loading, setLoading] = useState(() => {
    return typeof window !== 'undefined' ? !!localStorage.getItem('token') : false
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
    api.invalidateCache?.('/auth/')
    clearWelcomeCurtainSeen()
    setUser(null)
    broadcastPulseLogout()
  }, [])

  const fetchProfile = useCallback(async () => {
    const controller = new AbortController()
    // 5-second timeout - avoids the 30 s axios global timeout causing a
    // long blank screen when the backend is slow or the token is expired.
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      const res = await api.get('/auth/profile', { signal: controller.signal, __skipCache: true })
      setUser(res.data.user)
    } catch {
      logout()
    } finally {
      clearTimeout(timer)
      setLoading(false)
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
