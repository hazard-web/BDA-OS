import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AuthPromo from './AuthPromo'
import AuthBg from './AuthBg'
import './auth-shell.css'

export default function AuthShell({
  title = 'Sign in',
  subtitle = 'to access BDA OS',
  headerRight,
  children,
  footer,
  showPromo = true,
}) {
  const [usingKeys, setUsingKeys] = useState(false)

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Tab') setUsingKeys(true)
    }
    const onPointer = () => setUsingKeys(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [])

  return (
    <div className={`auth-page${usingKeys ? ' is-keys' : ''}`}>
      <AuthBg />
      <div className="auth-board">
        <div className="auth-left">
          <div className="auth-top">
            <Link to="/login" className="auth-logo" aria-label="BDA Technologies">
              <img src="/bda-logo.png" alt="BDA Technologies" className="auth-logo-mark" />
            </Link>
            {headerRight}
          </div>

          <p className="auth-title">{title}</p>
          {subtitle ? <p className="auth-subtitle">{subtitle}</p> : null}

          {children}

          {footer ? <div className="auth-footnote">{footer}</div> : null}
        </div>

        {showPromo ? (
          <div className="auth-right">
            <AuthPromo />
          </div>
        ) : null}
      </div>

      <div className="auth-footer">
        © {new Date().getFullYear()}, BDA Technologies Private Limited. All Rights Reserved.
      </div>
    </div>
  )
}
