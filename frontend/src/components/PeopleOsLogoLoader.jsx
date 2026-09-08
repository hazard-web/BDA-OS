import { useId } from 'react'
import PeopleOsMark from './PeopleOsMark'
import './people-os-logo-load.css'

/** People OS mark with a spinning four-colour ring. */
export default function PeopleOsLogoLoader({
  label = 'Loading',
  overlay = false,
  fixed = false,
  className = '',
}) {
  const uid = useId().replace(/:/g, '')
  const mode = fixed ? ' is-fixed' : overlay ? ' is-overlay' : ''
  return (
    <div
      className={`pos-logo-load${mode}${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="pos-logo-load-orbit" aria-hidden="true">
        <svg className="pos-logo-load-ring" viewBox="0 0 80 80">
          <defs>
            <linearGradient id={`pos-ring-${uid}`} x1="8" y1="4" x2="72" y2="76" gradientUnits="userSpaceOnUse">
              <stop stopColor="#e42527" />
              <stop offset="0.33" stopColor="#f5c400" />
              <stop offset="0.66" stopColor="#21a05a" />
              <stop offset="1" stopColor="#2b8aed" />
            </linearGradient>
          </defs>
          <circle cx="40" cy="40" r="32" fill="none" stroke="#eceae6" strokeWidth="3" />
          <circle
            cx="40"
            cy="40"
            r="32"
            fill="none"
            stroke={`url(#pos-ring-${uid})`}
            strokeWidth="3.25"
            strokeLinecap="round"
            strokeDasharray="58 143"
          />
        </svg>
        <PeopleOsMark size={28} />
      </span>
    </div>
  )
}
