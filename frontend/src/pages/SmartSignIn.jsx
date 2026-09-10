import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Maximize2, Minimize2 } from 'lucide-react'
import SmartSignInGuide from './SmartSignInGuide'
import { AuthLogoLoader, useAuthRedirect } from '../components/auth/AuthLogoLoader'
import './smart-signin.css'

function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function QrPattern({ seed, size = 25 }) {
  const cells = useMemo(() => {
    const h = hashSeed(seed)
    const grid = Array.from({ length: size }, () => Array(size).fill(false))
    const setBlock = (r0, c0) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const edge = r === 0 || r === 6 || c === 0 || c === 6
          const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4
          grid[r0 + r][c0 + c] = edge || inner
        }
      }
    }
    setBlock(0, 0)
    setBlock(0, size - 7)
    setBlock(size - 7, 0)

    let n = h
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c]) continue
        if ((r < 8 && c < 8) || (r < 8 && c > size - 9) || (r > size - 9 && c < 8)) continue
        n = (Math.imul(n, 1103515245) + 12345) >>> 0
        grid[r][c] = (n & 3) !== 0
      }
    }
    return grid
  }, [seed, size])

  const cell = 100 / size
  return (
    <svg className="ssi-qr-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect width="100" height="100" fill="#fff" />
      {cells.map((row, r) =>
        row.map((on, c) =>
          on ? (
            <rect
              key={`${r}-${c}`}
              x={c * cell}
              y={r * cell}
              width={cell}
              height={cell}
              fill="#4a4a4a"
            />
          ) : null,
        ),
      )}
    </svg>
  )
}

export default function SmartSignIn() {
  const [expanded, setExpanded] = useState(false)
  const { redirecting, onRedirectClick } = useAuthRedirect()

  useEffect(() => {
    if (!expanded) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  return (
    <div className={`ssi-page${redirecting ? ' is-redirecting' : ''}`}>
      <AuthLogoLoader show={redirecting} />

      <div className={`ssi-card${expanded ? ' is-expanded' : ''}`}>
        <section className="ssi-left">
          <a href="/login" className="ssi-brand" aria-label="BDA OS home" onClick={onRedirectClick('/login')}>
            <span className="ssi-mark" aria-hidden="true">
              <i style={{ background: '#e42527' }} />
              <i style={{ background: '#f5c400' }} />
              <i style={{ background: '#21a05a' }} />
              <i style={{ background: '#408dfb' }} />
            </span>
            <span className="ssi-brand-text">BDA OS</span>
          </a>

          <h1 className="ssi-title">Smart Sign-in</h1>

          <div className={`ssi-qr-wrap${expanded ? ' is-open' : ''}`}>
            <div className="ssi-qr-frame">
              <div className="ssi-qr-code">
                <QrPattern seed="people-os-oneauth" />
                <span className="ssi-soon">Coming Soon</span>
              </div>
              <button
                type="button"
                className="ssi-expand"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? (
                  <>
                    <Minimize2 size={14} strokeWidth={2.4} />
                    Minimize
                  </>
                ) : (
                  <>
                    <Maximize2 size={14} strokeWidth={2.4} />
                    Expand
                  </>
                )}
              </button>
            </div>
          </div>

          <p className="ssi-hint">This will be coming soon.</p>

          <div className="ssi-or" role="separator">
            <span>Or</span>
          </div>

          <a href="/login" className="ssi-email-link" onClick={onRedirectClick('/login')}>
            Sign in via email address/mobile number
          </a>
        </section>

        <section className="ssi-right">
          <div className="ssi-right-inner">
            <SmartSignInGuide />
            <h2 className="ssi-steps-title">Steps to sign in</h2>
            <ol className="ssi-steps">
              <li>
                Open the <strong>auth app</strong> on your device.
              </li>
              <li>
                Tap <strong>Scan QR</strong> to continue.
              </li>
              <li>
                This feature will be <strong>coming soon</strong>.
              </li>
            </ol>
          </div>
        </section>
      </div>

      <div className="ssi-copy">
        © {new Date().getFullYear()}, BDA Technologies Private Limited. All Rights Reserved.
      </div>
    </div>
  )
}
