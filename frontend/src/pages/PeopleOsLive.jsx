import { Link } from 'react-router-dom'
import './coming-soon.css'

export default function PeopleOsLive() {
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
          <span>Coming Soon</span>
        </h1>
        <Link to="/coming-soon" className="soon-cta">
          Learn more
        </Link>
      </main>

      <footer className="soon-footer">
        © {new Date().getFullYear()}, BDA Technologies Private Limited. All Rights Reserved.
      </footer>
    </div>
  )
}
