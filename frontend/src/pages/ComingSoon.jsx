import { Link, useSearchParams } from 'react-router-dom'
import { APP_BASE } from '../utils/pulseEntry'
import './coming-soon.css'

export default function ComingSoon() {
  const [params] = useSearchParams()
  const provider = params.get('provider')
  const app = params.get('app')
  const title = provider
    ? `Sign in with ${provider}`
    : app
      ? `${app} is coming soon`
      : 'Coming Soon'
  const body = provider
    ? `${provider} sign-in is built in - add ${provider} OAuth keys to the backend .env to enable it.`
    : app
      ? `${app} is on the BDA OS roadmap. Check back soon.`
      : 'This feature is on the way.'

  return (
    <div className="soon-page">
      <header className="soon-nav">
        <Link to="/login" className="soon-brand" aria-label="BDA OS home">
          <span className="soon-mark" aria-hidden="true">
            <i style={{ background: '#e42527' }} />
            <i style={{ background: '#f5c400' }} />
            <i style={{ background: '#21a05a' }} />
            <i style={{ background: '#2b8aed' }} />
          </span>
          <span>BDA OS</span>
        </Link>
        <Link to="/login" className="soon-signin">
          Sign in
        </Link>
      </header>

      <main className="soon-hero">
        <h1>
          <span>{title}</span>
        </h1>
        <p>{body}</p>
        <Link to={APP_BASE} className="soon-cta">
          Back to BDA OS
        </Link>
      </main>

      <footer className="soon-footer">
        © {new Date().getFullYear()}, BDA Technologies Private Limited. All Rights Reserved.
      </footer>
    </div>
  )
}
