import { Navigate } from 'react-router-dom'
import { PULSE_HOME } from '../utils/pulseEntry'

/**
 * Getting Started (intro slides, checklist, sample data) is parked on branch
 * `pulse/company-later-services`. Restore PulseGettingStarted.jsx + pulse-getting-started.css
 * from that branch, then uncomment the routes in App.jsx.
 *
 * Invited employees sign in to My Space and the welcome curtain.
 */
export default function PulseGettingStarted() {
  return <Navigate to={PULSE_HOME} replace />
}
