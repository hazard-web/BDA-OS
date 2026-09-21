import { Link } from 'react-router-dom'
import { DESKTOP_ONLY_MESSAGE } from '../../utils/pulseDesktopOnly'
import './auth-shell.css'

/** Full-page notice when someone tries to use BDA OS from a phone. */
export default function DesktopOnlyGate({
  title = 'Desktop only',
  message = DESKTOP_ONLY_MESSAGE,
  showHomeLink = false,
}) {
  return (
    <div className="auth-page auth-desktop-only">
      <div className="auth-desktop-only-card">
        <img src="/bda-logo.png" alt="BDA Technologies" className="auth-desktop-only-logo" />
        <h1>{title}</h1>
        <p>{message}</p>
        {showHomeLink ? (
          <Link to="/login" className="auth-desktop-only-link">
            Back to sign in
          </Link>
        ) : null}
      </div>
    </div>
  )
}
