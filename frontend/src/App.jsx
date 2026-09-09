import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import DocumentTitle from './components/DocumentTitle'
import PulseAuthSync from './components/PulseAuthSync'
import PulseLoading from './components/PulseLoading'
import PulseCheckInHeartbeat from './components/PulseCheckInHeartbeat'
import { useAuth } from './context/AuthContext'
import { lockPulsePageZoom } from './utils/pulsePageZoom'
import { closePulseAuxiliaryTab } from './utils/pulseAuthSync'
import { isPulseAuxiliaryTab, isPulseOpenPath, PULSE_SHELL_PATHS } from './utils/pulseOpenPage'

import Login from './pages/Login'
import ComingSoon from './pages/ComingSoon'
import PeopleOsLive from './pages/PeopleOsLive'
import Register from './pages/Register'
import VerifyEmail from './pages/VerifyEmail'
import VerifyAction from './pages/VerifyAction'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
// import SmartSignIn from './pages/SmartSignIn'
import OAuthCallback from './pages/OAuthCallback'
import OAuthCreateAccount from './pages/OAuthCreateAccount'
import HrSetup from './pages/HrSetup'
import PeopleHub from './pages/PeopleHub'
import PulseGettingStarted from './pages/PulseGettingStarted'
import PeopleHome from './pages/PeopleHome'
import PulseCheckInTimer from './pages/PulseCheckInTimer'
import PulseNotes from './pages/PulseNotes'
import AcceptInvite from './pages/AcceptInvite'
import EmployeeOnboard from './pages/EmployeeOnboard'
import AccountPortal from './pages/AccountPortal'

/** Company User auth — Pulse only (no Rohit HR / Team Portal). */
function ProtectedRoute({ children }) {
  const { user, loading, exitBusy } = useAuth()
  const location = useLocation()
  if (loading) {
    if (isPulseOpenPath(location.pathname, location.search)) return children
    const onPulse =
      location.pathname === '/pulse' || location.pathname.startsWith('/pulse/')
    if (onPulse) {
      return <PulseLoading />
    }
    return <div style={{ minHeight: '100vh', background: '#fff' }} aria-hidden="true" />
  }
  if (!user) {
    if (exitBusy) return <PulseLoading label="Signing out" />
    if (isPulseAuxiliaryTab(location.pathname)) {
      closePulseAuxiliaryTab()
      return <div style={{ minHeight: '100vh', background: '#fcfcfa' }} aria-hidden="true" />
    }
    return <Navigate to="/login" replace />
  }
  return children
}

/** Old Rohit / HR / portal URLs → Pulse. */
function LegacyRedirect() {
  return <Navigate to="/pulse" replace />
}

function PulsePageZoomLock() {
  const { pathname } = useLocation()
  const onPulse = pathname === '/pulse' || pathname.startsWith('/pulse/')
  useEffect(() => (onPulse ? lockPulsePageZoom() : undefined), [onPulse])
  return null
}

export default function App() {
  return (
    <>
      <DocumentTitle />
      <PulseAuthSync />
      <PulseCheckInHeartbeat />
      <PulsePageZoomLock />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route path="/oauth/create-account" element={<OAuthCreateAccount />} />
        <Route
          path="/setup"
          element={
            <ProtectedRoute>
              <HrSetup />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pulse"
          element={
            <ProtectedRoute>
              <PeopleHub />
            </ProtectedRoute>
          }
        />
        <Route
          path="/:portalId/settings/service/getting-started"
          element={
            <ProtectedRoute>
              <PulseGettingStarted />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pulse/settings/service/getting-started"
          element={
            <ProtectedRoute>
              <PulseGettingStarted />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pulse/getting-started"
          element={<Navigate to="/pulse/settings/service/getting-started" replace />}
        />
        <Route
          path="/pulse/sample-data"
          element={<Navigate to="/pulse/settings/service/getting-started" replace />}
        />
        <Route path="/pulse/checkin-timer" element={<PulseCheckInTimer />} />
        {PULSE_SHELL_PATHS.map((path) => (
          <Route
            key={path}
            path={path}
            element={
              <ProtectedRoute>
                <PeopleHome />
              </ProtectedRoute>
            }
          />
        ))}
        <Route
          path="/pulse/notes"
          element={
            <ProtectedRoute>
              <PulseNotes />
            </ProtectedRoute>
          }
        />
        <Route
          path="/account/*"
          element={
            <ProtectedRoute>
              <AccountPortal />
            </ProtectedRoute>
          }
        />
        <Route path="/people" element={<Navigate to="/pulse" replace />} />
        <Route path="/people/home" element={<Navigate to="/pulse/home" replace />} />

        {/* <Route path="/smart-signin" element={<SmartSignIn />} /> */}
        <Route path="/coming-soon" element={<ComingSoon />} />
        <Route path="/people-os" element={<PeopleOsLive />} />
        <Route path="/register" element={<Register />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/onboard/:token" element={<EmployeeOnboard />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/verify" element={<VerifyAction />} />
        <Route path="/forgot" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Rohit Team Portal */}
        <Route path="/portal/*" element={<LegacyRedirect />} />
        {/* Rohit account hub / apps launcher */}
        <Route path="/apps/*" element={<LegacyRedirect />} />
        <Route path="/apps" element={<LegacyRedirect />} />
        {/* Rohit corporate HR shell */}
        <Route path="/dashboard/*" element={<LegacyRedirect />} />
        <Route path="/dashboard" element={<LegacyRedirect />} />
        <Route path="/staff/*" element={<LegacyRedirect />} />
        <Route path="/staff" element={<LegacyRedirect />} />
        <Route path="/payslips/*" element={<LegacyRedirect />} />
        <Route path="/payslips" element={<LegacyRedirect />} />
        <Route path="/leave/*" element={<LegacyRedirect />} />
        <Route path="/leave" element={<LegacyRedirect />} />
        <Route path="/attendance/*" element={<LegacyRedirect />} />
        <Route path="/attendance" element={<LegacyRedirect />} />
        <Route path="/performance/*" element={<LegacyRedirect />} />
        <Route path="/performance" element={<LegacyRedirect />} />
        <Route path="/tasks/*" element={<LegacyRedirect />} />
        <Route path="/tasks" element={<LegacyRedirect />} />
        <Route path="/settings/*" element={<LegacyRedirect />} />
        <Route path="/settings" element={<LegacyRedirect />} />
        <Route path="/announcements/*" element={<LegacyRedirect />} />
        <Route path="/announcements" element={<LegacyRedirect />} />
        <Route path="/audit-logs/*" element={<LegacyRedirect />} />
        <Route path="/audit-logs" element={<LegacyRedirect />} />
        <Route path="/staff-support/*" element={<LegacyRedirect />} />
        <Route path="/staff-support" element={<LegacyRedirect />} />
        <Route path="/leave-requests" element={<LegacyRedirect />} />
        <Route path="/leave-policy" element={<LegacyRedirect />} />
        <Route path="/profile" element={<LegacyRedirect />} />
        <Route path="/generate" element={<LegacyRedirect />} />

        <Route path="/" element={<Navigate to="/pulse" replace />} />
        <Route path="*" element={<Navigate to="/pulse" replace />} />
      </Routes>
    </>
  )
}
