import { useId } from 'react'
import './people-os-logo-load.css'

const GREEN = '#556B2F'

/** People OS four-square mark with a spinning green ring. */
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
              <stop stopColor={GREEN} />
              <stop offset="0.55" stopColor="#2d8a6e" />
              <stop offset="1" stopColor={GREEN} />
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
        <svg className="people-os-mark" width={28} height={28} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="0" y="0" width="8" height="8" rx="1.6" fill={GREEN} />
          <rect x="10" y="0" width="8" height="8" rx="1.6" fill={GREEN} />
          <rect x="0" y="10" width="8" height="8" rx="1.6" fill={GREEN} />
          <rect x="10" y="10" width="8" height="8" rx="1.6" fill={GREEN} />
        </svg>
      </span>
    </div>
  )
}
